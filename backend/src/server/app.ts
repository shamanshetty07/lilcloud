import express from "express"
import authRouter from "../auth/auth.routes.js"
import filesRouter from "../files/files.routes.js"
const app =express();

app.use(express.json())
app.use("/api/v1/auth",authRouter)
app.use("/api/v1/files",filesRouter)
export default app;