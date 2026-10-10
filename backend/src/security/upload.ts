import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { basename, extname } from "node:path";
import { cleanString } from "./sanitize.ts";

export const MAX_FILE_SIZE=25*1024*1024;
const MAX_NAME_LENGTH=200;

// executable / script types that must never be stored
const BLOCKED_EXTENSIONS=new Set([
    "exe","msi","bat","cmd","com","scr","pif","dll","sys","vbs","vbe","wsf","ps1","psm1",
    "sh","bash","zsh","jar","apk","app","dmg","iso","reg","lnk","cpl","hta",
    "php","phtml","phar","jsp","asp","aspx","cgi","pl","py","rb"
]);

// strips directories, control chars and shell/path metacharacters from a client supplied name
export const sanitizeFileName=(raw:string)=>{
    // browsers send utf8 names as latin1 bytes, normalise both slash styles before basename
    const name=basename(cleanString(raw).replace(/\\/g,"/"))
        .normalize("NFC")
        .replace(/[<>:"|?*‪-‮⁦-⁩]/g,"_") // includes bidi overrides used to spoof extensions
        .replace(/^\.+/,"")
        .trim();

    if(name.length<=MAX_NAME_LENGTH) return name;
    const ext=extname(name);
    return name.slice(0,MAX_NAME_LENGTH-ext.length)+ext;
}

// a double extension like invoice.pdf.exe is rejected because any dotted segment is checked
export const isBlockedName=(name:string)=>
    name.toLowerCase().split(".").slice(1).some(part=>BLOCKED_EXTENSIONS.has(part));

export const multipart=multer({
    storage:multer.memoryStorage(),
    limits:{fileSize:MAX_FILE_SIZE,files:1,fields:5,fieldSize:1024,parts:10},
    fileFilter:(_req,file,cb)=>{
        const name=sanitizeFileName(file.originalname);
        if(!name) return cb(new Error("INVALID_FILE_NAME"));
        if(isBlockedName(name)) return cb(new Error("BLOCKED_FILE_TYPE"));
        file.originalname=name;
        cb(null,true);
    }
});

export const uploadErrorHandler=(err:unknown,_req:Request,res:Response,next:NextFunction)=>{
    if(err instanceof multer.MulterError){
        if(err.code==="LIMIT_FILE_SIZE"){
            return res.status(413).json({message:`File exceeds ${MAX_FILE_SIZE/1024/1024}MB limit`});
        }
        return res.status(400).json({message:"Invalid upload request"});
    }
    if(err instanceof Error && err.message==="INVALID_FILE_NAME"){
        return res.status(400).json({message:"Invalid file name"});
    }
    if(err instanceof Error && err.message==="BLOCKED_FILE_TYPE"){
        return res.status(415).json({message:"This file type is not allowed"});
    }
    next(err);
}
