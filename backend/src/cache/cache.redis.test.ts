import { describe, test, expect, beforeAll, beforeEach, afterAll, spyOn, setSystemTime } from "bun:test";
import { RedisClient } from "bun";
import pg from "pg";
import { enabled, prisma, reset, makeUser, http, form } from "../test-utils/setup.ts";

const url=process.env.TEST_REDIS_URL;
const container=process.env.TEST_REDIS_CONTAINER;
if(url && !["127.0.0.1","localhost","[::1]"].includes(new URL(url).hostname)) throw new Error("TEST_REDIS_URL must be a local redis");

process.env.PORT??="0"; process.env.DATABASE_URL??="postgresql://unused"; process.env.JWT_SECRET??="x"; process.env.MONGODB_URI??="mongodb://unused";
const { cached, invalidate, resetCacheState, scopes, TTL } = await import("./cache.ts");
const { setRedis } = await import("./redis.ts");
const { env } = await import("../lib/env.ts");

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const options={connectionTimeout:2000,autoReconnect:true,maxRetries:20,enableOfflineQueue:false};

describe.skipIf(!url)("real redis: cache layer",()=>{
    let client:RedisClient, inspect:RedisClient;
    const keys=async()=>{ const out:string[]=[]; let cursor="0"; do{ const [next,batch]=await inspect.send("SCAN",[cursor,"MATCH",`${env.REDIS_KEY_PREFIX}:*`,"COUNT","500"]); cursor=next; out.push(...batch); }while(cursor!=="0"); return out.sort(); };
    beforeAll(async()=>{ client=new RedisClient(url!,options); inspect=new RedisClient(url!); await client.connect(); });
    beforeEach(async()=>{ await inspect.send("FLUSHDB",[]); setRedis(client as any); resetCacheState(); });
    afterAll(()=>{ setRedis(null); client.close(); inspect.close(); });

    const counter=()=>{ let n=0; return {calls:()=>n,load:async()=>({n:++n,s:"héllo ✓",nested:{a:[1,2,null],big:2**40}})}; };

    test("answers PING",async()=>{ expect(await inspect.send("PING",[])).toBe("PONG"); });

    test("miss then hit; the value is stored as JSON with the configured TTL",async()=>{
        const c=counter(); const scope=scopes.userFiles(7);
        const a=await cached({scope,key:"list:x",ttl:TTL.folder,load:c.load});
        const b=await cached({scope,key:"list:x",ttl:TTL.folder,load:c.load});
        expect(c.calls()).toBe(1);
        expect(b).toEqual(a);
        const dataKey=(await keys()).find(k=>k.includes(":data:"))!;
        expect(JSON.parse((await inspect.get(dataKey))!)).toEqual(a);
        const ttl=await inspect.ttl(dataKey);
        expect(ttl).toBeGreaterThan(TTL.folder-3); expect(ttl).toBeLessThanOrEqual(TTL.folder);
    });

    test("entries really expire",async()=>{
        const c=counter();
        await cached({scope:"user:7:files",key:"k",ttl:1,load:c.load});
        await sleep(1200);
        await cached({scope:"user:7:files",key:"k",ttl:1,load:c.load});
        expect(c.calls()).toBe(2);
    });

    test("TTL policy matches the documentation",()=>{
        expect(TTL).toEqual({folder:60,dashboard:120,recent:30,group:120});
    });

    test("key naming: everything is under the prefix, scoped per user or group; version tokens keep their own TTL",async()=>{
        const g="123e4567-e89b-42d3-a456-426614174000";
        await cached({scope:scopes.userFiles(1),key:"list:a",ttl:60,load:async()=>1});
        await cached({scope:scopes.userRecent(2),key:"page:a",ttl:30,load:async()=>2});
        await cached({scope:scopes.group(g),key:"files",ttl:120,load:async()=>3});
        const all=await keys();
        const p=env.REDIS_KEY_PREFIX;
        for(const k of all) expect(k).toMatch(new RegExp(`^${p}:(data|ver):(user:\\d+:(files|recent)|group:[0-9a-f-]{36})(:|$)`));
        expect(all.filter(k=>k.includes(":data:user:1:files:"))).toHaveLength(1);
        expect(all.filter(k=>k.includes(":data:user:2:recent:"))).toHaveLength(1);
        expect(all.filter(k=>k.includes(`:data:group:${g}:`))).toHaveLength(1);
        const ver=all.find(k=>k===`${p}:ver:user:1:files`)!;
        expect(await inspect.ttl(ver)).toBeGreaterThan(80_000);
    });

    test("invalidation only affects its own scope (no collateral deletes) and never enumerates keys",async()=>{
        const c1=counter(), c2=counter();
        await cached({scope:"user:1:files",key:"k",ttl:60,load:c1.load});
        await cached({scope:"user:2:files",key:"k",ttl:60,load:c2.load});
        const before=(await keys()).filter(k=>k.includes(":data:")).length;
        await invalidate("user:1:files");
        expect((await keys()).filter(k=>k.includes(":data:")).length).toBe(before);
        await cached({scope:"user:2:files",key:"k",ttl:60,load:c2.load});
        await cached({scope:"user:1:files",key:"k",ttl:60,load:c1.load});
        expect(c2.calls()).toBe(1); expect(c1.calls()).toBe(2);
    });

    test("malformed and wrongly shaped values are repaired",async()=>{
        const c=counter();
        await cached({scope:"user:1:files",key:"k",ttl:60,load:c.load});
        const dataKey=(await keys()).find(k=>k.includes(":data:"))!;
        await inspect.set(dataKey,"{broken");
        expect((await cached({scope:"user:1:files",key:"k",ttl:60,load:c.load})).n).toBe(2);
        await inspect.set(dataKey,'{"n":"x"}');
        const v=await cached({scope:"user:1:files",key:"k",ttl:60,load:c.load,validate:(x):x is {n:number}=>typeof (x as any)?.n==="number"});
        expect(v.n).toBe(3);
    });

    test.skipIf(!container)("survives the server going away and reconnects when it returns",async()=>{
        const c=counter();
        await cached({scope:"user:1:files",key:"k",ttl:60,load:c.load});
        await Bun.$`docker stop ${container}`.quiet();
        try{
            const t=performance.now();
            expect((await cached({scope:"user:1:files",key:"k",ttl:60,load:c.load})).n).toBe(2);
            expect(performance.now()-t).toBeLessThan(1500);
            await invalidate("user:1:files");
        }
        finally{ await Bun.$`docker start ${container}`.quiet(); }
        let reconnected=false;
        for(let i=0;i<40 && !reconnected;i++){
            await sleep(1000);
            resetCacheState();
            const before=c.calls();
            await cached({scope:"user:9:files",key:"probe",ttl:60,load:c.load});
            await cached({scope:"user:9:files",key:"probe",ttl:60,load:c.load});
            reconnected=c.calls()===before+1;
        }
        expect(reconnected).toBe(true);
    },60_000);
});

describe.skipIf(!url || !enabled)("real redis: http flows",()=>{
    let sql:ReturnType<typeof spyOn>, client:RedisClient, inspect:RedisClient;
    let a:any,b:any,A:ReturnType<typeof http>,B:ReturnType<typeof http>;
    const dbQueries=()=>sql.mock.calls.map((c:any)=>String(c[0]?.text ?? c[0])).filter((q:string)=>!q.includes('"users"."is_active"'));
    beforeAll(async()=>{ sql=spyOn(pg.Client.prototype as any,"query"); client=new RedisClient(url!,options); inspect=new RedisClient(url!); await client.connect(); });
    afterAll(()=>{ setRedis(null); client.close(); inspect.close(); });
    beforeEach(async()=>{
        await inspect.send("FLUSHDB",[]); setRedis(client as any); resetCacheState();
        await reset(); a=await makeUser("alice"); b=await makeUser("bob"); A=http(a.token); B=http(b.token); sql.mockClear();
    });
    const ids=(r:any)=>r.body.files.map((f:any)=>f.id).sort();

    test("miss queries the database, hit does not, and the redis entry holds the same JSON",async()=>{
        await A("POST","/files/upload",form("x.txt","x"));
        sql.mockClear();
        const first=await A("GET","/folders/root");
        expect(dbQueries().length).toBeGreaterThan(0);
        sql.mockClear();
        const second=await A("GET","/folders/root");
        expect(dbQueries()).toEqual([]);
        expect(second.body).toEqual(first.body);
        const dataKeys=(await inspect.send("KEYS",["*:data:*"]) as string[]);
        expect(dataKeys.some(k=>k.includes(`:data:user:${a.id}:files:`))).toBe(true);
    });

    test("different query parameters use different keys",async()=>{
        const f=(await A("POST","/folders",{name:"d"})).body.folder.id;
        await A("GET","/files"); await A("GET","/files?folderId=root"); await A("GET",`/files?folderId=${f}`);
        await A("GET","/files/recent?limit=5"); await A("GET","/files/recent?limit=6");
        const keys=(await inspect.send("KEYS",["*:data:*"]) as string[]);
        expect(new Set(keys).size).toBe(5);
    });

    test("file move refreshes the source and destination listings",async()=>{
        const s=(await A("POST","/folders",{name:"s"})).body.folder.id, d=(await A("POST","/folders",{name:"d"})).body.folder.id;
        const id=(await A("POST","/files/upload",form("m.txt","m",{folderId:s}))).body.file.id;
        await A("GET",`/files?folderId=${s}`); await A("GET",`/files?folderId=${d}`);
        await A("PATCH",`/files/${id}/move`,{folderId:d});
        expect(ids(await A("GET",`/files?folderId=${s}`))).toEqual([]);
        expect(ids(await A("GET",`/files?folderId=${d}`))).toEqual([id]);
    });

    test("user isolation and group revocation with a real redis",async()=>{
        const id=(await A("POST","/files/upload",form("p.txt","p"))).body.file.id;
        expect(ids(await A("GET","/files"))).toEqual([id]);
        expect(ids(await B("GET","/files"))).toEqual([]);
        const g=(await A("POST","/groups",{name:"t"})).body.group.id;
        await A("POST",`/groups/${g}/members`,{identifier:b.username});
        await A("POST",`/groups/${g}/files`,{fileId:id});
        expect(ids(await B("GET",`/groups/${g}/files`))).toEqual([id]);
        await B("POST",`/files/${id}/view`);
        expect((await B("GET","/files/recent")).body.items).toHaveLength(1);
        await A("DELETE",`/groups/${g}/members/${b.id}`);
        expect((await B("GET",`/groups/${g}/files`)).status).toBe(404);
        expect((await B("GET",`/groups/${g}/files/${id}/download`)).status).toBe(404);
        expect((await B("POST",`/files/${id}/view`)).status).toBe(404);
        expect((await B("GET","/files/recent")).body.items).toEqual([]);
    });

    test("mutations still succeed while redis is down, and nothing stale is served afterwards",async()=>{
        const down=new RedisClient("redis://127.0.0.1:1",{connectionTimeout:300,autoReconnect:false,enableOfflineQueue:false});
        const id=(await A("POST","/files/upload",form("a.txt","a"))).body.file.id;
        await A("GET","/files");
        setRedis(down as any);
        expect((await A("DELETE",`/files/${id}`)).status).toBe(204);
        expect(ids(await A("GET","/files"))).toEqual([]);
        setRedis(client as any);
        setSystemTime(new Date(Date.now()+6_000));
        try{ expect(ids(await A("GET","/files"))).toEqual([]); }
        finally{ setSystemTime(); }
    });
});
