import { rows, one, execute, type Db } from "../db/query.ts";

export type FolderRow = {
    folder_id:string,
    owner_id:number,
    parent_folder_id:string|null,
    folder_name:string,
    created_at:Date,
    updated_at:Date,
    deleted_at:Date|null
};

const FOLDER_COLUMNS=`folder_id, owner_id, parent_folder_id, folder_name, created_at, updated_at, deleted_at`;

export const lockOwner=(db:Db,ownerId:number)=>
    db.query(`SELECT pg_advisory_xact_lock(1, $1::int)`,[ownerId]);

export const findOwnedFolder=(db:Db,folderId:string,ownerId:number,state:"live"|"trashed"|"any")=>
    one<FolderRow>(db,
        `SELECT ${FOLDER_COLUMNS} FROM folders WHERE folder_id = $1 AND owner_id = $2${state==="live"?" AND deleted_at IS NULL":state==="trashed"?" AND deleted_at IS NOT NULL":""} LIMIT 1`,
        [folderId,ownerId]);

export const folderChain=(db:Db,folderId:string,maxDepth:number)=>
    rows<{folder_id:string,folder_name:string}>(db,`
    WITH RECURSIVE chain AS (
        SELECT folder_id, folder_name, parent_folder_id, 1 AS depth FROM folders WHERE folder_id = $1::uuid
        UNION ALL
        SELECT f.folder_id, f.folder_name, f.parent_folder_id, c.depth + 1
        FROM folders f JOIN chain c ON f.folder_id = c.parent_folder_id
        WHERE c.depth < $2
    )
    SELECT folder_id, folder_name FROM chain ORDER BY depth`,[folderId,maxDepth]);

export const folderTree=(db:Db,ownerId:number,folderId:string,maxDepth:number)=>
    rows<{folder_id:string,depth:number}>(db,`
    WITH RECURSIVE tree AS (
        SELECT folder_id, 0 AS depth FROM folders WHERE folder_id = $1::uuid AND owner_id = $2
        UNION ALL
        SELECT f.folder_id, t.depth + 1 FROM folders f JOIN tree t ON f.parent_folder_id = t.folder_id
        WHERE t.depth < $3
    )
    SELECT folder_id, depth FROM tree`,[folderId,ownerId,maxDepth]);

export const insertFolder=async(db:Db,data:{folder_id:string,owner_id:number,folder_name:string,parent_folder_id:string|null})=>
    (await one<FolderRow>(db,
        `INSERT INTO folders (folder_id, owner_id, folder_name, parent_folder_id, updated_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${FOLDER_COLUMNS}`,
        [data.folder_id,data.owner_id,data.folder_name,data.parent_folder_id,new Date()]))!;

export const listLiveChildFolders=(db:Db,ownerId:number,parentId:string|null)=>parentId===null
    ? rows<FolderRow>(db,`SELECT ${FOLDER_COLUMNS} FROM folders WHERE owner_id = $1 AND parent_folder_id IS NULL AND deleted_at IS NULL ORDER BY folder_name ASC`,[ownerId])
    : rows<FolderRow>(db,`SELECT ${FOLDER_COLUMNS} FROM folders WHERE owner_id = $1 AND parent_folder_id = $2 AND deleted_at IS NULL ORDER BY folder_name ASC`,[ownerId,parentId]);

export const renameFolder=(db:Db,folderId:string,name:string)=>
    one<FolderRow>(db,`UPDATE folders SET folder_name = $2, updated_at = $3 WHERE folder_id = $1 RETURNING ${FOLDER_COLUMNS}`,[folderId,name,new Date()]);

export const setFolderParent=(db:Db,folderId:string,parentId:string|null)=>
    one<FolderRow>(db,`UPDATE folders SET parent_folder_id = $2, updated_at = $3 WHERE folder_id = $1 RETURNING ${FOLDER_COLUMNS}`,[folderId,parentId,new Date()]);

export const setFoldersDeletedAt=(db:Db,folderIds:string[],from:Date|null,to:Date|null)=>from===null
    ? execute(db,`UPDATE folders SET deleted_at = $2, updated_at = $3 WHERE folder_id = ANY($1::uuid[]) AND deleted_at IS NULL`,[folderIds,to,new Date()])
    : execute(db,`UPDATE folders SET deleted_at = $3, updated_at = $4 WHERE folder_id = ANY($1::uuid[]) AND deleted_at = $2`,[folderIds,from,to,new Date()]);

export const listTrashedTopFolders=(db:Db,ownerId:number)=>
    rows<FolderRow>(db,
        `SELECT ${FOLDER_COLUMNS} FROM folders f
         WHERE f.owner_id = $1 AND f.deleted_at IS NOT NULL
           AND (f.parent_folder_id IS NULL OR EXISTS (SELECT 1 FROM folders p WHERE p.folder_id = f.parent_folder_id AND p.deleted_at IS NULL))
         ORDER BY f.deleted_at DESC`,
        [ownerId]);

export const deleteFoldersByIds=(db:Db,folderIds:string[])=>
    execute(db,`DELETE FROM folders WHERE folder_id = ANY($1::uuid[])`,[folderIds]);
