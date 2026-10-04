import app from "./app"
import { env } from "../lib/env"
const PORT=env.PORT   ||3000 
app.listen(PORT,()=>{
    console.log(`server is running no ${PORT}`)
})