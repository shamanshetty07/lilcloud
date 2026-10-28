import { RedisClient } from "bun";
import { env } from "../lib/env.ts";

// the slice of the redis client the cache uses, so tests can swap in an in-memory fake
export interface CacheClient {
    get(key:string):Promise<string|null>;
    set(key:string,value:string,...opts:(string|number)[]):Promise<unknown>;
    del(...keys:string[]):Promise<number>;
    close?():void;
}

let client:CacheClient|null=null;
let initialised=false;

// REDIS_URL unset = caching is off and every read goes straight to the database.
// commands fail fast while disconnected (no offline queue) so a dead redis never stalls a request
export const getRedis=():CacheClient|null=>{
    if(initialised) return client;
    initialised=true;
    if(!env.REDIS_URL) return null;
    const c=new RedisClient(env.REDIS_URL,{connectionTimeout:2000,autoReconnect:true,maxRetries:20,enableOfflineQueue:false});
    c.onclose=err=>console.error("redis connection closed:",err?.message ?? "no reason given");
    client=c as unknown as CacheClient;
    return client;
}

// opens the connection up front (bun otherwise connects on the first command, which fails fast with no offline
// queue). never throws: if redis is down the api still serves from the database and the circuit breaker retries
export const connectRedis=async()=>{
    const c=getRedis() as (CacheClient&{connect?():Promise<void>})|null;
    if(!c?.connect) return;
    await c.connect().catch(err=>console.error("redis unavailable, serving uncached:",err?.message ?? err));
}

// tests inject a fake (or null to disable caching)
export const setRedis=(c:CacheClient|null)=>{ client=c; initialised=true; }

export const closeRedis=()=>{
    try{ client?.close?.(); }catch{}
    client=null; initialised=false;
}
