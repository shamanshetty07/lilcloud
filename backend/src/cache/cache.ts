import { createHash, randomBytes } from "node:crypto";
import { env } from "../lib/env.ts";
import { getRedis } from "./redis.ts";

// cache-aside with generation keys. every cached value lives under a "scope" (one user's files, one group...).
// a scope has a random version token; the token is part of each key, so invalidating a scope is one SET
// (no KEYS/SCAN) and every older entry becomes unreachable and simply expires by TTL.
// the version is read BEFORE the database, so a read that raced a mutation writes to the dead generation
// instead of leaving stale data behind.
//
// the cache is never used to authorise anything: services still check ownership / membership against the
// database on every request and only then consult the cache for the data.

export const TTL={
    folder:60,      // folder contents and file lists
    dashboard:120,  // usage totals
    recent:30,      // recently viewed
    group:120       // group metadata, members, group files
} as const;
const MAX_TTL=Math.max(...Object.values(TTL));
const VERSION_TTL=24*3600;
const OP_TIMEOUT_MS=250;
const BREAKER_MS=5000;

let downUntil=0;     // redis recently failed: skip it entirely until then
let taintedUntil=0;  // an invalidation was lost: do not serve cached data until every old entry has expired

const now=()=>Date.now();
const usable=()=>{
    const r=getRedis();
    return r && now()>=downUntil ? r : null;
}
const fail=(what:string,err:unknown)=>{
    downUntil=now()+BREAKER_MS;
    console.error(`cache ${what} failed:`,(err as Error)?.message ?? err);
}
const withTimeout=<T>(p:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error("redis timeout")),OP_TIMEOUT_MS);
    p.then(v=>{ clearTimeout(t); resolve(v); },e=>{ clearTimeout(t); reject(e); });
});

const k=(...parts:(string|number)[])=>[env.REDIS_KEY_PREFIX,...parts].join(":");
export const hash=(...parts:unknown[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0,16);

export const scopes={
    userFiles:(userId:number)=>`user:${userId}:files`,
    userRecent:(userId:number)=>`user:${userId}:recent`,
    group:(groupId:string)=>`group:${groupId}`
};

const versionKey=(scope:string)=>k("ver",scope);

const readVersion=async(r:NonNullable<ReturnType<typeof getRedis>>,scope:string)=>{
    const vk=versionKey(scope);
    const v=await withTimeout(r.get(vk));
    if(v) return v;
    // missing (first use, expiry or eviction): mint a fresh random token. random, not a counter, so an evicted
    // counter can never restart at a value that old entries still carry
    await withTimeout(r.set(vk,randomBytes(8).toString("hex"),"EX",VERSION_TTL,"NX"));
    const again=await withTimeout(r.get(vk));
    if(!again) throw new Error("version unavailable");
    return again;
}

type Options<T>={scope:string,key:string,ttl:number,load:()=>Promise<T>,validate?:(v:unknown)=>v is T};

// returns cached data on a hit, otherwise runs load() (database), stores the result and returns it.
// errors thrown by load() propagate untouched and are never cached. any redis problem degrades to load()
export const cached=async<T>(o:Options<T>):Promise<T>=>{
    const r=usable();
    if(!r || now()<taintedUntil) return o.load();
    let dataKey:string;
    try{
        const ver=await readVersion(r,o.scope);
        dataKey=k("data",o.scope,ver,o.key);
        const raw=await withTimeout(r.get(dataKey));
        if(raw!==null){
            try{
                const parsed:unknown=JSON.parse(raw);
                if(!o.validate || o.validate(parsed)) return parsed as T;
            }
            catch{}
            // malformed or wrong shape: drop it and fall through to the database
            await withTimeout(r.del(dataKey)).catch(()=>{});
        }
    }
    catch(err){
        fail("read",err);
        return o.load();
    }
    const value=await o.load();
    try{
        const json=JSON.stringify(value);
        if(json!==undefined) await withTimeout(r.set(dataKey,json,"EX",o.ttl));
    }
    catch(err){ fail("write",err); }
    return value;
}

// call AFTER the mutation has committed. if redis cannot be reached the old entries could outlive the change,
// so reads bypass the cache for one max TTL, which is how long any of them can still be alive
export const invalidate=async(...scopeList:string[])=>{
    const unique=[...new Set(scopeList)];
    if(!unique.length || !getRedis()) return;
    const r=usable();
    try{
        if(!r) throw new Error("redis unavailable");
        await Promise.all(unique.map(s=>withTimeout(r.set(versionKey(s),randomBytes(8).toString("hex"),"EX",VERSION_TTL))));
    }
    catch(err){
        fail("invalidate",err);
        taintedUntil=now()+MAX_TTL*1000;
    }
}

// test hook
export const resetCacheState=()=>{ downUntil=0; taintedUntil=0; }
