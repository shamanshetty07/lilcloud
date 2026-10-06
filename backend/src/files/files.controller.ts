import type { Request, Response } from "express";
import { uploadFileService } from "./files.service.ts";
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
            buffer:req.file.buffer
        });
        void logActivity({eventType:"file_upload",status:"success",userId:(req as any).userId,fileId:String(result.file.id),ipAddress:req.ip,details:{name:result.file.name,size:result.file.size,type:result.file.type}});
        return res.status(201).json(result);
    }
    catch(err){
        void logActivity({eventType:"file_upload",status:"failure",userId:(req as any).userId,ipAddress:req.ip,details:{name:req.file.originalname,reason:(err as Error).message}});
        return res.status(500).json({message:"Upload failed"});
    }
}
