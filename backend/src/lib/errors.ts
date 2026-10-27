import type { Response } from "express";
import { isValidKey } from "../files/storage.ts";

// an expected failure with the http status the client should see
export class DomainError extends Error {
    constructor(public status:number,message:string,public code?:string){ super(message); }
}
export const notFound=(message="Not found")=>new DomainError(404,message);
export const forbidden=(message="You are not allowed to do that")=>new DomainError(403,message);
export const conflict=(message:string)=>new DomainError(409,message);
export const badRequest=(message:string)=>new DomainError(400,message);

// ids are uuids; anything else would make postgres throw, so treat it as simply not found
export const isUuid=isValidKey;

export const isUniqueViolation=(err:unknown)=>(err as {code?:string})?.code==="P2002";

// maps known errors to their status, everything else is logged and becomes a 500
export const sendError=(res:Response,err:unknown,fallback:string)=>{
    if(err instanceof DomainError) return res.status(err.status).json({message:err.message,...(err.code?{code:err.code}:{})});
    console.error(`${fallback}:`,err);
    return res.status(500).json({message:fallback});
}
