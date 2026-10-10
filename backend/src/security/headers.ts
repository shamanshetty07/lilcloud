import type { Request, Response, NextFunction } from "express";

// baseline hardening headers for an API that only returns JSON
export const securityHeaders=(_req:Request,res:Response,next:NextFunction)=>{
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("X-Frame-Options","DENY");
    res.setHeader("Referrer-Policy","no-referrer");
    res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cross-Origin-Resource-Policy","same-origin");
    res.setHeader("Cache-Control","no-store");
    next();
}
