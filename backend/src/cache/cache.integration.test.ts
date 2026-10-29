import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn, setSystemTime } from "bun:test";
import pg from "pg";
import { enabled, prisma, reset, makeUser, http, form } from "../test-utils/setup.ts";
import { FakeRedis } from "../test-utils/fake-redis.ts";

const { setRedis } = await import("./redis.ts");
const { resetCacheState } = await import("./cache.ts");

type U=Awaited<ReturnType<typeof makeUser>>;

describe.skipIf(!enabled)("redis cache",()=>{
    let redis:FakeRedis, a:U, b:U, c:U, A:ReturnType<typeof http>, B:ReturnType<typeof http>, C:ReturnType<typeof http>;
    let sql:ReturnType<typeof spyOn>;
    const dbQueries=()=>sql.mock.calls.map((c:any)=>String(c[0]?.text ?? c[0])).filter((q:string)=>!q.includes('"users"."is_active"'));
    const count=(table:string)=>dbQueries().filter((q:string)=>q.includes(`"public"."${table}"`)).length;

    beforeAll(()=>{ sql=spyOn(pg.Client.prototype as any,"query"); });
    afterAll(()=>{ setRedis(null); setSystemTime(); });
    beforeEach(async()=>{
        redis=new FakeRedis(); setRedis(redis); resetCacheState();
        await reset();
        a=await makeUser("alice"); b=await makeUser("bob"); c=await makeUser("carol");
        A=http(a.token); B=http(b.token); C=http(c.token);
        sql.mockClear();
    });

    const upload=async(U=A,name="f.txt",fields:Record<string,string>={})=>(await U("POST","/files/upload",form(name,name,fields))).body.file.id as string;
    const folder=async(U=A,name="docs",parentId:string|null=null)=>(await U("POST","/folders",{name,parentId})).body.folder.id as string;
    const ids=(res:{body:any})=>res.body.files.map((f:any)=>f.id).sort();
    const touchDb=()=>prisma.file.updateMany({data:{file_name:"changed-behind-the-cache"}});

    describe("folder contents and file lists",()=>{
        test("second read is a cache hit and runs no database queries",async()=>{
            await upload();
            const first=await A("GET","/folders/root");
            expect(dbQueries().length).toBeGreaterThan(0);
            sql.mockClear();
            const second=await A("GET","/folders/root");
            expect(second.body).toEqual(first.body);
            expect(dbQueries()).toEqual([]);
        });

        test("response is identical with and without the cache",async()=>{
            const f=await folder(); await upload(A,"x.txt",{folderId:f});
            const cold=await A("GET",`/folders/${f}`);
            const warm=await A("GET",`/folders/${f}`);
            setRedis(null);
            const uncached=await A("GET",`/folders/${f}`);
            expect(warm.body).toEqual(cold.body);
            expect(uncached.body).toEqual(cold.body);
        });

        test("upload invalidates the folder listing and usage",async()=>{
            const f=await folder();
            expect(ids(await A("GET",`/files?folderId=${f}`))).toEqual([]);
            const before=(await A("GET","/files/usage")).body.usedBytes;
            const id=await upload(A,"in.txt",{folderId:f});
            expect(ids(await A("GET",`/files?folderId=${f}`))).toEqual([id]);
            expect((await A("GET",`/folders/${f}`)).body.files).toHaveLength(1);
            expect((await A("GET","/files/usage")).body.usedBytes).toBeGreaterThan(before);
        });

        test("moving a file invalidates both the source and the destination listing",async()=>{
            const src=await folder(A,"src"), dst=await folder(A,"dst");
            const id=await upload(A,"m.txt",{folderId:src});
            expect(ids(await A("GET",`/files?folderId=${src}`))).toEqual([id]);
            expect(ids(await A("GET",`/files?folderId=${dst}`))).toEqual([]);
            expect((await A("PATCH",`/files/${id}/move`,{folderId:dst})).status).toBe(200);
            expect(ids(await A("GET",`/files?folderId=${src}`))).toEqual([]);
            expect(ids(await A("GET",`/files?folderId=${dst}`))).toEqual([id]);
        });

        test("trashing a file invalidates listings and keeps its storage usage",async()=>{
            const id=await upload();
            expect(ids(await A("GET","/files"))).toEqual([id]);
            const used=(await A("GET","/files/usage")).body.usedBytes;
            expect((await A("DELETE",`/files/${id}`)).status).toBe(204);
            expect(ids(await A("GET","/files"))).toEqual([]);
            expect((await A("GET","/files/usage")).body.usedBytes).toBe(used);
            expect((await A("GET","/files/trash")).body.files.map((file:any)=>file.id)).toContain(id);
            expect((await A("POST",`/files/trash/${id}/restore`)).status).toBe(204);
            expect(ids(await A("GET","/files"))).toEqual([id]);
        });

        test("folder create, rename, move and delete all invalidate",async()=>{
            const p=await folder(A,"parent"), q=await folder(A,"other");
            await A("GET","/folders/root"); await A("GET",`/folders/${p}`);
            const child=await folder(A,"child",p);
            expect((await A("GET",`/folders/${p}`)).body.folders.map((f:any)=>f.name)).toEqual(["child"]);
            await A("PATCH",`/folders/${child}`,{name:"renamed"});
            expect((await A("GET",`/folders/${p}`)).body.folders.map((f:any)=>f.name)).toEqual(["renamed"]);
            await A("PATCH",`/folders/${child}/move`,{folderId:q});
            expect((await A("GET",`/folders/${p}`)).body.folders).toHaveLength(0);
            expect((await A("GET",`/folders/${q}`)).body.folders).toHaveLength(1);
            const fid=await upload(A,"deep.txt",{folderId:child});
            expect(ids(await A("GET","/files"))).toEqual([fid]);
            await A("DELETE",`/folders/${q}`);
            expect((await A("GET",`/folders/${q}`)).status).toBe(404);
            expect(ids(await A("GET","/files"))).toEqual([]);
        });

        test("a failed mutation does not invalidate",async()=>{
            const id=await upload();
            await A("GET","/files");
            await touchDb();
            const ghost="123e4567-e89b-42d3-a456-426614174000";
            expect((await A("PATCH",`/files/${id}/move`,{folderId:ghost})).status).toBe(404);
            expect((await B("DELETE",`/files/${id}`)).status).toBe(404);
            expect((await A("GET","/files")).body.files[0].name).toBe("f.txt");
            await A("DELETE",`/files/${id}`);
            expect(ids(await A("GET","/files"))).toEqual([]);
        });

        test("users never see each other's cached data",async()=>{
            const fa=await folder(A,"private"); const ida=await upload(A,"a.txt",{folderId:fa});
            expect(ids(await A("GET",`/files?folderId=${fa}`))).toEqual([ida]);
            expect((await A("GET",`/folders/${fa}`)).status).toBe(200);
            expect((await B("GET",`/folders/${fa}`)).status).toBe(404);
            expect((await B("GET",`/files?folderId=${fa}`)).status).toBe(404);
            expect(ids(await B("GET","/files"))).toEqual([]);
            expect((await B("GET","/folders/root")).body.files).toEqual([]);
            expect((await B("GET","/files/usage")).body.usedBytes).toBe(0);
            expect(await http()("GET",`/folders/${fa}`).then(r=>r.status)).toBe(401);
        });

        test("entries expire on their own after the TTL",async()=>{
            await upload();
            await A("GET","/folders/root");
            await touchDb();
            expect((await A("GET","/folders/root")).body.files[0].name).toBe("f.txt");
            setSystemTime(new Date(Date.now()+61_000));
            expect((await A("GET","/folders/root")).body.files[0].name).toBe("changed-behind-the-cache");
            setSystemTime();
        });
    });

    describe("dashboard usage",()=>{
        test("is cached, and the upload quota check still reads the live total",async()=>{
            await upload(A,"one.txt");
            await A("GET","/files/usage");
            sql.mockClear();
            await A("GET","/files/usage");
            expect(dbQueries()).toEqual([]);
            sql.mockClear();
            await upload(A,"two.txt");
            expect(dbQueries().some((q:string)=>/sum\(/i.test(q))).toBe(true);
            expect((await A("GET","/files/usage")).body.usedBytes).toBe("one.txt".length+"two.txt".length);
        });
    });

    describe("recently viewed",()=>{
        test("is cached and a view refreshes it",async()=>{
            const x=await upload(A,"x.txt"), y=await upload(A,"y.txt");
            await A("POST",`/files/${x}/view`);
            expect((await A("GET","/files/recent")).body.items.map((i:any)=>i.id)).toEqual([x]);
            sql.mockClear();
            await A("GET","/files/recent");
            expect(dbQueries()).toEqual([]);
            await A("POST",`/files/${y}/view`);
            expect((await A("GET","/files/recent")).body.items.map((i:any)=>i.id)).toEqual([y,x]);
        });

        test("pages are cached separately and keep their order",async()=>{
            const list=[] as string[];
            for(const n of ["a","b","c"]){ const id=await upload(A,`${n}.txt`); await A("POST",`/files/${id}/view`); list.push(id); await new Promise(r=>setTimeout(r,5)); }
            const p1=(await A("GET","/files/recent?limit=2")).body;
            const p2=(await A("GET",`/files/recent?limit=2&cursor=${p1.nextCursor}`)).body;
            expect([...p1.items,...p2.items].map((i:any)=>i.id)).toEqual([list[2],list[1],list[0]]);
            expect((await A("GET","/files/recent?limit=2")).body).toEqual(p1);
        });

        test("bad cursors are rejected, not cached",async()=>{
            expect((await A("GET","/files/recent?cursor=garbage")).status).toBe(400);
            expect(redis.dataKeys()).toHaveLength(0);
        });

        test("users never see each other's recents",async()=>{
            const id=await upload(A); await A("POST",`/files/${id}/view`);
            expect((await A("GET","/files/recent")).body.items).toHaveLength(1);
            expect((await B("GET","/files/recent")).body.items).toEqual([]);
        });
    });

    describe("groups",()=>{
        const makeGroup=async(U=A,name="team")=>(await U("POST","/groups",{name})).body.group.id as string;
        const join=(g:string,u:U)=>A("POST",`/groups/${g}/members`,{identifier:u.username});

        test("group files and metadata are cached; share and unshare invalidate",async()=>{
            const g=await makeGroup(); await join(g,b);
            const f=await upload(A,"shared.txt");
            expect(ids(await B("GET",`/groups/${g}/files`))).toEqual([]);
            await A("POST",`/groups/${g}/files`,{fileId:f});
            expect(ids(await B("GET",`/groups/${g}/files`))).toEqual([f]);
            sql.mockClear();
            await B("GET",`/groups/${g}/files`);
            expect(count("group_files")).toBe(0);
            expect(count("group_members")).toBeGreaterThan(0);
            expect((await B("GET",`/groups/${g}`)).body.group.fileCount).toBe(1);
            await A("DELETE",`/groups/${g}/files/${f}`);
            expect(ids(await B("GET",`/groups/${g}/files`))).toEqual([]);
            expect((await B("GET",`/groups/${g}`)).body.group.fileCount).toBe(0);
        });

        test("removing a member revokes access immediately, even with warm caches",async()=>{
            const g=await makeGroup(); await join(g,b);
            const f=await upload(A,"secret.txt"); await A("POST",`/groups/${g}/files`,{fileId:f});
            expect((await B("GET",`/groups/${g}/files`)).status).toBe(200);
            expect((await B("GET",`/groups/${g}`)).status).toBe(200);
            expect((await B("GET",`/groups/${g}/members`)).status).toBe(200);
            await B("POST",`/groups/${g}/files/${f}/view`);
            expect((await B("GET","/files/recent")).body.items).toHaveLength(1);
            expect((await A("DELETE",`/groups/${g}/members/${b.id}`)).status).toBe(204);
            for(const path of [`/groups/${g}/files`,`/groups/${g}`,`/groups/${g}/members`,`/groups/${g}/files/${f}/download`]){
                expect((await B("GET",path)).status).toBe(404);
            }
            expect((await B("GET","/files/recent")).body.items).toEqual([]);
        });

        test("unsharing and deleting a group drop the files from members' recents at once",async()=>{
            const g=await makeGroup(); await join(g,b);
            const f=await upload(A,"s.txt"); await A("POST",`/groups/${g}/files`,{fileId:f});
            await B("POST",`/groups/${g}/files/${f}/view`);
            expect((await B("GET","/files/recent")).body.items).toHaveLength(1);
            await A("DELETE",`/groups/${g}/files/${f}`);
            expect((await B("GET","/files/recent")).body.items).toEqual([]);
            await A("POST",`/groups/${g}/files`,{fileId:f});
            await B("POST",`/groups/${g}/files/${f}/view`);
            expect((await B("GET","/files/recent")).body.items).toHaveLength(1);
            await A("DELETE",`/groups/${g}`);
            expect((await B("GET","/files/recent")).body.items).toEqual([]);
        });

        test("groups are isolated from each other",async()=>{
            const g1=await makeGroup(A,"one"), g2=await makeGroup(B,"two");
            const f1=await upload(A,"one.txt"); await A("POST",`/groups/${g1}/files`,{fileId:f1});
            expect(ids(await A("GET",`/groups/${g1}/files`))).toEqual([f1]);
            expect(ids(await B("GET",`/groups/${g2}/files`))).toEqual([]);
            expect((await B("GET",`/groups/${g1}/files`)).status).toBe(404);
            expect((await C("GET",`/groups/${g2}`)).status).toBe(404);
            expect((await A("GET",`/groups/${g2}/files`)).status).toBe(404);
        });

        test("role changes and renames show up despite the cache; the role is per viewer",async()=>{
            const g=await makeGroup(); await join(g,b);
            expect((await B("GET",`/groups/${g}`)).body.group.role).toBe("member");
            expect((await A("GET",`/groups/${g}`)).body.group.role).toBe("admin");
            await A("PATCH",`/groups/${g}/members/${b.id}`,{role:"admin"});
            expect((await B("GET",`/groups/${g}`)).body.group.role).toBe("admin");
            await A("PATCH",`/groups/${g}`,{name:"renamed"});
            expect((await B("GET",`/groups/${g}`)).body.group.name).toBe("renamed");
            expect((await B("GET",`/groups/${g}/members`)).body.members.find((m:any)=>m.userId===b.id).role).toBe("admin");
        });

        test("moving or deleting a shared file updates the group listing",async()=>{
            const g=await makeGroup(); await join(g,b);
            const f=await upload(A,"s.txt"); const dir=await folder(A);
            await A("POST",`/groups/${g}/files`,{fileId:f});
            expect((await B("GET",`/groups/${g}/files`)).body.files[0].folderId).toBeNull();
            await A("PATCH",`/files/${f}/move`,{folderId:dir});
            expect((await B("GET",`/groups/${g}/files`)).body.files[0].folderId).toBe(dir);
            await A("DELETE",`/files/${f}`);
            expect((await B("GET",`/groups/${g}/files`)).body.files).toEqual([]);
        });

        test("uploading into a group refreshes the group listing",async()=>{
            const g=await makeGroup();
            expect((await A("GET",`/groups/${g}/files`)).body.files).toEqual([]);
            await A("POST",`/groups/${g}/files/upload`,form("g.txt","g"));
            expect((await A("GET",`/groups/${g}/files`)).body.files).toHaveLength(1);
        });
    });

    describe("authentication in front of the cache",()=>{
        test("warm entries are never served without a valid token, and a client-supplied identity is ignored",async()=>{
            const fa=await folder(A,"mine"); await upload(A,"a.txt",{folderId:fa});
            const g=(await A("POST","/groups",{name:"t"})).body.group.id;
            const paths=["/files","/files/usage","/files/recent","/folders/root",`/folders/${fa}`,`/groups/${g}`,`/groups/${g}/files`,`/groups/${g}/members`];
            for(const p of paths) expect((await A("GET",p)).status).toBe(200);
            const jwt=(await import("jsonwebtoken")).default;
            const expired=jwt.sign({id:a.id,email:a.email},process.env.JWT_SECRET!,{expiresIn:-10});
            const forged=jwt.sign({id:a.id,email:a.email},"not-the-secret");
            for(const p of paths){
                expect((await http()("GET",p)).status).toBe(401);
                expect((await http(expired)("GET",p)).status).toBe(401);
                expect((await http(forged)("GET",p)).status).toBe(401);
            }
            const spoof=`?userId=${a.id}&user_id=${a.id}&ownerId=${a.id}`;
            expect((await B("GET",`/files${spoof}`)).body.files).toEqual([]);
            expect((await B("GET",`/folders/root${spoof}`)).body.files).toEqual([]);
            expect((await B("GET",`/files/usage${spoof}`)).body.usedBytes).toBe(0);
            expect((await B("GET",`/folders/${fa}${spoof}`)).status).toBe(404);
            expect((await B("GET",`/groups/${g}/files${spoof}`)).status).toBe(404);
        });

        test("a deactivated account loses access even though its entries are warm",async()=>{
            await upload(A); expect((await A("GET","/files")).status).toBe(200);
            await prisma.user.update({where:{user_id:a.id},data:{is_active:false}});
            expect((await A("GET","/files")).status).toBe(401);
            expect((await A("GET","/files/recent")).status).toBe(401);
        });
    });

    describe("different queries do not collide",()=>{
        test("each folder, root, all and each page has its own entry",async()=>{
            const f1=await folder(A,"one"), f2=await folder(A,"two");
            const i1=await upload(A,"1.txt",{folderId:f1}), i2=await upload(A,"2.txt",{folderId:f2}), i3=await upload(A,"3.txt");
            for(let round=0;round<2;round++){
                expect(ids(await A("GET",`/files?folderId=${f1}`))).toEqual([i1]);
                expect(ids(await A("GET",`/files?folderId=${f2}`))).toEqual([i2]);
                expect(ids(await A("GET","/files?folderId=root"))).toEqual([i3]);
                expect(ids(await A("GET","/files"))).toEqual([i1,i2,i3].sort());
                expect((await A("GET",`/folders/${f1}`)).body.files.map((f:any)=>f.id)).toEqual([i1]);
                expect((await A("GET",`/folders/${f2}`)).body.files.map((f:any)=>f.id)).toEqual([i2]);
            }
        });
    });

    describe("resilience",()=>{
        test("requests keep working when redis is down",async()=>{
            const id=await upload(A);
            redis.down=true;
            expect(ids(await A("GET","/files"))).toEqual([id]);
            expect((await A("GET","/files/usage")).status).toBe(200);
            const id2=await upload(A,"two.txt");
            expect(ids(await A("GET","/files"))).toEqual([id,id2].sort());
            expect((await A("DELETE",`/files/${id2}`)).status).toBe(204);
        });

        test("a change made while redis was down is never hidden by an older entry afterwards",async()=>{
            const id=await upload(A);
            await A("GET","/files");
            redis.down=true;
            await A("DELETE",`/files/${id}`);
            redis.down=false;
            setSystemTime(new Date(Date.now()+6_000));
            expect(ids(await A("GET","/files"))).toEqual([]);
            setSystemTime();
        });

        test("corrupt cache entries are ignored",async()=>{
            const id=await upload(A); await A("GET","/files"); await A("GET","/files/usage"); await A("GET","/folders/root");
            for(const k of redis.dataKeys()) redis.store.get(k)!.value="\u0000garbage";
            expect(ids(await A("GET","/files"))).toEqual([id]);
            expect((await A("GET","/files/usage")).status).toBe(200);
            expect((await A("GET","/folders/root")).body.files).toHaveLength(1);
            for(const k of redis.dataKeys()) redis.store.get(k)!.value='{"unexpected":true}';
            expect(ids(await A("GET","/files"))).toEqual([id]);
        });

        test("authorization failures and bad input are not cached",async()=>{
            await B("GET",`/groups/123e4567-e89b-42d3-a456-426614174000/files`);
            await B("GET","/folders/123e4567-e89b-42d3-a456-426614174000");
            expect(redis.dataKeys()).toHaveLength(0);
        });
    });
});
