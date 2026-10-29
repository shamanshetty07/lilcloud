import type { Request, Response, NextFunction } from "express";
import { z, type ZodType } from "zod";

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
    password:z.string().min(8).max(72)
}).strict();

export const signinSchema=z.object({
    email:z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password:z.string().min(1).max(72)
}).strict();

const displayName=(max:number)=>z.string().trim().min(1).max(max)
    .refine(v=>!/[\/\\]/.test(v),"must not contain / or \\")
    .refine(v=>v!=="." && v!=="..","not a valid name");

const folderRef=z.union([z.uuid(),z.null()]);

export const createFolderSchema=z.object({
    name:displayName(100),
    parentId:folderRef.optional()
}).strict();

export const renameFolderSchema=z.object({name:displayName(100)}).strict();
export const moveSchema=z.object({folderId:folderRef}).strict();

export const createGroupSchema=z.object({name:displayName(100)}).strict();
export const renameGroupSchema=createGroupSchema;
export const addMemberSchema=z.object({
    identifier:z.string().trim().min(1).max(254),
    role:z.enum(["admin","member"]).optional()
}).strict();
export const setRoleSchema=z.object({role:z.enum(["admin","member"])}).strict();
export const shareFileSchema=z.object({fileId:z.uuid()}).strict();
