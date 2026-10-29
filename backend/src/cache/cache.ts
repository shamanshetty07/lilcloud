import { createHash, randomBytes } from "node:crypto";
import { env } from "../lib/env.ts";
import { getRedis } from "./redis.ts";

export const TTL={
    folder:60,
    dashboard:120,
    recent:30,
    group:120
} as const;
const MAX_TTL=Math.max(...Object.values(TTL));
const VERSION_TTL=24*3600;
const OP_TIMEOUT_MS=250;
const BREAKER_MS=5000;

let downUntil=0;
let taintedUntil=0;

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
    await withTimeout(r.set(vk,randomBytes(8).toString("hex"),"EX",VERSION_TTL,"NX"));
    const again=await withTimeout(r.get(vk));
    if(!again) throw new Error("version unavailable");
    return again;
}

const READ_SCRIPT="local v=redis.call('GET',KEYS[1]) if not v then return false end return {v,redis.call('GET',ARGV[1]..v..ARGV[2]) or false}";

const readEntry=async(r:NonNullable<ReturnType<typeof getRedis>>,scope:string,key:string):Promise<{ver:string,raw:string|null}>=>{
    const res=await withTimeout(r.send("EVAL",[READ_SCRIPT,"1",versionKey(scope),`${k("data",scope)}:`,`:${key}`]));
    if(Array.isArray(res) && typeof res[0]==="string") return {ver:res[0],raw:typeof res[1]==="string"?res[1]:null};
    return {ver:await readVersion(r,scope),raw:null};
}

type Options<T>={scope:string,key:string,ttl:number,load:()=>Promise<T>,validate?:(v:unknown)=>v is T};

export const cached=async<T>(o:Options<T>):Promise<T>=>{
    const r=usable();
    if(!r || now()<taintedUntil) return o.load();
    let dataKey:string;
    try{
        const {ver,raw}=await readEntry(r,o.scope,o.key);
        dataKey=k("data",o.scope,ver,o.key);
        if(raw!==null){
            try{
                const parsed:unknown=JSON.parse(raw);
                if(!o.validate || o.validate(parsed)) return parsed as T;
            }
            catch{}
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

export const cacheOn=()=>getRedis()!==null;

export const resetCacheState=()=>{ downUntil=0; taintedUntil=0; }
