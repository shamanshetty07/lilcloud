import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, statfs, access, writeFile, unlink, constants } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../lib/env.ts";

export type StorageErrorCode="NOT_FOUND"|"INVALID_KEY"|"UNAVAILABLE";
export class StorageError extends Error{
    constructor(public code:StorageErrorCode,message:string){ super(message); }
}

const KEY_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidKey=(key:string)=>KEY_PATTERN.test(key);

const MIN_FREE_BYTES=100*1024*1024;

export const createLocalStorage=(rootDir:string)=>{
    const root=resolve(rootDir);
    const tmpDir=join(root,".tmp");

    const pathFor=(key:string)=>{
        if(!isValidKey(key)) throw new StorageError("INVALID_KEY","invalid storage key");
        return join(root,key);
    };
    const unavailable=(err:unknown)=>{
        console.error("storage unavailable:",err);
        return new StorageError("UNAVAILABLE","storage unavailable");
    };

    return {
        root,
        tmpDir,
        async init(){
            try{ await mkdir(tmpDir,{recursive:true}); }
            catch(err){ throw unavailable(err); }
        },
        async commit(tempPath:string,key:string){
            const target=pathFor(key);
            try{ await rename(tempPath,target); }
            catch(err){ throw unavailable(err); }
        },
        async remove(key:string){
            await rm(pathFor(key),{force:true});
        },
        async open(key:string){
            const path=pathFor(key);
            try{
                const info=await stat(path);
                return {stream:createReadStream(path),size:info.size};
            }
            catch(err){
                if((err as NodeJS.ErrnoException).code==="ENOENT") throw new StorageError("NOT_FOUND","file content missing");
                throw unavailable(err);
            }
        },
        async health(){
            try{
                await access(root,constants.R_OK|constants.W_OK);
                const probe=join(tmpDir,`health-${process.pid}`);
                await writeFile(probe,"ok");
                await unlink(probe);
                const fs=await statfs(root);
                const freeBytes=fs.bavail*fs.bsize;
                return {ok:true,lowDisk:freeBytes<MIN_FREE_BYTES,freeBytes};
            }
            catch{
                return {ok:false,lowDisk:false,freeBytes:0};
            }
        }
    };
};

export const storage=createLocalStorage(env.STORAGE_DIR);
