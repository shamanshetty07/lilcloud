import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStorage, StorageError, isValidKey } from "./storage.ts";

let dir:string;
beforeEach(async()=>{ dir=await mkdtemp(join(tmpdir(),"lilcloud-")); });
afterEach(async()=>{ await rm(dir,{recursive:true,force:true}); });

const KEY="123e4567-e89b-42d3-a456-426614174000";

test("commit then open returns identical bytes",async()=>{
    const s=createLocalStorage(dir); await s.init();
    const tmp=join(s.tmpDir,"a.part"); await writeFile(tmp,"hello world");
    await s.commit(tmp,KEY);
    const {stream,size}=await s.open(KEY);
    expect(size).toBe(11);
    expect(await new Response(stream as any).text()).toBe("hello world");
});

test("rejects path traversal and non-uuid keys",async()=>{
    const s=createLocalStorage(dir);
    for(const bad of ["../etc/passwd","a/b","",`${KEY}/..`]){
        expect(isValidKey(bad)).toBe(false);
        await expect(s.open(bad)).rejects.toMatchObject({code:"INVALID_KEY"});
    }
});

test("missing file gives NOT_FOUND",async()=>{
    const s=createLocalStorage(dir); await s.init();
    await expect(s.open(KEY)).rejects.toBeInstanceOf(StorageError);
    await expect(s.open(KEY)).rejects.toMatchObject({code:"NOT_FOUND"});
});

test("remove deletes content and is idempotent",async()=>{
    const s=createLocalStorage(dir); await s.init();
    const tmp=join(s.tmpDir,"b.part"); await writeFile(tmp,"x");
    await s.commit(tmp,KEY);
    await s.remove(KEY); await s.remove(KEY);
    expect((await readdir(dir)).includes(KEY)).toBe(false);
});

test("health reports ok, and unavailable when root is missing",async()=>{
    const s=createLocalStorage(dir); await s.init();
    expect((await s.health()).ok).toBe(true);
    await rm(dir,{recursive:true});
    expect((await s.health()).ok).toBe(false);
});
