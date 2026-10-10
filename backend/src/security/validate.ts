import type { Request, Response, NextFunction } from "express";
import { z, type ZodType } from "zod";

// validates req.body against a schema and replaces it with the parsed (trimmed, typed, unknown keys dropped) value
export const validateBody=(schema:ZodType)=>(req:Request,res:Response,next:NextFunction)=>{
    const result=schema.safeParse(req.body);
    if(!result.success){
        return res.status(400).json({
            message:"Invalid input",
            errors:result.error.issues.map(i=>({field:i.path.join("."),message:i.message}))
        });
    }
    req.body=result.data;
    next();
}

export const signupSchema=z.object({
    username:z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_.-]+$/,"only letters, numbers, _ . - allowed"),
    email:z.string().trim().toLowerCase().max(254).pipe(z.email()),
    // bcrypt silently ignores bytes past 72
    password:z.string().min(8).max(72)
}).strict();

export const signinSchema=z.object({
    email:z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password:z.string().min(1).max(72)
}).strict();
