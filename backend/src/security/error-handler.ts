import type { Request, Response, NextFunction } from "express";

// last resort handler: never leak stack traces or internals to the client
export const errorHandler=(err:any,_req:Request,res:Response,_next:NextFunction)=>{
    if(err?.type==="entity.parse.failed"){
        return res.status(400).json({message:"Malformed JSON body"});
    }
    if(err?.type==="entity.too.large"){
        return res.status(413).json({message:"Request body too large"});
    }
    console.error("unhandled error:",err);
    return res.status(500).json({message:"Internal server error"});
}
