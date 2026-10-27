import type { Request, Response, NextFunction } from "express";
import {
    createGroupService, listGroupsService, getGroupService, renameGroupService, deleteGroupService,
    listMembersService, addMemberService, setMemberRoleService, removeMemberService,
    listGroupFilesService, findGroupFile, shareFileService, unshareFileService, requireMember
} from "./groups.service.ts";
import { recordViewService } from "../files/views.service.ts";
import { sendFile, sendFileError } from "../files/files.controller.ts";
import { sendError, notFound } from "../lib/errors.ts";
import { logActivity } from "../activity/activity.service.ts";

const uid=(req:Request)=>(req as any).userId as number;
const gid=(req:Request)=>String(req.params.id);
const memberId=(req:Request)=>{
    const n=Number(req.params.userId);
    if(!Number.isInteger(n) || n<1 || n>2_147_483_647) throw notFound("Member not found");
    return n;
};

// runs before multer so a non-member's upload bytes are never accepted; the upload controller reads req.groupId
export const memberOnly=async (req:Request,res:Response,next:NextFunction)=>{
    try{
        await requireMember(uid(req),gid(req));
        (req as any).groupId=gid(req);
        next();
    }
    catch(err){ return sendError(res,err,"Could not check group access"); }
}

export const create=async (req:Request,res:Response)=>{
    try{ return res.status(201).json({group:await createGroupService(uid(req),req.body.name)}); }
    catch(err){ return sendError(res,err,"Could not create group"); }
}
export const list=async (req:Request,res:Response)=>{
    try{ return res.json(await listGroupsService(uid(req))); }
    catch(err){ return sendError(res,err,"Could not list groups"); }
}
export const get=async (req:Request,res:Response)=>{
    try{ return res.json({group:await getGroupService(uid(req),gid(req))}); }
    catch(err){ return sendError(res,err,"Could not load group"); }
}
export const rename=async (req:Request,res:Response)=>{
    try{ return res.json({group:await renameGroupService(uid(req),gid(req),req.body.name)}); }
    catch(err){ return sendError(res,err,"Could not rename group"); }
}
export const remove=async (req:Request,res:Response)=>{
    try{ await deleteGroupService(uid(req),gid(req)); return res.status(204).end(); }
    catch(err){ return sendError(res,err,"Could not delete group"); }
}

export const members=async (req:Request,res:Response)=>{
    try{ return res.json(await listMembersService(uid(req),gid(req))); }
    catch(err){ return sendError(res,err,"Could not list members"); }
}
export const addMember=async (req:Request,res:Response)=>{
    try{ return res.status(201).json({member:await addMemberService(uid(req),gid(req),req.body.identifier,req.body.role ?? "member")}); }
    catch(err){ return sendError(res,err,"Could not add member"); }
}
export const setRole=async (req:Request,res:Response)=>{
    try{ return res.json({member:await setMemberRoleService(uid(req),gid(req),memberId(req),req.body.role)}); }
    catch(err){ return sendError(res,err,"Could not change role"); }
}
export const removeMember=async (req:Request,res:Response)=>{
    try{ await removeMemberService(uid(req),gid(req),memberId(req)); return res.status(204).end(); }
    catch(err){ return sendError(res,err,"Could not remove member"); }
}

export const files=async (req:Request,res:Response)=>{
    try{ return res.json(await listGroupFilesService(uid(req),gid(req))); }
    catch(err){ return sendError(res,err,"Could not list group files"); }
}
export const share=async (req:Request,res:Response)=>{
    try{ return res.status(201).json({file:await shareFileService(uid(req),gid(req),req.body.fileId)}); }
    catch(err){ return sendError(res,err,"Could not share file"); }
}
export const unshare=async (req:Request,res:Response)=>{
    try{ await unshareFileService(uid(req),gid(req),String(req.params.fileId)); return res.status(204).end(); }
    catch(err){ return sendError(res,err,"Could not remove file from group"); }
}
export const download=async (req:Request,res:Response)=>{
    try{
        const link=await findGroupFile(uid(req),gid(req),String(req.params.fileId));
        return await sendFile(req,res,link.file);
    }
    catch(err){ return sendFileError(res,err); }
}
// the viewer is always the authenticated user, whoever shared the file
export const view=async (req:Request,res:Response)=>{
    try{
        const link=await findGroupFile(uid(req),gid(req),String(req.params.fileId));
        const result=await recordViewService(uid(req),link.file_id);
        void logActivity({eventType:"file_view",status:"success",userId:uid(req),fileId:link.file_id,ipAddress:req.ip,details:{groupId:gid(req)}});
        return res.json(result);
    }
    catch(err){ return sendError(res,err,"Could not record view"); }
}
