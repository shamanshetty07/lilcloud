import { test, expect } from "bun:test";
import { makeCors } from "./cors.ts";

const run=(origin:string|undefined,method="GET")=>{
    const headers:Record<string,string>={}; let status=0; let nexted=false;
    const res:any={setHeader:(k:string,v:string)=>{headers[k]=v;},status:(c:number)=>{status=c;return res;},end:()=>res};
    makeCors(["https://app.example.com"])({headers:{origin},method} as any,res,()=>{nexted=true;});
    return {headers,status,nexted};
};

test("allows listed origin",()=>{
    const r=run("https://app.example.com");
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(r.nexted).toBe(true);
});
test("does not echo unlisted origin",()=>{
    expect(run("https://evil.example").headers["Access-Control-Allow-Origin"]).toBeUndefined();
});
test("preflight from unlisted origin is 403, listed is 204",()=>{
    expect(run("https://evil.example","OPTIONS").status).toBe(403);
    expect(run("https://app.example.com","OPTIONS").status).toBe(204);
});
