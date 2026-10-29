import { prisma } from "../lib/prisma.ts";
import { storage } from "../files/storage.ts";
import { toDto } from "../files/files.service.ts";
import { notFound, conflict, badRequest, isUniqueViolation, isUuid } from "../lib/errors.ts";
import { cached, invalidate, scopes, TTL } from "../cache/cache.ts";
import { cacheScopesFor } from "../files/files.service.ts";

export const MAX_DEPTH=50;

type Tx=Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Row={folder_id:string,folder_name:string,parent_folder_id:string|null,created_at:Date,updated_at:Date};

const toFolderDto=(f:Row)=>({
    id:f.folder_id,
    name:f.folder_name,
    parentId:f.parent_folder_id,
    createdAt:f.created_at,
    updatedAt:f.updated_at
});

const DUPLICATE="A folder with that name already exists here";

const lockOwner=(tx:Tx,ownerId:number)=>tx.$executeRaw`SELECT pg_advisory_xact_lock(1, ${ownerId}::int)`;

const ownedFolder=async(tx:Tx|typeof prisma,ownerId:number,folderId:string)=>{
    if(!isUuid(folderId)) throw notFound("Folder not found");
    const folder=await tx.folder.findFirst({where:{folder_id:folderId,owner_id:ownerId,deleted_at:null}});
    if(!folder) throw notFound("Folder not found");
    return folder;
}

const chainOf=(tx:Tx|typeof prisma,folderId:string)=>tx.$queryRaw<{folder_id:string,folder_name:string}[]>`
    WITH RECURSIVE chain AS (
        SELECT folder_id, folder_name, parent_folder_id, 1 AS depth FROM folders WHERE folder_id=${folderId}::uuid
        UNION ALL
        SELECT f.folder_id, f.folder_name, f.parent_folder_id, c.depth+1
        FROM folders f JOIN chain c ON f.folder_id=c.parent_folder_id
        WHERE c.depth<${MAX_DEPTH*4}
    )
    SELECT folder_id, folder_name FROM chain ORDER BY depth`;

export const createFolderService=async(userId:number,name:string,parentId:string|null)=>{
    try{
        const folder=await prisma.$transaction(async tx=>{
            await lockOwner(tx,userId);
            if(parentId){
                await ownedFolder(tx,userId,parentId);
                if((await chainOf(tx,parentId)).length>=MAX_DEPTH) throw badRequest("Folders are nested too deeply");
            }
            return toFolderDto(await tx.folder.create({data:{owner_id:userId,folder_name:name,parent_folder_id:parentId}}));
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
    const folder=id?await ownedFolder(prisma,userId,id):null;
    const [folders,files,chain]=await Promise.all([
        prisma.folder.findMany({where:{owner_id:userId,parent_folder_id:id,deleted_at:null},orderBy:{folder_name:"asc"}}),
        prisma.file.findMany({where:{owner_id:userId,folder_id:id,deleted_at:null},orderBy:{uploaded_at:"desc"}}),
        id?chainOf(prisma,id):Promise.resolve([])
    ]);
    return {
        folder:folder?toFolderDto(folder):null,
        breadcrumb:chain.reverse().map(c=>({id:c.folder_id,name:c.folder_name})),
        folders:folders.map(toFolderDto),
        files:files.map(toDto)
    };
}

export const renameFolderService=async(userId:number,id:string,name:string)=>{
    await ownedFolder(prisma,userId,id);
    try{
        const folder=toFolderDto(await prisma.folder.update({where:{folder_id:id},data:{folder_name:name}}));
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
        const folder=await prisma.$transaction(async tx=>{
            await lockOwner(tx,userId);
            const folder=await ownedFolder(tx,userId,id);
            if(newParentId){
                await ownedFolder(tx,userId,newParentId);
                const chain=await chainOf(tx,newParentId);
                if(chain.some(c=>c.folder_id===id)) throw badRequest("A folder can't be moved into itself or one of its subfolders");
                if(chain.length>=MAX_DEPTH) throw badRequest("Folders are nested too deeply");
            }
            if(folder.parent_folder_id===newParentId) return toFolderDto(folder);
            return toFolderDto(await tx.folder.update({where:{folder_id:id},data:{parent_folder_id:newParentId}}));
        });
        await invalidate(scopes.userFiles(userId));
        return folder;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

const folderTree=async(db:Tx|typeof prisma,userId:number,id:string)=>db.$queryRaw<{folder_id:string,depth:number}[]>`
    WITH RECURSIVE tree AS (
        SELECT folder_id, 0 AS depth FROM folders WHERE folder_id=${id}::uuid AND owner_id=${userId}
        UNION ALL
        SELECT f.folder_id, t.depth+1 FROM folders f JOIN tree t ON f.parent_folder_id=t.folder_id
        WHERE t.depth<${MAX_DEPTH*4}
    )
    SELECT folder_id, depth FROM tree`;

export const trashFolderService=async(userId:number,id:string)=>{
    const touched=await prisma.$transaction(async tx=>{
        await lockOwner(tx,userId);
        await ownedFolder(tx,userId,id);
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(folder=>folder.folder_id);
        const files=await tx.file.findMany({where:{folder_id:{in:folderIds},deleted_at:null},select:{file_id:true}});
        const scopesToInvalidate=await cacheScopesFor(tx,files.map(file=>file.file_id));
        const deletedAt=new Date();
        await tx.folder.updateMany({where:{folder_id:{in:folderIds},deleted_at:null},data:{deleted_at:deletedAt}});
        await tx.file.updateMany({where:{folder_id:{in:folderIds},deleted_at:null},data:{deleted_at:deletedAt}});
        return scopesToInvalidate;
    });
    await invalidate(scopes.userFiles(userId),...touched);
}

export const restoreFolderService=async(userId:number,id:string)=>{
    try{
    const touched=await prisma.$transaction(async tx=>{
        await lockOwner(tx,userId);
        const folder=await tx.folder.findFirst({where:{folder_id:id,owner_id:userId,deleted_at:{not:null}}});
        if(!folder) throw notFound("Folder not found");
        if(folder.parent_folder_id){
            const parent=await tx.folder.findFirst({where:{folder_id:folder.parent_folder_id,owner_id:userId,deleted_at:null},select:{folder_id:true}});
            if(!parent) throw badRequest("Restore the parent folder first");
        }
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(entry=>entry.folder_id);
        const files=await tx.file.findMany({where:{folder_id:{in:folderIds},deleted_at:folder.deleted_at},select:{file_id:true}});
        const scopesToInvalidate=await cacheScopesFor(tx,files.map(file=>file.file_id));
        await tx.folder.updateMany({where:{folder_id:{in:folderIds},deleted_at:folder.deleted_at},data:{deleted_at:null}});
        await tx.file.updateMany({where:{folder_id:{in:folderIds},deleted_at:folder.deleted_at},data:{deleted_at:null}});
        return scopesToInvalidate;
    });
    await invalidate(scopes.userFiles(userId),...touched);
    } catch(err){
        if(isUniqueViolation(err)) throw conflict(DUPLICATE);
        throw err;
    }
}

export const deleteFolderService=async(userId:number,id:string)=>{
    const fileIds=await prisma.$transaction(async tx=>{
        await lockOwner(tx,userId);
        const folder=await tx.folder.findFirst({where:{folder_id:id,owner_id:userId,deleted_at:{not:null}}});
        if(!folder) throw notFound("Folder not found");
        const tree=await folderTree(tx,userId,id);
        const folderIds=tree.map(t=>t.folder_id);
        const files=await tx.file.findMany({where:{folder_id:{in:folderIds}},select:{file_id:true}});
        const touched=await cacheScopesFor(tx,files.map(f=>f.file_id));
        await tx.file.deleteMany({where:{file_id:{in:files.map(f=>f.file_id)}}});
        const maxDepth=Math.max(...tree.map(t=>t.depth));
        for(let d=maxDepth;d>=0;d--){
            await tx.folder.deleteMany({where:{folder_id:{in:tree.filter(t=>t.depth===d).map(t=>t.folder_id)}}});
        }
        return {files:files.map(f=>f.file_id),folders:folderIds.length,touched};
    });
    await invalidate(scopes.userFiles(userId),...fileIds.touched);
    for(const fileId of fileIds.files){
        await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
    }
    return {deletedFolders:fileIds.folders,deletedFiles:fileIds.files.length};
}
