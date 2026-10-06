import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.ts";

export const requireAuth=(req:Request,res:Response,next:NextFunction)=>{
    const header=req.headers.authorization;
    if(!header || !header.startsWith("Bearer ")){
        return res.status(401).json({message:"Missing token"});
    }
    try{
        const payload=jwt.verify(header.slice(7),env.JWT_SECRET) as unknown as {id:number,email:string};
        (req as any).userId=payload.id;
        next();
    }
    catch(err){
        return res.status(401).json({message:"Invalid or expired token"});
    }
}
