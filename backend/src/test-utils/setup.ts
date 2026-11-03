import { mock } from "bun:test";
import jwt from "jsonwebtoken";

const url=process.env.TEST_DATABASE_URL;
export const enabled=!!url;

let app:any=null, db:any=null, storage:any=null, server:any=null, base="";

if(url){
    mock.module("../activity/activity.service.ts",()=>({logActivity:async()=>{}}));
    ({default:app}=await import("../server/app.ts"));
    ({pool:db}=await import("../db/client.ts"));
    ({storage}=await import("../files/storage.ts"));
    const {rows:[{name}]}=await db.query(`SELECT current_database() AS name`);
    if(name!==new URL(url).pathname.slice(1)) throw new Error(`refusing to run: connected to "${name}", not the test database`);
    await storage.init();
    server=app.listen(0);
    base=`http://127.0.0.1:${server.address().port}/api/v1`;
}

export { db, storage };

export const countRows=async(sql:string,params:unknown[]=[])=>{
    const {rows:[row]}=await db.query(`SELECT count(*)::int AS n FROM (${sql}) AS counted`,params);
    return row.n as number;
}

export const reset=async()=>{
    await db.query(`TRUNCATE users, files, file_permissions, folders, file_view_history, storage_groups, group_members, group_files RESTART IDENTITY CASCADE`);
}

let n=0;
export const makeUser=async(name:string)=>{
    const tag=`${name}${++n}`;
    const {rows:[user]}=await db.query(
        `INSERT INTO users (username, email, password_hash, updated_at) VALUES ($1, $2, $3, $4) RETURNING user_id, username, email`,
        [tag,`${tag}@example.com`,"x",new Date()]);
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
