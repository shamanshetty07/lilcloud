import { describe, test, expect, beforeEach, afterEach, setSystemTime } from "bun:test";
import { FakeRedis } from "../test-utils/fake-redis.ts";

process.env.PORT??="0"; process.env.DATABASE_URL??="postgresql://unused"; process.env.JWT_SECRET??="x"; process.env.MONGODB_URI??="mongodb://unused";
const { cached, invalidate, resetCacheState, TTL } = await import("./cache.ts");
const { setRedis } = await import("./redis.ts");

let redis:FakeRedis;
beforeEach(()=>{ redis=new FakeRedis(); setRedis(redis); resetCacheState(); });
afterEach(()=>{ setSystemTime(); setRedis(null); });

const counter=()=>{ let n=0; return {calls:()=>n,load:async()=>({n:++n})}; };
const read=(c:ReturnType<typeof counter>,scope="s1",key="k",ttl=60)=>cached({scope,key,ttl,load:c.load});

describe("cache-aside",()=>{
    test("miss loads from the source, hit does not",async()=>{
        const c=counter();
        expect(await read(c)).toEqual({n:1});
        expect(await read(c)).toEqual({n:1});
        expect(c.calls()).toBe(1);
    });

    test("entries expire after their TTL",async()=>{
        const c=counter();
        await read(c,"s1","k",30);
        setSystemTime(new Date(Date.now()+29_000));
        await read(c);
        expect(c.calls()).toBe(1);
        setSystemTime(new Date(Date.now()+2_000));
        expect(await read(c)).toEqual({n:2});
    });

    test("invalidating a scope forces a reload, other scopes keep their entries",async()=>{
        const a=counter(), b=counter();
        await read(a,"user:1:files"); await read(b,"user:2:files");
        await invalidate("user:1:files");
        await read(a,"user:1:files"); await read(b,"user:2:files");
        expect(a.calls()).toBe(2);
        expect(b.calls()).toBe(1);
    });

    test("different scopes and keys never share an entry",async()=>{
        const c=counter();
        await read(c,"user:1:files","list"); await read(c,"user:2:files","list"); await read(c,"user:1:files","other");
        expect(c.calls()).toBe(3);
    });

    test("errors from the source propagate and are not cached",async()=>{
        let fail=true;
        const load=async()=>{ if(fail) throw new Error("db down"); return {ok:true}; };
        await expect(cached({scope:"s",key:"k",ttl:60,load})).rejects.toThrow("db down");
        fail=false;
        expect(await cached({scope:"s",key:"k",ttl:60,load})).toEqual({ok:true});
    });

    test("malformed JSON is dropped and reloaded",async()=>{
        const c=counter();
        await read(c);
        for(const k of redis.dataKeys()) redis.store.get(k)!.value="{not json";
        expect(await read(c)).toEqual({n:2});
        expect(await read(c)).toEqual({n:2});
        expect(c.calls()).toBe(2);
    });

    test("a value with the wrong shape is rejected by the validator",async()=>{
        const c=counter();
        const opts={scope:"s",key:"k",ttl:60,load:c.load,validate:(v:unknown):v is {n:number}=>typeof (v as any)?.n==="number"};
        await cached(opts);
        for(const k of redis.dataKeys()) redis.store.get(k)!.value=JSON.stringify({n:"nope"});
        expect(await cached(opts)).toEqual({n:2});
    });

    test("a read that started before an invalidation cannot repopulate the fresh generation",async()=>{
        let release!:()=>void;
        const gate=new Promise<void>(r=>{ release=r; });
        let data="old";
        const slow=cached({scope:"s",key:"k",ttl:60,load:async()=>{ const seen=data; await gate; return seen; }});
        await new Promise(r=>setTimeout(r,5));
        data="new"; await invalidate("s");
        release();
        expect(await slow).toBe("old");
        expect(await cached({scope:"s",key:"k",ttl:60,load:async()=>data})).toBe("new");
    });
});

describe("redis unavailable",()=>{
    test("reads fall back to the source",async()=>{
        redis.down=true;
        const c=counter();
        expect(await read(c)).toEqual({n:1});
        expect(await read(c)).toEqual({n:2});
    });

    test("the circuit breaker stops hammering a dead redis",async()=>{
        redis.down=true;
        const c=counter();
        await read(c);
        const after=redis.commands;
        await read(c); await read(c);
        expect(redis.commands).toBe(after);
    });

    test("a lost invalidation makes reads bypass the cache until old entries must have expired",async()=>{
        const c=counter();
        await read(c);
        redis.down=true;
        await invalidate("s1");
        redis.down=false;
        setSystemTime(new Date(Date.now()+6_000));
        const before=c.calls();
        await read(c); await read(c);
        expect(c.calls()).toBe(before+2);
        setSystemTime(new Date(Date.now()+TTL.group*1000+1000));
        await read(c); await read(c);
        expect(c.calls()).toBe(before+3);
    });

    test("does not throw when invalidating without redis configured",async()=>{
        setRedis(null);
        await invalidate("s1");
        const c=counter();
        await read(c); await read(c);
        expect(c.calls()).toBe(2);
    });
});
