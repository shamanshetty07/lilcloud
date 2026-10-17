import type { Request, Response } from "express";
import { rm } from "node:fs/promises";
import { uploadFileService, listFilesService, findAccessibleFile, deleteFileService, getUsageService, QuotaExceededError } from "./files.service.ts";
import { storage, StorageError } from "./storage.ts";
import { logActivity } from "../activity/activity.service.ts";

export const upload=async (req:Request,res:Response)=>{
    if(!req.file){
        return res.status(400).json({message:"file is required"});
    }
    try{
        const result=await uploadFileService({
            ownerId:(req as any).userId,
            fileName:req.file.originalname,
            mimeType:req.file.mimetype,
            tempPath:req.file.path,
            size:req.file.size
        });
        void logActivity({eventType:"file_upload",status:"success",userId:(req as any).userId,fileId:String(result.file.id),ipAddress:req.ip,details:{name:result.file.name,size:result.file.size,type:result.file.type}});
        return res.status(201).json(result);
    }
    catch(err){
        await rm(req.file.path,{force:true}).catch(()=>{});
        if(err instanceof QuotaExceededError){
            return res.status(413).json({message:"Storage is full. Delete something or join the waitlist for more space.",code:"QUOTA_EXCEEDED"});
        }
        void logActivity({eventType:"file_upload",status:"failure",userId:(req as any).userId,ipAddress:req.ip,details:{name:req.file.originalname,reason:(err as Error).message}});
        if(err instanceof StorageError && err.code==="UNAVAILABLE"){
            return res.status(503).json({message:"Storage is unavailable"});
        }
        return res.status(500).json({message:"Upload failed"});
    }
}

export const usage=async (req:Request,res:Response)=>{
    try{
        return res.json(await getUsageService((req as any).userId));
    }
    catch(err){
        console.error("usage failed:",err);
        return res.status(500).json({message:"Could not load usage"});
    }
}

export const list=async (req:Request,res:Response)=>{
    try{
        return res.json(await listFilesService((req as any).userId));
    }
    catch(err){
        console.error("list failed:",err);
        return res.status(500).json({message:"Could not list files"});
    }
}

export const download=async (req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try{
        const file=await findAccessibleFile(userId,String(req.params.id),"READ");
        if(!file) return res.status(404).json({message:"File not found"});
        const {stream,size}=await storage.open(file.file_id);
        res.setHeader("Content-Type",file.file_type.includes("/")?file.file_type:"application/octet-stream");
        res.setHeader("Content-Length",String(size));
        res.attachment(file.file_name);
        stream.on("error",()=>res.destroy());
        stream.pipe(res);
        void logActivity({eventType:"file_download",status:"success",userId,fileId:file.file_id,ipAddress:req.ip});
    }
    catch(err){
        if(err instanceof StorageError && err.code==="NOT_FOUND") return res.status(404).json({message:"File content not found"});
        if(err instanceof StorageError && err.code==="UNAVAILABLE") return res.status(503).json({message:"Storage is unavailable"});
        console.error("download failed:",err);
        return res.status(500).json({message:"Download failed"});
    }
}

export const remove=async (req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try{
        const file=await findAccessibleFile(userId,String(req.params.id),"DELETE");
        if(!file) return res.status(404).json({message:"File not found"});
        await deleteFileService(file.file_id);
        void logActivity({eventType:"file_delete",status:"success",userId,fileId:file.file_id,ipAddress:req.ip});
        return res.status(204).end();
    }
    catch(err){
        console.error("delete failed:",err);
        return res.status(500).json({message:"Delete failed"});
    }
}
