import { describe, test, expect, beforeAll } from "bun:test";
import { enabled, prisma, reset, makeUser, http, form } from "../test-utils/setup.ts";

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

describe.skipIf(!enabled)("recently viewed",()=>{
    let a:Awaited<ReturnType<typeof makeUser>>, b:typeof a, c:typeof a, A:ReturnType<typeof http>, B:ReturnType<typeof http>, C:ReturnType<typeof http>;
    beforeAll(async()=>{
        await reset();
        a=await makeUser("alice"); b=await makeUser("bob"); c=await makeUser("carol");
        A=http(a.token); B=http(b.token); C=http(c.token);
    });

    const upload=async(name:string)=>(await A("POST","/files/upload",form(name,name))).body.file.id as string;
    const recent=async(c=A,q="")=>(await c("GET",`/files/recent${q}`)).body;

    test("requires authentication",async()=>{
        expect((await http()("GET","/files/recent")).status).toBe(401);
        expect((await http()("POST","/files/123e4567-e89b-42d3-a456-426614174000/view")).status).toBe(401);
    });

    test("opening a file records it with its metadata; viewing again keeps one row and bumps the time",async()=>{
        const id=await upload("first.txt");
        expect((await recent()).items).toEqual([]);
        const v1=(await A("POST",`/files/${id}/view`)).body.viewedAt;
        await sleep(15);
        const v2=(await A("POST",`/files/${id}/view`)).body.viewedAt;
        expect(new Date(v2).getTime()).toBeGreaterThan(new Date(v1).getTime());
        expect(await prisma.fileViewHistory.count({where:{user_id:a.id,file_id:id}})).toBe(1);
        const items=(await recent()).items;
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({id,name:"first.txt",type:"text/plain",viewedAt:v2});
    });

    test("lists newest view first and pages with a cursor",async()=>{
        const u=await makeUser("pager"), U=http(u.token);
        const ids:string[]=[];
        for(const n of ["a","b","c","d","e"]) ids.push((await U("POST","/files/upload",form(`${n}.txt`,n))).body.file.id);
        for(const id of ids){ await U("POST",`/files/${id}/view`); await sleep(5); }
        await U("POST",`/files/${ids[0]}/view`); // a is now the most recent
        const page1=await recent(U,"?limit=2");
        expect(page1.items.map((i:any)=>i.id)).toEqual([ids[0],ids[4]]);
        expect(page1.nextCursor).toBeTruthy();
        const page2=await recent(U,`?limit=2&cursor=${page1.nextCursor}`);
        expect(page2.items.map((i:any)=>i.id)).toEqual([ids[3],ids[2]]);
        const page3=await recent(U,`?limit=2&cursor=${page2.nextCursor}`);
        expect(page3.items.map((i:any)=>i.id)).toEqual([ids[1]]);
        expect(page3.nextCursor).toBeNull();
    });

    test("limits are capped and bad cursors are rejected",async()=>{
        expect((await A("GET","/files/recent?limit=100000")).status).toBe(200);
        expect((await A("GET","/files/recent?cursor=garbage")).status).toBe(400);
        expect((await A("GET","/files/recent?limit=1&limit=2")).status).toBe(400);
    });

    test("only an explicit view records: listing, downloading and fetching metadata do not",async()=>{
        const id=await upload("quiet.txt");
        const before=await prisma.fileViewHistory.count();
        await A("GET","/files"); await A("GET","/files/usage"); await A("GET",`/files/${id}/download`); await A("GET","/files/recent");
        expect(await prisma.fileViewHistory.count()).toBe(before);
    });

    test("each user only sees their own history",async()=>{
        const id=await upload("mine.txt");
        await A("POST",`/files/${id}/view`);
        expect((await recent(A)).items.map((i:any)=>i.id)).toContain(id);
        expect((await recent(B)).items).toEqual([]);
    });

    test("viewing a file you cannot access is a 404 and records nothing",async()=>{
        const id=await upload("secret.txt");
        const before=await prisma.fileViewHistory.count();
        expect((await B("POST",`/files/${id}/view`)).status).toBe(404);
        expect((await A("POST","/files/not-a-uuid/view")).status).toBe(404);
        expect((await A("POST","/files/123e4567-e89b-42d3-a456-426614174000/view")).status).toBe(404);
        expect(await prisma.fileViewHistory.count()).toBe(before);
    });

    test("a view through a group is recorded for the viewer, not the uploader, and stops showing once access ends",async()=>{
        const g=(await A("POST","/groups",{name:"Team"})).body.group;
        await A("POST",`/groups/${g.id}/members`,{identifier:b.username});
        const fileId=(await A("POST",`/groups/${g.id}/files/upload`,form("shared.txt","s"))).body.file.id;
        expect((await B("POST",`/groups/${g.id}/files/${fileId}/view`)).status).toBe(200);
        expect(await prisma.fileViewHistory.count({where:{user_id:b.id,file_id:fileId}})).toBe(1);
        expect(await prisma.fileViewHistory.count({where:{user_id:a.id,file_id:fileId}})).toBe(0);
        const items=(await recent(B)).items;
        expect(items.map((i:any)=>i.id)).toContain(fileId);
        // the generic endpoint honours the same membership
        expect((await B("POST",`/files/${fileId}/view`)).status).toBe(200);
        // outsiders cannot view through the group
        expect((await C("POST",`/groups/${g.id}/files/${fileId}/view`)).status).toBe(404);
        expect((await C("POST",`/files/${fileId}/view`)).status).toBe(404);
        // removal: the history row remains but the unreadable file is hidden
        await A("DELETE",`/groups/${g.id}/members/${b.id}`);
        expect((await recent(B)).items.map((i:any)=>i.id)).not.toContain(fileId);
        expect((await B("POST",`/files/${fileId}/view`)).status).toBe(404);
    });

    test("trashed files drop out of the history and return when restored",async()=>{
        const id=await upload("gone.txt");
        await A("POST",`/files/${id}/view`);
        await A("DELETE",`/files/${id}`);
        expect((await recent()).items.map((i:any)=>i.id)).not.toContain(id);
        expect(await prisma.fileViewHistory.count({where:{file_id:id}})).toBe(1);
        expect((await A("GET","/files/trash")).body.files.map((f:any)=>f.id)).toContain(id);
        expect((await A("POST",`/files/trash/${id}/restore`)).status).toBe(204);
        expect((await recent()).items.map((i:any)=>i.id)).toContain(id);
    });

    test("the database enforces one row per user and file",async()=>{
        const id=await upload("uniq.txt");
        await prisma.fileViewHistory.create({data:{user_id:a.id,file_id:id}});
        await expect((async()=>prisma.fileViewHistory.create({data:{user_id:a.id,file_id:id}}))()).rejects.toBeDefined();
    });
});
