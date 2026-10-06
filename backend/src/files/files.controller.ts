import type { Request, Response } from "express";
import { uploadFileService } from "./files.service.ts";

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
        return res.status(201).json(result);
    }
    catch(err){
        return res.status(500).json({message:"Upload failed"});
    }
}
