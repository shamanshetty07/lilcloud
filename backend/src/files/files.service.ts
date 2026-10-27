import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.ts"
import { extname } from "node:path";
import { storage, isValidKey } from "./storage.ts";
import { PLANS, currentPlanFor } from "../plans/plans.ts";
import { notFound } from "../lib/errors.ts";

export class QuotaExceededError extends Error {
    constructor(){ super("QUOTA_EXCEEDED"); }
}

export const getUsageService=async(userId:number)=>{
    const sum=await prisma.file.aggregate({where:{owner_id:userId},_sum:{file_size:true}});
    const plan=currentPlanFor(userId);
    return {plan,usedBytes:Number(sum._sum.file_size ?? 0),limitBytes:PLANS[plan].limitBytes};
}

type uploadData={
    ownerId:number,
    fileName:string,
    mimeType:string,
    tempPath:string,
    size:number,
    // private upload into one of the owner's folders (null/undefined = root)
    folderId?:string|null,
    // upload into a group's shared space; the uploader must be a member
    groupId?:string
}

// derive the type from the file extension, fall back to the browser supplied mime type
export const deriveFileType=(fileName:string,mimeType:string)=>{
    const byExtension=Bun.file(fileName).type.split(";")[0];
    if(byExtension && byExtension!=="application/octet-stream"){
        return byExtension;
    }
    if(mimeType && mimeType!=="application/octet-stream"){
        return mimeType;
    }
    return extname(fileName).slice(1).toLowerCase() || "unknown";
}

export const toDto=(file:{file_id:string,file_name:string,file_size:bigint,file_type:string,uploaded_at:Date,folder_id:string|null})=>({
    id:file.file_id,
    name:file.file_name,
    size:Number(file.file_size),
    type:file.file_type,
    uploadedAt:file.uploaded_at,
    folderId:file.folder_id
});

// the file id doubles as the storage key. content is stored first so a failed
// write never leaves a database row pointing at nothing
export const uploadFileService=async(data:uploadData)=>{
    const usage=await getUsageService(data.ownerId);
    if(usage.usedBytes+data.size>usage.limitBytes) throw new QuotaExceededError();
    const fileId=randomUUID();
    await storage.commit(data.tempPath,fileId);
    try{
        // folder / membership are checked in the same transaction that writes the rows, so a
        // membership revoked a moment ago cannot slip an upload through
        const file=await prisma.$transaction(async tx=>{
            if(data.folderId){
                const folder=await tx.folder.findFirst({where:{folder_id:data.folderId,owner_id:data.ownerId},select:{folder_id:true}});
                if(!folder) throw notFound("Folder not found");
            }
            if(data.groupId){
                const member=await tx.groupMember.findUnique({where:{group_id_user_id:{group_id:data.groupId,user_id:data.ownerId}}});
                if(!member) throw notFound("Group not found");
            }
            return tx.file.create({
                data:{
                    file_id:fileId,
                    owner_id:data.ownerId,
                    file_name:data.fileName,
                    file_size:data.size,
                    file_type:deriveFileType(data.fileName,data.mimeType),
                    folder_id:data.folderId ?? null,
                    ...(data.groupId?{groups:{create:{group_id:data.groupId,shared_by:data.ownerId}}}:{})
                }
            });
        });
        return {file:toDto(file)};
    }
    catch(err){
        await storage.remove(fileId).catch(()=>{});
        throw err;
    }
}

// owner, or a user holding the needed permission (OWNER implies all)
const accessFilter=(userId:number,permission:"READ"|"DELETE")=>({
    OR:[
        {owner_id:userId},
        {permissions:{some:{user_id:userId,permission:{in:[permission,"OWNER"] as ("READ"|"DELETE"|"OWNER")[]}}}}
    ]
});

// membership is looked up live, so removing someone from a group ends their access on the next request.
// group access is read only and never widens the delete filter
export const readFilter=(userId:number)=>({
    OR:[
        ...accessFilter(userId,"READ").OR,
        {groups:{some:{group:{members:{some:{user_id:userId}}}}}}
    ]
});

// folderId: undefined = everything the user can read through ownership/permissions (original behaviour),
// null = the root of their own storage, uuid = that folder (must be theirs). group files are never listed here
export const listFilesService=async(userId:number,folderId?:string|null)=>{
    if(folderId){
        const folder=await prisma.folder.findFirst({where:{folder_id:folderId,owner_id:userId},select:{folder_id:true}});
        if(!folder) throw notFound("Folder not found");
    }
    const files=await prisma.file.findMany({
        where:folderId===undefined?accessFilter(userId,"READ"):{owner_id:userId,folder_id:folderId},
        orderBy:{uploaded_at:"desc"}
    });
    return {files:files.map(toDto)};
}

// only the owner can organise a file; null moves it back to the root
export const moveFileService=async(userId:number,fileId:string,folderId:string|null)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    return prisma.$transaction(async tx=>{
        const file=await tx.file.findFirst({where:{file_id:fileId,owner_id:userId}});
        if(!file) throw notFound("File not found");
        if(folderId){
            const folder=await tx.folder.findFirst({where:{folder_id:folderId,owner_id:userId},select:{folder_id:true}});
            if(!folder) throw notFound("Folder not found");
        }
        return toDto(await tx.file.update({where:{file_id:fileId},data:{folder_id:folderId}}));
    });
}

// returns null for both "does not exist" and "not yours" so ids cannot be probed
export const findAccessibleFile=async(userId:number,fileId:string,permission:"READ"|"DELETE")=>{
    if(!isValidKey(fileId)) return null;
    return prisma.file.findFirst({where:{file_id:fileId,...(permission==="READ"?readFilter(userId):accessFilter(userId,permission))}});
}

export const deleteFileService=async(fileId:string)=>{
    await prisma.file.delete({where:{file_id:fileId}});
    await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
}
