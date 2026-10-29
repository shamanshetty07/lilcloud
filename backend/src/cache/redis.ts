import { RedisClient } from "bun";
import { env } from "../lib/env.ts";

export interface CacheClient {
    get(key:string):Promise<string|null>;
    set(key:string,value:string,...opts:(string|number)[]):Promise<unknown>;
    del(...keys:string[]):Promise<number>;
    send(command:string,args:string[]):Promise<any>;
    close?():void;
}

let client:CacheClient|null=null;
let initialised=false;

export const getRedis=():CacheClient|null=>{
    if(initialised) return client;
    initialised=true;
    if(!env.REDIS_URL) return null;
    const c=new RedisClient(env.REDIS_URL,{connectionTimeout:2000,autoReconnect:true,maxRetries:20,enableOfflineQueue:false});
    c.onclose=err=>console.error("redis connection closed:",err?.message ?? "no reason given");
    client=c as unknown as CacheClient;
    return client;
}

export const connectRedis=async()=>{
    const c=getRedis() as (CacheClient&{connect?():Promise<void>})|null;
    if(!c?.connect) return;
    await c.connect().catch(err=>console.error("redis unavailable, serving uncached:",err?.message ?? err));
}

export const setRedis=(c:CacheClient|null)=>{ client=c; initialised=true; }

export const closeRedis=()=>{
    try{ if(client) (client as any).onclose=undefined; client?.close?.(); }catch{}
    client=null; initialised=false;
}
