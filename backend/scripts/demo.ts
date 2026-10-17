// starts the backend and a Cloudflare quick tunnel together; Ctrl+C stops both
import { env } from "../src/lib/env.ts";

const port=env.PORT;
const local=`http://localhost:${port}`;

if(!Bun.which("cloudflared")){
    console.error("cloudflared is not installed. Install it with:\n\n  brew install cloudflared\n");
    process.exit(1);
}

const backend=Bun.spawn(["bun","src/server/server.ts"],{stdout:"inherit",stderr:"inherit"});
let tunnel:ReturnType<typeof Bun.spawn>|undefined;
let stopping=false;

const stop=(code=0)=>{
    if(stopping) return;
    stopping=true;
    console.log("\nstopping tunnel and backend...");
    tunnel?.kill();
    backend.kill();
    process.exit(code);
};
process.on("SIGINT",()=>stop());
process.on("SIGTERM",()=>stop());
backend.exited.then(code=>{ if(!stopping){ console.error(`backend exited (code ${code})`); stop(1); } });

// wait until the backend answers before opening the tunnel
let healthy=false;
for(let i=0;i<60 && !healthy && !stopping;i++){
    healthy=await fetch(`${local}/api/v1/health`).then(r=>r.status<500 || r.status===503,()=>false);
    if(!healthy) await Bun.sleep(500);
}
if(!healthy){ console.error("backend did not start in time"); stop(1); }

tunnel=Bun.spawn(["cloudflared","tunnel","--no-autoupdate","--url",local],{stdout:"ignore",stderr:"pipe"});
tunnel.exited.then(code=>{ if(!stopping){ console.error(`cloudflared exited (code ${code})`); stop(1); } });

const decoder=new TextDecoder();
let announced=false;
for await (const chunk of tunnel.stderr as ReadableStream<Uint8Array>){
    const text=decoder.decode(chunk);
    const match=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if(match && !announced){
        announced=true;
        console.log(`\n=========================================\n PUBLIC API URL: ${match[0]}\n health:         ${match[0]}/api/v1/health\n=========================================\nSet this as the frontend API base URL and add the frontend origin to CORS_ORIGINS.\nPress Ctrl+C to stop.\n`);
    }
    else if(/ERR/.test(text)) console.error(text.trim());
}
