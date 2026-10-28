import app from "./app"
import { env } from "../lib/env"
import { storage } from "../files/storage"
import { connectMongo } from "../lib/mongo"
import { connectRedis, closeRedis } from "../cache/redis"
const PORT=env.PORT   ||3000 
await connectMongo()
await storage.init()
// the api still starts (uncached) when redis is unreachable
await connectRedis()
const server=app.listen(PORT,()=>{
    console.log(`server is running no ${PORT}`)
})
for(const sig of ["SIGINT","SIGTERM"] as const){
    process.on(sig,()=>{
        closeRedis();
        // keep-alive connections can hold close() open, so do not wait forever
        setTimeout(()=>process.exit(0),3000).unref();
        server.close(()=>process.exit(0));
    });
}
