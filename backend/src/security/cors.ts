import type { Request, Response, NextFunction } from "express";
import { env } from "../lib/env.ts";

// explicit allowlist from CORS_ORIGINS; auth uses bearer tokens so no credentials/cookies are allowed
export const makeCors=(allowed:string[])=>(req:Request,res:Response,next:NextFunction)=>{
    const origin=req.headers.origin;
    if(origin && allowed.includes(origin)){
        res.setHeader("Access-Control-Allow-Origin",origin);
        res.setHeader("Vary","Origin");
        res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers","Authorization,Content-Type");
        res.setHeader("Access-Control-Expose-Headers","Content-Disposition");
        res.setHeader("Access-Control-Max-Age","600");
    }
    if(req.method==="OPTIONS") return res.status(origin && allowed.includes(origin)?204:403).end();
    next();
}

export const cors=makeCors(env.CORS_ORIGINS);
