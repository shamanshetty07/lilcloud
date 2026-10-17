import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.ts";
import { prisma } from "../lib/prisma.ts";

export const requireAuth=async (req:Request,res:Response,next:NextFunction)=>{
    const header=req.headers.authorization;
    if(!header || !header.startsWith("Bearer ")){
        return res.status(401).json({message:"Missing token"});
    }
    let payload:{id:number,email:string};
    try{
        payload=jwt.verify(header.slice(7),env.JWT_SECRET) as unknown as {id:number,email:string};
    }
    catch(err){
        return res.status(401).json({message:"Invalid or expired token"});
    }
    // a valid signature is not enough: the account must still exist and be active
    // (covers deleted or disabled users whose 7 day token has not expired yet)
    try{
        const user=await prisma.user.findUnique({where:{user_id:payload.id},select:{is_active:true}});
        if(!user || !user.is_active){
            return res.status(401).json({message:"Invalid or expired token"});
        }
    }
    catch(err){
        console.error("auth lookup failed:",err);
        return res.status(503).json({message:"Service temporarily unavailable"});
    }
    (req as any).userId=payload.id;
    next();
}
