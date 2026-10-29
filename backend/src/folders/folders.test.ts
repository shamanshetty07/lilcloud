import { describe, test, expect, beforeAll } from "bun:test";
import { enabled, prisma, storage, reset, makeUser, http, form } from "../test-utils/setup.ts";

describe.skipIf(!enabled)("folders",()=>{
    let a:Awaited<ReturnType<typeof makeUser>>, b:typeof a, A:ReturnType<typeof http>, B:ReturnType<typeof http>;
    beforeAll(async()=>{ await reset(); a=await makeUser("alice"); b=await makeUser("bob"); A=http(a.token); B=http(b.token); });

    const mk=async(c:ReturnType<typeof http>,name:string,parentId?:string|null)=>(await c("POST","/folders",{name,parentId})).body.folder as {id:string,name:string,parentId:string|null};

    test("requires authentication",async()=>{
        expect((await http()("GET","/folders/root")).status).toBe(401);
    });

    test("creates, nests, browses and shows a breadcrumb back to the root",async()=>{
        const docs=await mk(A,"Docs");
        const work=await mk(A,"Work",docs.id);
        const root=(await A("GET","/folders/root")).body;
        expect(root.folders.map((f:any)=>f.name)).toContain("Docs");
        expect(root.folders.map((f:any)=>f.name)).not.toContain("Work");
        const inner=(await A("GET",`/folders/${work.id}`)).body;
        expect(inner.folder.parentId).toBe(docs.id);
        expect(inner.breadcrumb.map((c:any)=>c.name)).toEqual(["Docs","Work"]);
    });

    test("renames a folder",async()=>{
        const f=await mk(A,"Old");
        const r=await A("PATCH",`/folders/${f.id}`,{name:"New"});
        expect(r.status).toBe(200);
        expect(r.body.folder.name).toBe("New");
    });

    test("duplicate sibling names are rejected ignoring case, but other parents may reuse a name",async()=>{
        const p=await mk(A,"DupParent");
        await mk(A,"Photos",p.id);
        expect((await A("POST","/folders",{name:"photos",parentId:p.id})).status).toBe(409);
        expect((await A("POST","/folders",{name:"Photos"})).status).toBe(201);
        expect((await A("POST","/folders",{name:"PHOTOS"})).status).toBe(409);
        expect((await B("POST","/folders",{name:"Photos"})).status).toBe(201);
        const other=await mk(A,"Other",p.id);
        expect((await A("PATCH",`/folders/${other.id}`,{name:"PHOTOS"})).status).toBe(409);
    });

    test("validates names",async()=>{
        for(const name of ["","   ","a/b","a\\b","..","."]) expect((await A("POST","/folders",{name})).status).toBe(400);
        expect((await A("POST","/folders",{name:"x".repeat(101)})).status).toBe(400);
        expect((await A("POST","/folders",{name:"ok",extra:1})).status).toBe(400);
        expect((await A("POST","/folders",{name:"ok",parentId:"not-a-uuid"})).status).toBe(400);
    });

    test("uploads into a folder; root files and the legacy list keep working",async()=>{
        const f=await mk(A,"Up");
        const inFolder=(await A("POST","/files/upload",form("in.txt","hello",{folderId:f.id}))).body.file;
        const atRoot=(await A("POST","/files/upload",form("root.txt","hello"))).body.file;
        expect(inFolder.folderId).toBe(f.id);
        expect(atRoot.folderId).toBeNull();
        const legacy=(await A("GET","/files")).body.files.map((x:any)=>x.id);
        expect(legacy).toEqual(expect.arrayContaining([inFolder.id,atRoot.id]));
        expect((await A("GET","/files?folderId=root")).body.files.map((x:any)=>x.id)).toEqual(expect.arrayContaining([atRoot.id]));
        expect((await A("GET","/files?folderId=root")).body.files.map((x:any)=>x.id)).not.toContain(inFolder.id);
        expect((await A("GET",`/files?folderId=${f.id}`)).body.files.map((x:any)=>x.id)).toEqual([inFolder.id]);
        const dl=await A("GET",`/files/${atRoot.id}/download`);
        expect(dl.status).toBe(200); expect(dl.text).toBe("hello");
    });

    test("moves files between folders and back to the root",async()=>{
        const one=await mk(A,"MoveOne"), two=await mk(A,"MoveTwo");
        const file=(await A("POST","/files/upload",form("m.txt","x",{folderId:one.id}))).body.file;
        expect((await A("PATCH",`/files/${file.id}/move`,{folderId:two.id})).body.file.folderId).toBe(two.id);
        expect((await A("GET",`/folders/${two.id}`)).body.files.map((x:any)=>x.id)).toEqual([file.id]);
        expect((await A("PATCH",`/files/${file.id}/move`,{folderId:null})).body.file.folderId).toBeNull();
    });

    test("moves folders, and rejects moving into itself or a descendant",async()=>{
        const top=await mk(A,"CycTop"), mid=await mk(A,"CycMid",top.id), leaf=await mk(A,"CycLeaf",mid.id);
        const bad=[[top.id,top.id],[top.id,mid.id],[top.id,leaf.id],[mid.id,leaf.id]];
        for(const [id,target] of bad) expect((await A("PATCH",`/folders/${id}/move`,{folderId:target})).status).toBe(400);
        expect((await A("GET",`/folders/${leaf.id}`)).body.breadcrumb.map((c:any)=>c.name)).toEqual(["CycTop","CycMid","CycLeaf"]);
        expect((await A("PATCH",`/folders/${leaf.id}/move`,{folderId:null})).body.folder.parentId).toBeNull();
        expect((await A("PATCH",`/folders/${top.id}/move`,{folderId:leaf.id})).status).toBe(200);
        expect((await A("GET",`/folders/${mid.id}`)).body.breadcrumb.map((c:any)=>c.name)).toEqual(["CycLeaf","CycTop","CycMid"]);
    });

    test("a move that would collide with a sibling name is a conflict",async()=>{
        const p=await mk(A,"CollideP"); await mk(A,"same",p.id);
        const x=await mk(A,"same");
        expect((await A("PATCH",`/folders/${x.id}/move`,{folderId:p.id})).status).toBe(409);
    });

    test("other users cannot see or change someone else's folders or files",async()=>{
        const f=await mk(A,"Private");
        const file=(await A("POST","/files/upload",form("p.txt","secret",{folderId:f.id}))).body.file;
        expect((await B("GET",`/folders/${f.id}`)).status).toBe(404);
        expect((await B("PATCH",`/folders/${f.id}`,{name:"hacked"})).status).toBe(404);
        expect((await B("PATCH",`/folders/${f.id}/move`,{folderId:null})).status).toBe(404);
        expect((await B("DELETE",`/folders/${f.id}`)).status).toBe(404);
        expect((await B("POST","/folders",{name:"sneaky",parentId:f.id})).status).toBe(404);
        expect((await B("POST","/files/upload",form("b.txt","x",{folderId:f.id}))).status).toBe(404);
        expect((await B("GET",`/files?folderId=${f.id}`)).status).toBe(404);
        expect((await B("PATCH",`/files/${file.id}/move`,{folderId:null})).status).toBe(404);
        const mine=await mk(B,"Mine");
        expect((await B("PATCH",`/folders/${mine.id}/move`,{folderId:f.id})).status).toBe(404);
        const bFile=(await B("POST","/files/upload",form("bf.txt","x"))).body.file;
        expect((await B("PATCH",`/files/${bFile.id}/move`,{folderId:f.id})).status).toBe(404);
        expect((await B("GET",`/files/${file.id}/download`)).status).toBe(404);
        expect((await prisma.file.count({where:{file_name:"b.txt"}}))).toBe(0);
        expect((await A("GET","/folders/not-a-uuid")).status).toBe(404);
        expect((await A("GET","/folders/123e4567-e89b-42d3-a456-426614174000")).status).toBe(404);
        expect((await A("POST","/files/upload",form("bad.txt","x",{folderId:"nope"}))).status).toBe(400);
    });

    test("trashing a folder keeps its subtree recoverable until permanently deleted",async()=>{
        const top=await mk(A,"DelTop"), sub=await mk(A,"DelSub",top.id);
        const f1=(await A("POST","/files/upload",form("d1.txt","1",{folderId:top.id}))).body.file;
        const f2=(await A("POST","/files/upload",form("d2.txt","2",{folderId:sub.id}))).body.file;
        const keep=(await A("POST","/files/upload",form("keep.txt","3"))).body.file;
        const r=await A("DELETE",`/folders/${top.id}`);
        expect(r.status).toBe(204);
        expect(await prisma.folder.count({where:{folder_id:{in:[top.id,sub.id]},deleted_at:{not:null}}})).toBe(2);
        expect(await prisma.file.count({where:{file_id:{in:[f1.id,f2.id]},deleted_at:{not:null}}})).toBe(2);
        expect((await A("GET",`/folders/${top.id}`)).status).toBe(404);
        const trash=(await A("GET","/files/trash")).body;
        expect(trash.folders.map((folder:any)=>folder.id)).toContain(top.id);
        expect(trash.folders.map((folder:any)=>folder.id)).not.toContain(sub.id);
        expect(trash.files.map((file:any)=>file.id)).not.toContain(f1.id);
        expect(trash.files.map((file:any)=>file.id)).not.toContain(f2.id);
        expect((await A("POST",`/folders/trash/${top.id}/restore`)).status).toBe(204);
        expect((await A("GET",`/folders/${top.id}`)).status).toBe(200);
        expect((await A("GET",`/files/${f1.id}/download`)).status).toBe(200);
        expect((await A("DELETE",`/folders/${top.id}`)).status).toBe(204);
        const purged=await A("DELETE",`/folders/trash/${top.id}/permanent`);
        expect(purged.status).toBe(200);
        expect(purged.body).toEqual({deletedFolders:2,deletedFiles:2});
        expect(await prisma.folder.count({where:{folder_id:{in:[top.id,sub.id]}}})).toBe(0);
        expect(await prisma.file.count({where:{file_id:{in:[f1.id,f2.id]}}})).toBe(0);
        await expect(storage.open(f1.id)).rejects.toMatchObject({code:"NOT_FOUND"});
        await expect(storage.open(f2.id)).rejects.toMatchObject({code:"NOT_FOUND"});
        await expect(storage.open(keep.id)).resolves.toBeDefined();
        expect((await A("GET",`/files/${keep.id}/download`)).status).toBe(200);
    });

    test("nesting is capped",async()=>{
        let parent:string|null=null;
        for(let i=0;i<50;i++) parent=(await mk(A,`deep${i}`,parent)).id;
        expect((await A("POST","/folders",{name:"too-deep",parentId:parent})).status).toBe(400);
    });

    test("the database refuses a folder that is its own parent",async()=>{
        const f=await mk(A,"selfref");
        await expect((async()=>prisma.folder.update({where:{folder_id:f.id},data:{parent_folder_id:f.id}}))()).rejects.toBeDefined();
    });
});
