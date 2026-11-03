import { pool } from "../db/client.ts";
import { isForeignKeyViolation } from "../db/errors.ts";
import { toDto, findAccessibleFile } from "./files.service.ts";
import { upsertView, listRecentViews } from "./views.repository.ts";
import { notFound, badRequest } from "../lib/errors.ts";
import { cached, invalidate, hash, scopes, TTL } from "../cache/cache.ts";

export const MAX_RECENT=50;

export const recordViewService=async(userId:number,fileId:string)=>{
    const file=await findAccessibleFile(userId,fileId,"READ");
    if(!file) throw notFound("File not found");
    const view=await upsertView(pool,userId,file.file_id)
        .catch(err=>{ throw isForeignKeyViolation(err)?notFound("File not found"):err; });
    await invalidate(scopes.userRecent(userId));
    return {fileId:file.file_id,viewedAt:view.viewed_at};
}

const parseCursor=(cursor:string)=>{
    const m=/^(\d{1,15})\.(\d{1,10})$/.exec(cursor);
    if(!m) throw badRequest("Invalid cursor");
    return {at:new Date(Number(m[1])),id:Number(m[2])};
}

export const listRecentService=async(userId:number,limit:number,cursor?:string)=>{
    const take=Math.min(Math.max(Math.trunc(limit)||20,1),MAX_RECENT);
    const c=cursor?parseCursor(cursor):null;
    return cached({
        scope:scopes.userRecent(userId),key:`page:${hash(take,cursor ?? null)}`,ttl:TTL.recent,
        validate:(v):v is {items:unknown[],nextCursor:string|null}=>Array.isArray((v as any)?.items),
        load:()=>loadRecent(userId,take,c)
    });
}

const loadRecent=async(userId:number,take:number,c:{at:Date,id:number}|null)=>{
    const rows=await listRecentViews(pool,userId,take+1,c);
    const page=rows.slice(0,take);
    const last=page[page.length-1];
    return {
        items:page.map(r=>({...toDto(r.file),viewedAt:r.viewed_at})),
        nextCursor:rows.length>take && last?`${last.viewed_at.getTime()}.${last.view_id}`:null
    };
}
