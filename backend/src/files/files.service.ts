import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.ts"
import { extname } from "node:path";
import { storage, isValidKey } from "./storage.ts";
import { PLANS, currentPlanFor } from "../plans/plans.ts";
import { notFound } from "../lib/errors.ts";
import { cached, cacheOn, invalidate, hash, scopes, TTL } from "../cache/cache.ts";

type Db=typeof prisma|Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const lockOwner=(db:Db,userId:number)=>db.$executeRaw`SELECT pg_advisory_xact_lock(1, ${userId}::int)`;

// every cache scope a change to these files can touch: the owner's and any permission holder's file lists, the
// owner's recents and the groups the files are shared in. looked up before a delete (the rows cascade away) and
// inside the move transaction, then invalidated once the change has committed
export const cacheScopesFor=async(db:Db,fileIds:string[])=>{
    if(!cacheOn() || !fileIds.length) return [];
    const where={file_id:{in:fileIds}};
    const [owners,holders,links]=await Promise.all([
        db.file.findMany({where,select:{owner_id:true},distinct:["owner_id"]}),
        db.filePermission.findMany({where,select:{user_id:true},distinct:["user_id"]}),
        db.groupFile.findMany({where,select:{group_id:true},distinct:["group_id"]})
    ]);
    const groupMembers=links.length?await db.groupMember.findMany({where:{group_id:{in:links.map(link=>link.group_id)}},select:{user_id:true},distinct:["user_id"]}):[];
    return [
        ...owners.flatMap(o=>[scopes.userFiles(o.owner_id),scopes.userRecent(o.owner_id)]),
        ...holders.map(h=>scopes.userFiles(h.user_id)),
        ...groupMembers.map(m=>scopes.userRecent(m.user_id)),
        ...links.map(l=>scopes.group(l.group_id))
    ];
}

export class QuotaExceededError extends Error {
    constructor(){ super("QUOTA_EXCEEDED"); }
}

// always live: the upload quota check must never read a cached total
const usageNow=async(userId:number)=>{
    const sum=await prisma.file.aggregate({where:{owner_id:userId},_sum:{file_size:true}});
    const plan=currentPlanFor(userId);
    return {plan,usedBytes:Number(sum._sum.file_size ?? 0),limitBytes:PLANS[plan].limitBytes};
}

// dashboard numbers (GET /files/usage) may come from the cache
export const getUsageService=(userId:number)=>cached({
    scope:scopes.userFiles(userId),key:"usage",ttl:TTL.dashboard,
    load:()=>usageNow(userId),
    validate:(v):v is Awaited<ReturnType<typeof usageNow>>=>typeof (v as any)?.usedBytes==="number" && typeof (v as any)?.limitBytes==="number"
});

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
    const usage=await usageNow(data.ownerId);
    if(usage.usedBytes+data.size>usage.limitBytes) throw new QuotaExceededError();
    const fileId=randomUUID();
    await storage.commit(data.tempPath,fileId);
    let created:Awaited<ReturnType<typeof prisma.file.create>>;
    try{
        // folder / membership are checked in the same transaction that writes the rows, so a
        // membership revoked a moment ago cannot slip an upload through
        const file=await prisma.$transaction(async tx=>{
            if(data.folderId){
                const folder=await tx.folder.findFirst({where:{folder_id:data.folderId,owner_id:data.ownerId,deleted_at:null},select:{folder_id:true}});
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
        created=file;
    }
    catch(err){
        await storage.remove(fileId).catch(()=>{});
        throw err;
    }
    // outside the try: the row is committed, so nothing here may remove the stored content
    await invalidate(scopes.userFiles(data.ownerId),...(data.groupId?[scopes.group(data.groupId)]:[]));
    return {file:toDto(created)};
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
// cached per user (the key is scoped to the authenticated user, and only the owner can ever populate a folder entry)
export const listFilesService=(userId:number,folderId?:string|null)=>cached({
    scope:scopes.userFiles(userId),key:`list:${hash(folderId===undefined?"all":folderId)}`,ttl:TTL.folder,
    validate:(v):v is {files:ReturnType<typeof toDto>[]}=>Array.isArray((v as any)?.files),
    load:async()=>{
        if(folderId){
            const folder=await prisma.folder.findFirst({where:{folder_id:folderId,owner_id:userId},select:{folder_id:true}});
            if(!folder) throw notFound("Folder not found");
        }
        const files=await prisma.file.findMany({
            where:{deleted_at:null,...(folderId===undefined?accessFilter(userId,"READ"):{owner_id:userId,folder_id:folderId})},
            orderBy:{uploaded_at:"desc"}
        });
        return {files:files.map(toDto)};
    }
});

// only the owner can organise a file; null moves it back to the root
export const moveFileService=async(userId:number,fileId:string,folderId:string|null)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const {dto,touched}=await prisma.$transaction(async tx=>{
        const file=await tx.file.findFirst({where:{file_id:fileId,owner_id:userId,deleted_at:null}});
        if(!file) throw notFound("File not found");
        if(folderId){
            const folder=await tx.folder.findFirst({where:{folder_id:folderId,owner_id:userId,deleted_at:null},select:{folder_id:true}});
            if(!folder) throw notFound("Folder not found");
        }
        const dto=toDto(await tx.file.update({where:{file_id:fileId},data:{folder_id:folderId}}));
        return {dto,touched:await cacheScopesFor(tx,[fileId])};
    });
    // one user scope covers both the source and the destination folder listing
    await invalidate(...touched);
    return dto;
}

// returns null for both "does not exist" and "not yours" so ids cannot be probed
export const findAccessibleFile=async(userId:number,fileId:string,permission:"READ"|"DELETE")=>{
    if(!isValidKey(fileId)) return null;
    return prisma.file.findFirst({where:{file_id:fileId,deleted_at:null,...(permission==="READ"?readFilter(userId):accessFilter(userId,permission))}});
}

export const listTrashService=async(userId:number)=>{
    const [files,folders]=await Promise.all([
        prisma.file.findMany({where:{owner_id:userId,deleted_at:{not:null},OR:[{folder_id:null},{folder:{is:{deleted_at:null}}}]},orderBy:{deleted_at:"desc"}}),
        prisma.folder.findMany({where:{owner_id:userId,deleted_at:{not:null},OR:[{parent_folder_id:null},{parent:{is:{deleted_at:null}}}]},orderBy:{deleted_at:"desc"}})
    ]);
    return {files:files.map(file=>({...toDto(file),deletedAt:file.deleted_at})),folders:folders.map(folder=>({
        id:folder.folder_id,name:folder.folder_name,parentId:folder.parent_folder_id,deletedAt:folder.deleted_at
    }))};
}

export const restoreFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const touched=await prisma.$transaction(async tx=>{
        await lockOwner(tx,userId);
        const file=await tx.file.findFirst({where:{file_id:fileId,owner_id:userId,deleted_at:{not:null}}});
        if(!file) throw notFound("File not found");
        if(file.folder_id){
            const folder=await tx.folder.findFirst({where:{folder_id:file.folder_id,owner_id:userId,deleted_at:null},select:{folder_id:true}});
            if(!folder) throw notFound("File not found");
        }
        const scopesToInvalidate=await cacheScopesFor(tx,[fileId]);
        await tx.file.update({where:{file_id:fileId},data:{deleted_at:null}});
        return scopesToInvalidate;
    });
    await invalidate(...touched,scopes.userFiles(userId));
}

export const trashFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const touched=await prisma.$transaction(async tx=>{
        await lockOwner(tx,userId);
        const file=await tx.file.findFirst({where:{file_id:fileId,owner_id:userId,deleted_at:null},select:{file_id:true}});
        if(!file) throw notFound("File not found");
        const scopesToInvalidate=await cacheScopesFor(tx,[fileId]);
        await tx.file.update({where:{file_id:fileId},data:{deleted_at:new Date()}});
        return scopesToInvalidate;
    });
    await invalidate(...touched,scopes.userFiles(userId));
}

export const permanentlyDeleteTrashedFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const file=await prisma.file.findFirst({where:{file_id:fileId,owner_id:userId,deleted_at:{not:null}},select:{file_id:true}});
    if(!file) throw notFound("File not found");
    await deleteFileService(fileId);
}

export const deleteFileService=async(fileId:string)=>{
    const touched=await cacheScopesFor(prisma,[fileId]);
    await prisma.file.delete({where:{file_id:fileId}});
    await invalidate(...touched);
    await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
}
