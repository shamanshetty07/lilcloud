import express from "express"
import authRouter from "../auth/auth.routes.js"
const app =express();

app.use(express.json())
app.use("/api/v1/auth",authRouter)
export default app;