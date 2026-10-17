import express from "express"
import authRouter from "../auth/auth.routes.js"
import filesRouter from "../files/files.routes.js"
import waitlistRouter from "../plans/waitlist.routes.ts"
import { securityHeaders } from "../security/headers.ts"
import { sanitizeInput } from "../security/sanitize.ts"
import { rateLimit } from "../security/rate-limit.ts"
import { cors } from "../security/cors.ts"
import healthRouter from "./health.routes.ts"
import { errorHandler } from "../security/error-handler.ts"
const app =express();

app.disable("x-powered-by")
// cloudflared connects from loopback; trust it so req.ip is the real client, not 127.0.0.1
app.set("trust proxy","loopback")
app.use(securityHeaders)
app.use(cors)
app.use(rateLimit({windowMs:60_000,max:120}))
app.use("/api/v1/health",healthRouter)
app.use(express.json({limit:"10kb"}))
app.use(sanitizeInput)
app.use("/api/v1/auth",authRouter)
app.use("/api/v1/files",filesRouter)
app.use("/api/v1/waitlist",waitlistRouter)
app.use(errorHandler)
export default app;
