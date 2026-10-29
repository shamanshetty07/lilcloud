import { mock } from "bun:test";
import jwt from "jsonwebtoken";

const url=process.env.TEST_DATABASE_URL;
export const enabled=!!url;

let app:any=null, prisma:any=null, storage:any=null, server:any=null, base="";

if(url){
    mock.module("../activity/activity.service.ts",()=>({logActivity:async()=>{}}));
    ({default:app}=await import("../server/app.ts"));
    ({prisma}=await import("../lib/prisma.ts"));
    ({storage}=await import("../files/storage.ts"));
    const [{db}]=await prisma.$queryRaw`SELECT current_database() AS db`;
    if(db!==new URL(url).pathname.slice(1)) throw new Error(`refusing to run: connected to "${db}", not the test database`);
    await storage.init();
    server=app.listen(0);
    base=`http://127.0.0.1:${server.address().port}/api/v1`;
}

export { prisma, storage };

export const reset=async()=>{
    await prisma.$executeRawUnsafe(`TRUNCATE users, files, file_permissions, folders, file_view_history, storage_groups, group_members, group_files RESTART IDENTITY CASCADE`);
}

let n=0;
export const makeUser=async(name:string)=>{
    const tag=`${name}${++n}`;
    const user=await prisma.user.create({data:{username:tag,email:`${tag}@example.com`,password_hash:"x"}});
    const token=jwt.sign({id:user.user_id,email:user.email},process.env.JWT_SECRET!,{expiresIn:"1h"});
    return {id:user.user_id as number,username:user.username as string,email:user.email as string,token};
}

export type Res={status:number,body:any,text:string};
export const http=(token?:string)=>async(method:string,path:string,body?:unknown):Promise<Res>=>{
    const headers:Record<string,string>={"X-Forwarded-For":`10.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`};
    if(token) headers.Authorization=`Bearer ${token}`;
    let payload:any;
    if(body instanceof FormData) payload=body;
    else if(body!==undefined){ headers["Content-Type"]="application/json"; payload=JSON.stringify(body); }
    const res=await fetch(base+path,{method,headers,body:payload});
    const text=await res.text();
    let json:any=null; try{ json=JSON.parse(text); }catch{}
    return {status:res.status,body:json,text};
}

export const form=(name:string,content:string,fields:Record<string,string>={})=>{
    const f=new FormData();
    for(const [k,v] of Object.entries(fields)) f.append(k,v);
    f.append("file",new Blob([content],{type:"text/plain"}),name);
    return f;
}
