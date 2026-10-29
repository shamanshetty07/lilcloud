import type { Request, Response } from "express";
import { rm } from "node:fs/promises";
import { z } from "zod";
import { uploadFileService, listFilesService, findAccessibleFile, deleteFileService, getUsageService, moveFileService, QuotaExceededError, listTrashService, restoreFileService, trashFileService, permanentlyDeleteTrashedFileService } from "./files.service.ts";
import { recordViewService, listRecentService } from "./views.service.ts";
import { DomainError, sendError } from "../lib/errors.ts";
import { storage, StorageError } from "./storage.ts";
import { logActivity } from "../activity/activity.service.ts";

const folderIdField=z.uuid().nullish();

// serves both private uploads (optional folderId field) and group uploads (route sets req.groupId after checking membership)
export const upload=async (req:Request,res:Response)=>{
    if(!req.file){
        return res.status(400).json({message:"file is required"});
    }
    const groupId=(req as any).groupId as string|undefined;
    const folder=folderIdField.safeParse(req.body?.folderId||null);
    if(!folder.success || (groupId && folder.data)){
        await rm(req.file.path,{force:true}).catch(()=>{});
        return res.status(400).json({message:"Invalid folderId"});
    }
    try{
        const result=await uploadFileService({
            ownerId:(req as any).userId,
            fileName:req.file.originalname,
            mimeType:req.file.mimetype,
            tempPath:req.file.path,
            size:req.file.size,
            folderId:folder.data,
            groupId
        });
        void logActivity({eventType:"file_upload",status:"success",userId:(req as any).userId,fileId:String(result.file.id),ipAddress:req.ip,details:{name:result.file.name,size:result.file.size,type:result.file.type,...(groupId?{groupId}:{})}});
        return res.status(201).json(result);
    }
    catch(err){
        await rm(req.file.path,{force:true}).catch(()=>{});
        if(err instanceof DomainError) return sendError(res,err,"Upload failed");
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
        // no folderId = the original "everything I can read" list, "root" = top level, otherwise a folder id
        const raw=req.query.folderId;
        if(raw!==undefined && typeof raw!=="string") return res.status(400).json({message:"Invalid folderId"});
        if(raw!==undefined && raw!=="root" && !z.uuid().safeParse(raw).success) return res.status(404).json({message:"Folder not found"});
        const folderId=raw===undefined?undefined:raw==="root"?null:raw;
        return res.json(await listFilesService((req as any).userId,folderId));
    }
    catch(err){
        return sendError(res,err,"Could not list files");
    }
}

export const download=async (req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try{
        const file=await findAccessibleFile(userId,String(req.params.id),"READ");
        if(!file) return res.status(404).json({message:"File not found"});
        return await sendFile(req,res,file);
    }
    catch(err){
        return sendFileError(res,err);
    }
}

type FileRow={file_id:string,file_name:string,file_type:string};
// callers have already authorised the read
export const sendFile=async (req:Request,res:Response,file:FileRow)=>{
    const {stream,size}=await storage.open(file.file_id);
    res.setHeader("Content-Type",file.file_type.includes("/")?file.file_type:"application/octet-stream");
    res.setHeader("Content-Length",String(size));
    res.attachment(file.file_name);
    stream.on("error",()=>res.destroy());
    stream.pipe(res);
    void logActivity({eventType:"file_download",status:"success",userId:(req as any).userId,fileId:file.file_id,ipAddress:req.ip});
}

export const sendFileError=(res:Response,err:unknown)=>{
    if(err instanceof DomainError) return sendError(res,err,"Download failed");
    if(err instanceof StorageError && err.code==="NOT_FOUND") return res.status(404).json({message:"File content not found"});
    if(err instanceof StorageError && err.code==="UNAVAILABLE") return res.status(503).json({message:"Storage is unavailable"});
    console.error("download failed:",err);
    return res.status(500).json({message:"Download failed"});
}

export const remove=async (req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try{
        const file=await findAccessibleFile(userId,String(req.params.id),"DELETE");
        if(!file) return res.status(404).json({message:"File not found"});
        if(file.owner_id===userId) await trashFileService(userId,file.file_id);
        else await deleteFileService(file.file_id);
        void logActivity({eventType:"file_delete",status:"success",userId,fileId:file.file_id,ipAddress:req.ip});
        return res.status(204).end();
    }
    catch(err){
        console.error("delete failed:",err);
        return res.status(500).json({message:"Delete failed"});
    }
}

export const trash=async(req:Request,res:Response)=>{
    try { return res.json(await listTrashService((req as any).userId)); }
    catch(err) { return sendError(res,err,"Could not load trash"); }
}

export const restoreFromTrash=async(req:Request,res:Response)=>{
    try { await restoreFileService((req as any).userId,String(req.params.id)); return res.status(204).end(); }
    catch(err) { return sendError(res,err,"Could not restore file"); }
}

export const permanentlyDelete=async(req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try {
        await permanentlyDeleteTrashedFileService(userId,String(req.params.id));
        return res.status(204).end();
    } catch(err) { return sendError(res,err,"Could not permanently delete file"); }
}

export const move=async (req:Request,res:Response)=>{
    try{
        return res.json({file:await moveFileService((req as any).userId,String(req.params.id),req.body.folderId)});
    }
    catch(err){
        return sendError(res,err,"Move failed");
    }
}

// called only when the user explicitly opens a file, never by lists or downloads
export const view=async (req:Request,res:Response)=>{
    const userId=(req as any).userId;
    try{
        const result=await recordViewService(userId,String(req.params.id));
        void logActivity({eventType:"file_view",status:"success",userId,fileId:result.fileId,ipAddress:req.ip});
        return res.json(result);
    }
    catch(err){
        return sendError(res,err,"Could not record view");
    }
}

export const recent=async (req:Request,res:Response)=>{
    try{
        const {limit,cursor}=req.query;
        if((limit!==undefined && typeof limit!=="string") || (cursor!==undefined && typeof cursor!=="string")) return res.status(400).json({message:"Invalid query"});
        return res.json(await listRecentService((req as any).userId,limit===undefined?20:Number(limit),cursor));
    }
    catch(err){
        return sendError(res,err,"Could not load recent files");
    }
}
