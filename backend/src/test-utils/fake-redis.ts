import type { CacheClient } from "../cache/redis.ts";

// in-memory stand-in for redis: expiry follows Date.now() (so setSystemTime moves it) and `down` makes every command fail.
// tests never talk to a real redis, let alone the one in REDIS_URL
export class FakeRedis implements CacheClient {
    store=new Map<string,{value:string,expiresAt:number|null}>();
    down=false;
    commands=0;
    private live(key:string){
        const e=this.store.get(key);
        if(e && e.expiresAt!==null && e.expiresAt<=Date.now()){ this.store.delete(key); return undefined; }
        return e;
    }
    private guard(){ this.commands++; if(this.down) throw new Error("connection refused"); }
    async get(key:string){ this.guard(); return this.live(key)?.value ?? null; }
    async set(key:string,value:string,...opts:(string|number)[]){
        this.guard();
        const nx=opts.includes("NX");
        const ex=opts.indexOf("EX");
        if(nx && this.live(key)) return null;
        this.store.set(key,{value,expiresAt:ex>=0?Date.now()+Number(opts[ex+1])*1000:null});
        return "OK";
    }
    // emulates the cache's single round trip read script: [version, data] or null when the scope has no version yet
    async send(command:string,args:string[]){
        this.guard();
        if(command!=="EVAL") throw new Error(`FakeRedis: unsupported ${command}`);
        const [,,versionKey,prefix,suffix]=args as [string,string,string,string,string];
        const v=this.live(versionKey)?.value;
        if(!v) return null;
        return [v,this.live(`${prefix}${v}${suffix}`)?.value ?? null];
    }
    async del(...keys:string[]){ this.guard(); return keys.filter(k=>this.store.delete(k)).length; }
    dataKeys(){ return [...this.store.keys()].filter(k=>k.includes(":data:")); }
}
