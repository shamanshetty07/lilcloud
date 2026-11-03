import { randomUUID } from "node:crypto";
import { pool, transaction, type Db } from "../db/client.ts";
import { storage } from "../files/storage.ts";
import { toDto } from "../files/files.service.ts";
import { notFound, conflict, badRequest, isUniqueViolation, isUuid } from "../lib/errors.ts";
import { cached, invalidate, scopes, TTL } from "../cache/cache.ts";
import { cacheScopesFor } from "../files/files.service.ts";
import * as repo from "./folders.repository.ts";
import { listLiveFilesIn, listFileIdsInFolders, setFilesDeletedAtInFolders, deleteFilesByIds } from "../files/files.repository.ts";

export const MAX_DEPTH=50;

type Row={folder_id:string,folder_name:string,parent_folder_id:string|null,created_at:Date,updated_at:Date};

const toFolderDto=(f:Row)=>({
    id:f.folder_id,
    name:f.folder_name,
    parentId:f.parent_folder_id,
    createdAt:f.created_at,
    updatedAt:f.updated_at
});

const DUPLICATE="A folder with that name already exists here";

const lockOwner=repo.lockOwner;

const ownedFolder=async(tx:Db,ownerId:number,folderId:string)=>{
    if(!isUuid(folderId)) throw notFound("Folder not found");
    const folder=await repo.findOwnedFolder(tx,folderId,ownerId,"live");
    if(!folder) throw notFound("Folder not found");
    return folder;
}

const chainOf=(tx:Db,folderId:string)=>repo.folderChain(tx,folderId,MAX_DEPTH*4);

export const createFolderService=async(userId:number,name:string,parentId:string|null)=>{
    try{
        const folder=await transaction(async tx=>{
            await lockOwner(tx,userId);
            if(parentId){
                await ownedFolder(tx,userId,parentId);
                if((await chainOf(tx,parentId)).length>=MAX_DEPTH) throw badRequest("Folders are nested too deeply");
            }
            return toFolderDto(await repo.insertFolder(tx,{folder_id:randomUUID(),owner_id:userId,folder_name:name,parent_folder_id:parentId}));
        });
        await invalidate(scopes.userFiles(userId));
        return folder;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

export const getFolderContentsService=(userId:number,id:string|null)=>cached({
    scope:scopes.userFiles(userId),key:`folder:${id ?? "root"}`,ttl:TTL.folder,
    validate:(v):v is Awaited<ReturnType<typeof loadFolderContents>>=>Array.isArray((v as any)?.files) && Array.isArray((v as any)?.folders),
    load:()=>loadFolderContents(userId,id)
});

const loadFolderContents=async(userId:number,id:string|null)=>{
    const folder=id?await ownedFolder(pool,userId,id):null;
    const [folders,files,chain]=await Promise.all([
        repo.listLiveChildFolders(pool,userId,id),
        listLiveFilesIn(pool,userId,id),
        id?chainOf(pool,id):Promise.resolve([])
    ]);
    return {
        folder:folder?toFolderDto(folder):null,
        breadcrumb:chain.reverse().map(c=>({id:c.folder_id,name:c.folder_name})),
        folders:folders.map(toFolderDto),
        files:files.map(toDto)
    };
}

export const renameFolderService=async(userId:number,id:string,name:string)=>{
    await ownedFolder(pool,userId,id);
    try{
        const renamed=await repo.renameFolder(pool,id,name);
        if(!renamed) throw notFound("Folder not found");
        const folder=toFolderDto(renamed);
        await invalidate(scopes.userFiles(userId));
        return folder;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

export const moveFolderService=async(userId:number,id:string,newParentId:string|null)=>{
    try{
        const folder=await transaction(async tx=>{
            await lockOwner(tx,userId);
            const folder=await ownedFolder(tx,userId,id);
            if(newParentId){
                await ownedFolder(tx,userId,newParentId);
                const chain=await chainOf(tx,newParentId);
                if(chain.some(c=>c.folder_id===id)) throw badRequest("A folder can't be moved into itself or one of its subfolders");
                if(chain.length>=MAX_DEPTH) throw badRequest("Folders are nested too deeply");
            }
            if(folder.parent_folder_id===newParentId) return toFolderDto(folder);
            const moved=await repo.setFolderParent(tx,id,newParentId);
            if(!moved) throw notFound("Folder not found");
            return toFolderDto(moved);
        });
        await invalidate(scopes.userFiles(userId));
        return folder;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

const folderTree=(db:Db,userId:number,id:string)=>repo.folderTree(db,userId,id,MAX_DEPTH*4);

export const trashFolderService=async(userId:number,id:string)=>{
    const touched=await transaction(async tx=>{
        await lockOwner(tx,userId);
        await ownedFolder(tx,userId,id);
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(folder=>folder.folder_id);
        const files=await listFileIdsInFolders(tx,folderIds,{is:"live"});
        const scopesToInvalidate=await cacheScopesFor(tx,files.map(file=>file.file_id));
        const deletedAt=new Date();
        await repo.setFoldersDeletedAt(tx,folderIds,null,deletedAt);
        await setFilesDeletedAtInFolders(tx,folderIds,null,deletedAt);
        return scopesToInvalidate;
    });
    await invalidate(scopes.userFiles(userId),...touched);
}

export const restoreFolderService=async(userId:number,id:string)=>{
    try{
    const touched=await transaction(async tx=>{
        await lockOwner(tx,userId);
        const folder=await repo.findOwnedFolder(tx,id,userId,"trashed");
        if(!folder || !folder.deleted_at) throw notFound("Folder not found");
        const deletedAt=folder.deleted_at;
        if(folder.parent_folder_id){
            const parent=await repo.findOwnedFolder(tx,folder.parent_folder_id,userId,"live");
            if(!parent) throw badRequest("Restore the parent folder first");
        }
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(entry=>entry.folder_id);
        const files=await listFileIdsInFolders(tx,folderIds,{is:"at",at:deletedAt});
        const scopesToInvalidate=await cacheScopesFor(tx,files.map(file=>file.file_id));
        await repo.setFoldersDeletedAt(tx,folderIds,deletedAt,null);
        await setFilesDeletedAtInFolders(tx,folderIds,deletedAt,null);
        return scopesToInvalidate;
    });
    await invalidate(scopes.userFiles(userId),...touched);
    } catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

export const deleteFolderService=async(userId:number,id:string)=>{
    const fileIds=await transaction(async tx=>{
        await lockOwner(tx,userId);
        const folder=await repo.findOwnedFolder(tx,id,userId,"trashed");
        if(!folder) throw notFound("Folder not found");
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(t=>t.folder_id);
        const files=await listFileIdsInFolders(tx,folderIds,{is:"any"});
        const touched=await cacheScopesFor(tx,files.map(f=>f.file_id));
        await deleteFilesByIds(tx,files.map(f=>f.file_id));
        const maxDepth=Math.max(...tree.map(t=>t.depth));
        for(let d=maxDepth;d>=0;d--){
            await repo.deleteFoldersByIds(tx,tree.filter(t=>t.depth===d).map(t=>t.folder_id));
        }
        return {files:files.map(f=>f.file_id),folders:folderIds.length,touched};
    });
    await invalidate(scopes.userFiles(userId),...fileIds.touched);
    for(const fileId of fileIds.files){
        await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
    }
    return {deletedFolders:fileIds.folders,deletedFiles:fileIds.files.length};
}
