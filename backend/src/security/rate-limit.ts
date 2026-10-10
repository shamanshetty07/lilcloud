import type { Request, Response, NextFunction } from "express";

type options={windowMs:number,max:number,message?:string}

// small in-memory fixed window limiter keyed by client ip (use redis if running multiple instances)
export const rateLimit=({windowMs,max,message="Too many requests, try again later"}:options)=>{
    const hits=new Map<string,{count:number,resetAt:number}>();
    setInterval(()=>{
        const now=Date.now();
        for(const [key,entry] of hits) if(entry.resetAt<=now) hits.delete(key);
    },windowMs).unref();

    return (req:Request,res:Response,next:NextFunction)=>{
        const now=Date.now();
        const key=req.ip ?? "unknown";
        let entry=hits.get(key);
        if(!entry || entry.resetAt<=now){
            entry={count:0,resetAt:now+windowMs};
            hits.set(key,entry);
        }
        entry.count++;
        if(entry.count>max){
            res.setHeader("Retry-After",String(Math.ceil((entry.resetAt-now)/1000)));
            return res.status(429).json({message});
        }
        next();
    }
}
