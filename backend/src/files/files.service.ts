import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.ts"
import { extname } from "node:path";
import { storage, isValidKey } from "./storage.ts";
import { PLANS, currentPlanFor } from "../plans/plans.ts";

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
    size:number
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

const toDto=(file:{file_id:string,file_name:string,file_size:bigint,file_type:string,uploaded_at:Date})=>({
    id:file.file_id,
    name:file.file_name,
    size:Number(file.file_size),
    type:file.file_type,
    uploadedAt:file.uploaded_at
});

// the file id doubles as the storage key. content is stored first so a failed
// write never leaves a database row pointing at nothing
export const uploadFileService=async(data:uploadData)=>{
    const usage=await getUsageService(data.ownerId);
    if(usage.usedBytes+data.size>usage.limitBytes) throw new QuotaExceededError();
    const fileId=randomUUID();
    await storage.commit(data.tempPath,fileId);
    try{
        const file=await prisma.file.create({
            data:{
                file_id:fileId,
                owner_id:data.ownerId,
                file_name:data.fileName,
                file_size:data.size,
                file_type:deriveFileType(data.fileName,data.mimeType)
            }
        })
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

export const listFilesService=async(userId:number)=>{
    const files=await prisma.file.findMany({
        where:accessFilter(userId,"READ"),
        orderBy:{uploaded_at:"desc"}
    });
    return {files:files.map(toDto)};
}

// returns null for both "does not exist" and "not yours" so ids cannot be probed
export const findAccessibleFile=async(userId:number,fileId:string,permission:"READ"|"DELETE")=>{
    if(!isValidKey(fileId)) return null;
    return prisma.file.findFirst({where:{file_id:fileId,...accessFilter(userId,permission)}});
}

export const deleteFileService=async(fileId:string)=>{
    await prisma.file.delete({where:{file_id:fileId}});
    await storage.remove(fileId).catch(err=>console.error("orphaned file left on disk:",fileId,err));
}
