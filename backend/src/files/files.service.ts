import { prisma } from "../lib/prisma.ts"
import { extname } from "node:path";

type uploadData={
    ownerId:number,
    fileName:string,
    mimeType:string,
    buffer:Buffer
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

export const uploadFileService=async(data:uploadData)=>{
    const file=await prisma.file.create({
        data:{
            owner_id:data.ownerId,
            file_name:data.fileName,
            file_size:data.buffer.length,
            file_type:deriveFileType(data.fileName,data.mimeType)
        }
    })
    await Bun.write(`uploads/${file.file_id}`,data.buffer);
    return {
        file:{
            id:file.file_id,
            name:file.file_name,
            size:Number(file.file_size),
            type:file.file_type,
            uploadedAt:file.uploaded_at
        }
    }
}
