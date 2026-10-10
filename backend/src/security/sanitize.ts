import type { Request, Response, NextFunction } from "express";

// keys that enable prototype pollution
const FORBIDDEN_KEYS=new Set(["__proto__","constructor","prototype"]);
const MAX_DEPTH=10;

// removes null bytes / control chars that break logs, file systems and some db drivers
export const cleanString=(value:string)=>value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"");

// recursively strips pollution keys and mongo operator keys ($where, a.b) and cleans strings
const sanitizeValue=(value:unknown,depth=0):unknown=>{
    if(typeof value==="string") return cleanString(value);
    if(value===null || typeof value!=="object") return value;
    if(depth>=MAX_DEPTH) return undefined;
    if(Array.isArray(value)) return value.map(v=>sanitizeValue(v,depth+1));
    const out:Record<string,unknown>={};
    for(const [key,val] of Object.entries(value as Record<string,unknown>)){
        if(FORBIDDEN_KEYS.has(key) || key.startsWith("$") || key.includes(".")) continue;
        out[key]=sanitizeValue(val,depth+1);
    }
    return out;
}

export const sanitizeInput=(req:Request,_res:Response,next:NextFunction)=>{
    if(req.body && typeof req.body==="object"){
        req.body=sanitizeValue(req.body);
    }
    // express 5 makes req.query a getter, so redefine it with the cleaned copy
    const query=sanitizeValue(req.query);
    Object.defineProperty(req,"query",{value:query,writable:true,configurable:true,enumerable:true});
    next();
}
