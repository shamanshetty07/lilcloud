import app from "./app"
import { env } from "../lib/env"
import { storage } from "../files/storage"
import { connectMongo } from "../lib/mongo"
const PORT=env.PORT   ||3000 
await connectMongo()
await storage.init()
app.listen(PORT,()=>{
    console.log(`server is running no ${PORT}`)
})
