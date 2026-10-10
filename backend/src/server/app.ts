import express from "express"
import authRouter from "../auth/auth.routes.js"
import filesRouter from "../files/files.routes.js"
import { securityHeaders } from "../security/headers.ts"
import { sanitizeInput } from "../security/sanitize.ts"
import { rateLimit } from "../security/rate-limit.ts"
import { errorHandler } from "../security/error-handler.ts"
const app =express();

app.disable("x-powered-by")
app.use(securityHeaders)
app.use(rateLimit({windowMs:60_000,max:120}))
app.use(express.json({limit:"10kb"}))
app.use(sanitizeInput)
app.use("/api/v1/auth",authRouter)
app.use("/api/v1/files",filesRouter)
app.use(errorHandler)
export default app;
