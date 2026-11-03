import { rows, one, type Db } from "../db/query.ts";
import { FILE_COLUMNS, readSql, type FileRow } from "./files.repository.ts";

export type ViewRow = {view_id:number,user_id:number,file_id:string,viewed_at:Date};

export const upsertView=async(db:Db,userId:number,fileId:string)=>
    (await one<ViewRow>(db,
        `INSERT INTO file_view_history (user_id, file_id, viewed_at) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, file_id) DO UPDATE SET viewed_at = EXCLUDED.viewed_at
         RETURNING view_id, user_id, file_id, viewed_at`,
        [userId,fileId,new Date()]))!;

export const listRecentViews=async(db:Db,userId:number,limit:number,cursor:{at:Date,id:number}|null)=>{
    const values:unknown[]=[userId,limit];
    const after=cursor?` AND (v.viewed_at < $3 OR (v.viewed_at = $3 AND v.view_id < $4))`:"";
    if(cursor) values.push(cursor.at,cursor.id);
    const result=await rows<FileRow & {view_id:number,viewed_at:Date}>(db,
        `SELECT v.view_id, v.viewed_at, ${FILE_COLUMNS}
         FROM file_view_history v JOIN files f ON f.file_id = v.file_id
         WHERE v.user_id = $1 AND f.deleted_at IS NULL AND ${readSql("$1")}${after}
         ORDER BY v.viewed_at DESC, v.view_id DESC
         LIMIT $2`,
        values);
    return result.map(({view_id,viewed_at,...file})=>({view_id,viewed_at,file}));
}
