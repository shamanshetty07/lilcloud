import { randomUUID } from "node:crypto";
import { pool, transaction, type Db } from "../db/client.ts";
import { extname } from "node:path";
import { storage, isValidKey } from "./storage.ts";
import { PLANS, currentPlanFor } from "../plans/plans.ts";
import { notFound } from "../lib/errors.ts";
import { cached, cacheOn, invalidate, hash, scopes, TTL } from "../cache/cache.ts";

import * as repo from "./files.repository.ts";
import { findOwnedFolder, lockOwner, listTrashedTopFolders } from "../folders/folders.repository.ts";
import { findMembership, insertGroupFile } from "../groups/groups.repository.ts";

export const cacheScopesFor=async(db:Db,fileIds:string[])=>{
    if(!cacheOn() || !fileIds.length) return [];
    const owners=await repo.distinctOwners(db,fileIds);
    const holders=await repo.distinctPermissionHolders(db,fileIds);
    const links=await repo.distinctGroupsSharing(db,fileIds);
    const groupMembers=links.length?await repo.distinctMembersOfGroups(db,links.map(link=>link.group_id)):[];
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

const usageNow=async(userId:number)=>{
    const usedBytes=await repo.totalFileSize(pool,userId);
    const plan=currentPlanFor(userId);
    return {plan,usedBytes,limitBytes:PLANS[plan].limitBytes};
}

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
    folderId?:string|null,
    groupId?:string
}

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

export const uploadFileService=async(data:uploadData)=>{
    const usage=await usageNow(data.ownerId);
    if(usage.usedBytes+data.size>usage.limitBytes) throw new QuotaExceededError();
    const fileId=randomUUID();
    await storage.commit(data.tempPath,fileId);
    let created:repo.FileRow;
    try{
        const file=await transaction(async tx=>{
            if(data.folderId){
                const folder=await findOwnedFolder(tx,data.folderId,data.ownerId,"live");
                if(!folder) throw notFound("Folder not found");
            }
            if(data.groupId){
                const member=await findMembership(tx,data.groupId,data.ownerId);
                if(!member) throw notFound("Group not found");
            }
            const file=await repo.insertFile(tx,{
                file_id:fileId,
                owner_id:data.ownerId,
                file_name:data.fileName,
                file_size:data.size,
                file_type:deriveFileType(data.fileName,data.mimeType),
                folder_id:data.folderId ?? null
            });
            if(data.groupId) await insertGroupFile(tx,data.groupId,fileId,data.ownerId);
            return file;
        });
        created=file;
    }
    catch(err){
        await storage.remove(fileId).catch(()=>{});
        throw err;
    }
    await invalidate(scopes.userFiles(data.ownerId),...(data.groupId?[scopes.group(data.groupId)]:[]));
    return {file:toDto(created)};
}

export const listFilesService=(userId:number,folderId?:string|null)=>cached({
    scope:scopes.userFiles(userId),key:`list:${hash(folderId===undefined?"all":folderId)}`,ttl:TTL.folder,
    validate:(v):v is {files:ReturnType<typeof toDto>[]}=>Array.isArray((v as any)?.files),
    load:async()=>{
        if(folderId){
            const folder=await findOwnedFolder(pool,folderId,userId,"any");
            if(!folder) throw notFound("Folder not found");
        }
        const files=folderId===undefined?await repo.listAccessibleFiles(pool,userId):await repo.listLiveFilesIn(pool,userId,folderId);
        return {files:files.map(toDto)};
    }
});

export const moveFileService=async(userId:number,fileId:string,folderId:string|null)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const {dto,touched}=await transaction(async tx=>{
        const file=await repo.findOwnedFile(tx,fileId,userId,false);
        if(!file) throw notFound("File not found");
        if(folderId){
            const folder=await findOwnedFolder(tx,folderId,userId,"live");
            if(!folder) throw notFound("Folder not found");
        }
        const updated=await repo.updateFileFolder(tx,fileId,folderId);
        if(!updated) throw notFound("File not found");
        const dto=toDto(updated);
        return {dto,touched:await cacheScopesFor(tx,[fileId])};
    });
    await invalidate(...touched);
    return dto;
}

export const findAccessibleFile=async(userId:number,fileId:string,permission:"READ"|"DELETE")=>{
    if(!isValidKey(fileId)) return null;
    return repo.findAccessibleFile(pool,userId,fileId,permission);
}

export const listTrashService=async(userId:number)=>{
    const [files,folders]=await Promise.all([
        repo.listTrashedTopFiles(pool,userId),
        listTrashedTopFolders(pool,userId)
    ]);
    return {files:files.map(file=>({...toDto(file),deletedAt:file.deleted_at})),folders:folders.map(folder=>({
        id:folder.folder_id,name:folder.folder_name,parentId:folder.parent_folder_id,deletedAt:folder.deleted_at
    }))};
}

export const restoreFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const touched=await transaction(async tx=>{
        await lockOwner(tx,userId);
        const file=await repo.findOwnedFile(tx,fileId,userId,true);
        if(!file) throw notFound("File not found");
        if(file.folder_id){
            const folder=await findOwnedFolder(tx,file.folder_id,userId,"live");
            if(!folder) throw notFound("File not found");
        }
        const scopesToInvalidate=await cacheScopesFor(tx,[fileId]);
        if(!await repo.setFileDeletedAt(tx,fileId,null)) throw notFound("File not found");
        return scopesToInvalidate;
    });
    await invalidate(...touched,scopes.userFiles(userId));
}

export const trashFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const touched=await transaction(async tx=>{
        await lockOwner(tx,userId);
        const file=await repo.findOwnedFile(tx,fileId,userId,false);
        if(!file) throw notFound("File not found");
        const scopesToInvalidate=await cacheScopesFor(tx,[fileId]);
        if(!await repo.setFileDeletedAt(tx,fileId,new Date())) throw notFound("File not found");
        return scopesToInvalidate;
    });
    await invalidate(...touched,scopes.userFiles(userId));
}

export const permanentlyDeleteTrashedFileService=async(userId:number,fileId:string)=>{
    if(!isValidKey(fileId)) throw notFound("File not found");
    const file=await repo.findOwnedFile(pool,fileId,userId,true);
    if(!file) throw notFound("File not found");
    await deleteFileService(fileId);
}

export const deleteFileService=async(fileId:string)=>{
    const touched=await cacheScopesFor(pool,[fileId]);
    if(!await repo.deleteFileById(pool,fileId)) throw notFound("File not found");
    await invalidate(...touched);
    await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
}
