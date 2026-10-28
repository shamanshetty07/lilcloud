import { prisma } from "../lib/prisma.ts";
import { toDto, findAccessibleFile, readFilter } from "./files.service.ts";
import { notFound, badRequest } from "../lib/errors.ts";
import { cached, invalidate, hash, scopes, TTL } from "../cache/cache.ts";

export const MAX_RECENT=50;

// only an explicit "open" calls this. the file must be readable by the viewer right now
// (owner, permission or current group membership), and the row is always the viewer's own
export const recordViewService=async(userId:number,fileId:string)=>{
    const file=await findAccessibleFile(userId,fileId,"READ");
    if(!file) throw notFound("File not found");
    // the file can be deleted between the check and the write, which breaks the foreign key
    const view=await prisma.fileViewHistory.upsert({
        where:{user_id_file_id:{user_id:userId,file_id:file.file_id}},
        create:{user_id:userId,file_id:file.file_id},
        update:{viewed_at:new Date()}
    }).catch(err=>{ throw (err as {code?:string}).code==="P2003"?notFound("File not found"):err; });
    await invalidate(scopes.userRecent(userId));
    return {fileId:file.file_id,viewedAt:view.viewed_at};
}

// cursor is "<viewed_at ms>.<view_id>", the same order the list is sorted by
const parseCursor=(cursor:string)=>{
    const m=/^(\d{1,15})\.(\d{1,10})$/.exec(cursor);
    if(!m) throw badRequest("Invalid cursor");
    return {at:new Date(Number(m[1])),id:Number(m[2])};
}

// files that were deleted (rows cascade away) or are no longer readable are filtered out in the query
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
    const rows=await prisma.fileViewHistory.findMany({
        where:{
            user_id:userId,
            file:readFilter(userId),
            ...(c?{OR:[{viewed_at:{lt:c.at}},{viewed_at:c.at,view_id:{lt:c.id}}]}:{})
        },
        include:{file:true},
        orderBy:[{viewed_at:"desc"},{view_id:"desc"}],
        take:take+1
    });
    const page=rows.slice(0,take);
    const last=page[page.length-1];
    return {
        items:page.map(r=>({...toDto(r.file),viewedAt:r.viewed_at})),
        nextCursor:rows.length>take && last?`${last.viewed_at.getTime()}.${last.view_id}`:null
    };
}
