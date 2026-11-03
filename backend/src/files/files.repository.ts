import { rows, one, execute, type Db } from "../db/query.ts";

export type FileRow = {
    file_id:string,
    owner_id:number,
    file_name:string,
    file_size:bigint,
    file_type:string,
    uploaded_at:Date,
    deleted_at:Date|null,
    folder_id:string|null
};

export const FILE_COLUMNS=`f.file_id, f.owner_id, f.file_name, f.file_size, f.file_type, f.uploaded_at, f.deleted_at, f.folder_id`;

export const accessSql=(user:string,permission:string)=>`(f.owner_id = ${user} OR EXISTS (
    SELECT 1 FROM file_permissions fp
    WHERE fp.file_id = f.file_id AND fp.user_id = ${user} AND fp.permission IN (${permission}, 'OWNER')
))`;

export const readSql=(user:string)=>`(${accessSql(user,`'READ'`)} OR EXISTS (
    SELECT 1 FROM group_files gf JOIN group_members gm ON gm.group_id = gf.group_id
    WHERE gf.file_id = f.file_id AND gm.user_id = ${user}
))`;

export const distinctOwners=(db:Db,fileIds:string[])=>
    rows<{owner_id:number}>(db,`SELECT DISTINCT owner_id FROM files WHERE file_id = ANY($1::uuid[])`,[fileIds]);

export const distinctPermissionHolders=(db:Db,fileIds:string[])=>
    rows<{user_id:number}>(db,`SELECT DISTINCT user_id FROM file_permissions WHERE file_id = ANY($1::uuid[])`,[fileIds]);

export const distinctGroupsSharing=(db:Db,fileIds:string[])=>
    rows<{group_id:string}>(db,`SELECT DISTINCT group_id FROM group_files WHERE file_id = ANY($1::uuid[])`,[fileIds]);

export const distinctMembersOfGroups=(db:Db,groupIds:string[])=>
    rows<{user_id:number}>(db,`SELECT DISTINCT user_id FROM group_members WHERE group_id = ANY($1::uuid[])`,[groupIds]);

export const totalFileSize=async(db:Db,ownerId:number)=>{
    const row=await one<{total:string|null}>(db,`SELECT SUM(file_size) AS total FROM files WHERE owner_id = $1`,[ownerId]);
    return Number(row?.total ?? 0);
}

export const insertFile=async(db:Db,data:{file_id:string,owner_id:number,file_name:string,file_size:number,file_type:string,folder_id:string|null})=>
    (await one<FileRow>(db,
        `INSERT INTO files AS f (file_id, owner_id, file_name, file_size, file_type, folder_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FILE_COLUMNS}`,
        [data.file_id,data.owner_id,data.file_name,data.file_size,data.file_type,data.folder_id]))!;

export const listAccessibleFiles=(db:Db,userId:number)=>
    rows<FileRow>(db,
        `SELECT ${FILE_COLUMNS} FROM files f WHERE f.deleted_at IS NULL AND ${accessSql("$1","$2")} ORDER BY f.uploaded_at DESC`,
        [userId,"READ"]);

export const listLiveFilesIn=(db:Db,ownerId:number,folderId:string|null)=>folderId===null
    ? rows<FileRow>(db,`SELECT ${FILE_COLUMNS} FROM files f WHERE f.owner_id = $1 AND f.folder_id IS NULL AND f.deleted_at IS NULL ORDER BY f.uploaded_at DESC`,[ownerId])
    : rows<FileRow>(db,`SELECT ${FILE_COLUMNS} FROM files f WHERE f.owner_id = $1 AND f.folder_id = $2 AND f.deleted_at IS NULL ORDER BY f.uploaded_at DESC`,[ownerId,folderId]);

export const findOwnedFile=(db:Db,fileId:string,ownerId:number,trashed:boolean)=>
    one<FileRow>(db,
        `SELECT ${FILE_COLUMNS} FROM files f WHERE f.file_id = $1 AND f.owner_id = $2 AND f.deleted_at IS ${trashed?"NOT NULL":"NULL"} LIMIT 1`,
        [fileId,ownerId]);

export const findAccessibleFile=(db:Db,userId:number,fileId:string,permission:"READ"|"DELETE")=>
    one<FileRow>(db,
        `SELECT ${FILE_COLUMNS} FROM files f WHERE f.file_id = $1 AND f.deleted_at IS NULL AND ${permission==="READ"?readSql("$2"):accessSql("$2","$3")} LIMIT 1`,
        permission==="READ"?[fileId,userId]:[fileId,userId,permission]);

export const updateFileFolder=(db:Db,fileId:string,folderId:string|null)=>
    one<FileRow>(db,`UPDATE files AS f SET folder_id = $2 WHERE f.file_id = $1 RETURNING ${FILE_COLUMNS}`,[fileId,folderId]);

export const setFileDeletedAt=(db:Db,fileId:string,deletedAt:Date|null)=>
    execute(db,`UPDATE files SET deleted_at = $2 WHERE file_id = $1`,[fileId,deletedAt]);

export const listTrashedTopFiles=(db:Db,ownerId:number)=>
    rows<FileRow>(db,
        `SELECT ${FILE_COLUMNS} FROM files f
         WHERE f.owner_id = $1 AND f.deleted_at IS NOT NULL
           AND (f.folder_id IS NULL OR EXISTS (SELECT 1 FROM folders p WHERE p.folder_id = f.folder_id AND p.deleted_at IS NULL))
         ORDER BY f.deleted_at DESC`,
        [ownerId]);

export const deleteFileById=(db:Db,fileId:string)=>
    execute(db,`DELETE FROM files WHERE file_id = $1`,[fileId]);

export const listFileIdsInFolders=(db:Db,folderIds:string[],deleted:{is:"live"}|{is:"any"}|{is:"at",at:Date})=>{
    if(deleted.is==="any") return rows<{file_id:string}>(db,`SELECT file_id FROM files WHERE folder_id = ANY($1::uuid[])`,[folderIds]);
    if(deleted.is==="live") return rows<{file_id:string}>(db,`SELECT file_id FROM files WHERE folder_id = ANY($1::uuid[]) AND deleted_at IS NULL`,[folderIds]);
    return rows<{file_id:string}>(db,`SELECT file_id FROM files WHERE folder_id = ANY($1::uuid[]) AND deleted_at = $2`,[folderIds,deleted.at]);
}

export const setFilesDeletedAtInFolders=(db:Db,folderIds:string[],from:Date|null,to:Date|null)=>from===null
    ? execute(db,`UPDATE files SET deleted_at = $2 WHERE folder_id = ANY($1::uuid[]) AND deleted_at IS NULL`,[folderIds,to])
    : execute(db,`UPDATE files SET deleted_at = $3 WHERE folder_id = ANY($1::uuid[]) AND deleted_at = $2`,[folderIds,from,to]);

export const deleteFilesByIds=(db:Db,fileIds:string[])=>
    execute(db,`DELETE FROM files WHERE file_id = ANY($1::uuid[])`,[fileIds]);
