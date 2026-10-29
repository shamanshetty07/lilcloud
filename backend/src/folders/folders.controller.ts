import type { Request, Response } from "express";
import { createFolderService, getFolderContentsService, renameFolderService, moveFolderService, deleteFolderService, trashFolderService, restoreFolderService } from "./folders.service.ts";
import { sendError } from "../lib/errors.ts";

const uid=(req:Request)=>(req as any).userId as number;

export const create=async (req:Request,res:Response)=>{
    try{ return res.status(201).json({folder:await createFolderService(uid(req),req.body.name,req.body.parentId ?? null)}); }
    catch(err){ return sendError(res,err,"Could not create folder"); }
}

export const contents=async (req:Request,res:Response)=>{
    try{
        const id=String(req.params.id);
        return res.json(await getFolderContentsService(uid(req),id==="root"?null:id));
    }
    catch(err){ return sendError(res,err,"Could not load folder"); }
}

export const rename=async (req:Request,res:Response)=>{
    try{ return res.json({folder:await renameFolderService(uid(req),String(req.params.id),req.body.name)}); }
    catch(err){ return sendError(res,err,"Could not rename folder"); }
}

export const move=async (req:Request,res:Response)=>{
    try{ return res.json({folder:await moveFolderService(uid(req),String(req.params.id),req.body.folderId)}); }
    catch(err){ return sendError(res,err,"Could not move folder"); }
}

export const remove=async (req:Request,res:Response)=>{
    try{ await trashFolderService(uid(req),String(req.params.id)); return res.status(204).end(); }
    catch(err){ return sendError(res,err,"Could not move folder to trash"); }
}

export const restore=async (req:Request,res:Response)=>{
    try{ await restoreFolderService(uid(req),String(req.params.id)); return res.status(204).end(); }
    catch(err){ return sendError(res,err,"Could not restore folder"); }
}

export const permanentlyDelete=async (req:Request,res:Response)=>{
    try{ return res.json(await deleteFolderService(uid(req),String(req.params.id))); }
    catch(err){ return sendError(res,err,"Could not permanently delete folder"); }
}
