import { describe, test, expect, beforeAll } from "bun:test";
import { enabled, prisma, storage, reset, makeUser, http, form } from "../test-utils/setup.ts";

type U=Awaited<ReturnType<typeof makeUser>>;

describe.skipIf(!enabled)("storage groups",()=>{
    let a:U, b:U, c:U, d:U, A:ReturnType<typeof http>, B:ReturnType<typeof http>, C:ReturnType<typeof http>, D:ReturnType<typeof http>;
    beforeAll(async()=>{
        await reset();
        a=await makeUser("alice"); b=await makeUser("bob"); c=await makeUser("carol"); d=await makeUser("dave");
        A=http(a.token); B=http(b.token); C=http(c.token); D=http(d.token);
    });

    const group=async(name="Team",members:U[]=[])=>{
        const g=(await A("POST","/groups",{name})).body.group as {id:string};
        for(const m of members) await A("POST",`/groups/${g.id}/members`,{identifier:m.username});
        return g;
    };
    const groupUpload=async(c:ReturnType<typeof http>,gid:string,name="g.txt",content="shared")=>(await c("POST",`/groups/${gid}/files/upload`,form(name,content)));

    test("requires authentication",async()=>{
        expect((await http()("GET","/groups")).status).toBe(401);
    });

    test("creating a group makes the creator its admin and lists it for them only",async()=>{
        const g=(await A("POST","/groups",{name:"College Project Team"})).body.group;
        expect(g).toMatchObject({name:"College Project Team",role:"admin",memberCount:1,fileCount:0});
        expect((await A("GET","/groups")).body.groups.map((x:any)=>x.id)).toContain(g.id);
        expect((await B("GET","/groups")).body.groups).toEqual([]);
        const members=(await A("GET",`/groups/${g.id}/members`)).body.members;
        expect(members).toMatchObject([{userId:a.id,username:a.username,role:"admin"}]);
        expect(members[0].joinedAt).toBeTruthy();
        expect(members[0].email).toBeUndefined();
    });

    test("validates group names",async()=>{
        for(const name of ["","  ","a/b"]) expect((await A("POST","/groups",{name})).status).toBe(400);
    });

    test("admins add members by username or email; duplicates and unknown users are refused",async()=>{
        const g=await group();
        expect((await A("POST",`/groups/${g.id}/members`,{identifier:b.username})).status).toBe(201);
        expect((await A("POST",`/groups/${g.id}/members`,{identifier:c.email.toUpperCase()})).status).toBe(201);
        expect((await A("POST",`/groups/${g.id}/members`,{identifier:b.username})).status).toBe(409);
        expect((await A("POST",`/groups/${g.id}/members`,{identifier:"nobody-here"})).status).toBe(404);
        expect(await prisma.groupMember.count({where:{group_id:g.id}})).toBe(3);
        expect((await B("GET","/groups")).body.groups.map((x:any)=>x.id)).toContain(g.id);
    });

    test("the database refuses duplicate memberships and duplicate file links",async()=>{
        const g=await group("Dup",[b]);
        await expect((async()=>prisma.groupMember.create({data:{group_id:g.id,user_id:b.id}}))()).rejects.toBeDefined();
        const f=(await A("POST","/files/upload",form("d.txt","d"))).body.file;
        await prisma.groupFile.create({data:{group_id:g.id,file_id:f.id,shared_by:a.id}});
        await expect((async()=>prisma.groupFile.create({data:{group_id:g.id,file_id:f.id,shared_by:a.id}}))()).rejects.toBeDefined();
    });

    test("only admins can manage the group; regular members and outsiders cannot",async()=>{
        const g=await group("Perms",[b]);
        expect((await B("POST",`/groups/${g.id}/members`,{identifier:c.username})).status).toBe(403);
        expect((await B("PATCH",`/groups/${g.id}`,{name:"Hijack"})).status).toBe(403);
        expect((await B("DELETE",`/groups/${g.id}`)).status).toBe(403);
        expect((await B("PATCH",`/groups/${g.id}/members/${b.id}`,{role:"admin"})).status).toBe(403);
        expect((await B("DELETE",`/groups/${g.id}/members/${a.id}`)).status).toBe(403);
        for(const [m,p,body] of [["GET",`/groups/${g.id}`],["GET",`/groups/${g.id}/members`],["POST",`/groups/${g.id}/members`,{identifier:d.username}],["PATCH",`/groups/${g.id}`,{name:"x"}],["DELETE",`/groups/${g.id}`],["GET",`/groups/${g.id}/files`]] as [string,string,any?][]){
            expect((await C(m,p,body)).status).toBe(404);
        }
        expect((await A("GET",`/groups/${g.id}`)).body.group.name).toBe("Perms");
        expect((await A("GET","/groups/not-a-uuid")).status).toBe(404);
        expect((await A("DELETE",`/groups/${g.id}/members/abc`)).status).toBe(404);
    });

    test("admins rename the group and manage roles; any admin may delete it",async()=>{
        const g=await group("Roles",[b]);
        expect((await A("PATCH",`/groups/${g.id}`,{name:"Renamed"})).body.group.name).toBe("Renamed");
        expect((await A("PATCH",`/groups/${g.id}/members/${b.id}`,{role:"admin"})).body.member.role).toBe("admin");
        expect((await B("DELETE",`/groups/${g.id}`)).status).toBe(204);
        expect((await A("GET",`/groups/${g.id}`)).status).toBe(404);
    });

    test("members upload to the group, others list and download, and each file shows who shared it and when",async()=>{
        const g=await group("Files",[b,c]);
        const up=await groupUpload(B,g.id,"notes.txt","from bob");
        expect(up.status).toBe(201);
        const list=(await C("GET",`/groups/${g.id}/files`)).body.files;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({id:up.body.file.id,name:"notes.txt",uploadedBy:{id:b.id,name:b.username}});
        expect(list[0].sharedAt).toBeTruthy();
        const dl=await C("GET",`/groups/${g.id}/files/${list[0].id}/download`);
        expect(dl.status).toBe(200); expect(dl.text).toBe("from bob");
        expect((await A("GET",`/groups`)).body.groups.find((x:any)=>x.id===g.id).fileCount).toBe(1);
    });

    test("non-members cannot upload, list, or download group files, even knowing every id",async()=>{
        const g=await group("Closed",[b]);
        const fileId=(await groupUpload(B,g.id,"x.txt")).body.file.id;
        const before=await prisma.file.count();
        expect((await groupUpload(D,g.id,"evil.txt")).status).toBe(404);
        expect(await prisma.file.count()).toBe(before);
        expect((await D("GET",`/groups/${g.id}/files`)).status).toBe(404);
        expect((await D("GET",`/groups/${g.id}/files/${fileId}/download`)).status).toBe(404);
        expect((await D("GET",`/files/${fileId}/download`)).status).toBe(404);
        expect((await D("POST",`/groups/${g.id}/files`,{fileId})).status).toBe(404);
        const other=await group("Other",[d]);
        expect((await D("GET",`/groups/${other.id}/files/${fileId}/download`)).status).toBe(404);
    });

    test("group files do not leak into members' private listings and members cannot delete them",async()=>{
        const g=await group("Private",[b]);
        const fileId=(await groupUpload(A,g.id,"pub.txt")).body.file.id;
        expect((await B("GET","/files")).body.files.map((f:any)=>f.id)).not.toContain(fileId);
        expect((await A("GET","/files")).body.files.map((f:any)=>f.id)).toContain(fileId);
        expect((await B("DELETE",`/files/${fileId}`)).status).toBe(404);
        expect((await B("PATCH",`/files/${fileId}/move`,{folderId:null})).status).toBe(404);
        expect((await B("GET",`/files/${fileId}/download`)).status).toBe(200);
    });

    test("group uploads cannot also pick a folder, and bad ids are rejected",async()=>{
        const g=await group("NoFolder");
        const f=(await A("POST","/folders",{name:"F"})).body.folder;
        expect((await A("POST",`/groups/${g.id}/files/upload`,form("a.txt","a",{folderId:f.id}))).status).toBe(400);
        expect((await A("GET",`/groups/${g.id}/files/not-a-uuid/download`)).status).toBe(404);
        expect((await A("POST","/groups/not-a-uuid/files/upload",form("a.txt","a"))).status).toBe(404);
        expect((await groupUpload(A,g.id,"run.sh")).status).toBe(415);
    });

    test("removing a member revokes group access immediately but keeps their files in the group and their other access",async()=>{
        const g=await group("Revoke",[b,c]);
        const bobsFile=(await groupUpload(B,g.id,"bobs.txt","bob wrote this")).body.file.id;
        const alicesFile=(await groupUpload(A,g.id,"alices.txt","alice wrote this")).body.file.id;
        await prisma.filePermission.create({data:{file_id:alicesFile,user_id:b.id,permission:"READ"}});
        expect((await B("GET",`/groups/${g.id}/files/${alicesFile}/download`)).status).toBe(200);
        expect((await B("DELETE",`/groups/${g.id}/members/${b.id}`)).status).toBe(204);
        expect((await B("GET",`/groups/${g.id}/files`)).status).toBe(404);
        expect((await B("GET",`/groups/${g.id}/files/${alicesFile}/download`)).status).toBe(404);
        expect((await groupUpload(B,g.id)).status).toBe(404);
        expect((await B("GET",`/files/${alicesFile}/download`)).status).toBe(200);
        expect((await B("GET",`/files/${bobsFile}/download`)).status).toBe(200);
        const dl=await C("GET",`/groups/${g.id}/files/${bobsFile}/download`);
        expect(dl.status).toBe(200); expect(dl.text).toBe("bob wrote this");
        expect((await C("GET",`/groups/${g.id}/files`)).body.files.map((f:any)=>f.id)).toContain(bobsFile);
        expect((await A("DELETE",`/groups/${g.id}/members/${c.id}`)).status).toBe(204);
        expect((await C("GET",`/groups/${g.id}/files/${bobsFile}/download`)).status).toBe(404);
    });

    test("a group always keeps at least one admin",async()=>{
        const g=await group("LastAdmin",[b]);
        expect((await A("DELETE",`/groups/${g.id}/members/${a.id}`)).status).toBe(409);
        expect((await A("PATCH",`/groups/${g.id}/members/${a.id}`,{role:"member"})).status).toBe(409);
        expect((await A("PATCH",`/groups/${g.id}/members/${b.id}`,{role:"admin"})).status).toBe(200);
        expect((await A("DELETE",`/groups/${g.id}/members/${a.id}`)).status).toBe(204);
        expect((await A("GET",`/groups/${g.id}`)).status).toBe(404);
        expect((await B("DELETE",`/groups/${g.id}/members/${b.id}`)).status).toBe(409);
        expect((await B("DELETE",`/groups/${g.id}/members/${d.id}`)).status).toBe(404);
    });

    test("two admins demoting each other at once cannot leave the group without an admin",async()=>{
        const g=await group("Race",[b]);
        await A("PATCH",`/groups/${g.id}/members/${b.id}`,{role:"admin"});
        await Promise.all([
            A("PATCH",`/groups/${g.id}/members/${b.id}`,{role:"member"}),
            B("PATCH",`/groups/${g.id}/members/${a.id}`,{role:"member"})
        ]);
        expect(await prisma.groupMember.count({where:{group_id:g.id,role:"admin"}})).toBe(1);
    });

    test("sharing an existing file links it without copying; one file can be in many groups; duplicates are refused",async()=>{
        const g1=await group("S1",[b]), g2=await group("S2",[b]);
        const mine=(await A("POST","/files/upload",form("s.txt","once"))).body.file;
        const filesBefore=await prisma.file.count();
        expect((await A("POST",`/groups/${g1.id}/files`,{fileId:mine.id})).status).toBe(201);
        expect((await A("POST",`/groups/${g2.id}/files`,{fileId:mine.id})).status).toBe(201);
        expect((await A("POST",`/groups/${g1.id}/files`,{fileId:mine.id})).status).toBe(409);
        expect(await prisma.file.count()).toBe(filesBefore);
        expect(await prisma.groupFile.count({where:{file_id:mine.id}})).toBe(2);
        const bobs=(await B("POST","/files/upload",form("b.txt","b"))).body.file;
        expect((await A("POST",`/groups/${g1.id}/files`,{fileId:bobs.id})).status).toBe(404);
        expect((await A("POST",`/groups/${g1.id}/files`,{fileId:"nope"})).status).toBe(400);
        expect((await A("DELETE",`/groups/${g1.id}/files/${mine.id}`)).status).toBe(204);
        expect((await B("GET",`/groups/${g2.id}/files/${mine.id}/download`)).status).toBe(200);
        expect((await B("GET",`/groups/${g1.id}/files/${mine.id}/download`)).status).toBe(404);
        expect((await A("GET",`/files/${mine.id}/download`)).status).toBe(200);
    });

    test("only the sharer or an admin can remove a file from a group, and that never deletes the file",async()=>{
        const g=await group("Unlink",[b,c]);
        const fileId=(await groupUpload(B,g.id,"u.txt")).body.file.id;
        expect((await C("DELETE",`/groups/${g.id}/files/${fileId}`)).status).toBe(403);
        expect((await A("DELETE",`/groups/${g.id}/files/${fileId}`)).status).toBe(204);
        expect(await prisma.file.count({where:{file_id:fileId}})).toBe(1);
        const second=(await groupUpload(B,g.id,"u2.txt")).body.file.id;
        expect((await B("DELETE",`/groups/${g.id}/files/${second}`)).status).toBe(204);
        expect((await B("DELETE",`/groups/${g.id}/files/${second}`)).status).toBe(404);
    });

    test("deleting a group keeps the files and the stored content",async()=>{
        const g=await group("Gone",[b]);
        const fileId=(await groupUpload(B,g.id,"keep.txt","still here")).body.file.id;
        expect((await A("DELETE",`/groups/${g.id}`)).status).toBe(204);
        expect(await prisma.groupMember.count({where:{group_id:g.id}})).toBe(0);
        expect(await prisma.groupFile.count({where:{group_id:g.id}})).toBe(0);
        await expect(storage.open(fileId)).resolves.toBeDefined();
        expect((await B("GET",`/files/${fileId}/download`)).text).toBe("still here");
        expect((await A("GET",`/files/${fileId}/download`)).status).toBe(404);
    });

    test("group uploads count against the uploader's quota like any other upload",async()=>{
        const g=await group("Quota",[b]);
        const before=(await B("GET","/files/usage")).body.usedBytes;
        await groupUpload(B,g.id,"q.txt","12345");
        expect((await B("GET","/files/usage")).body.usedBytes).toBe(before+5);
    });
});
