import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import { upload } from "./files.controller.ts";
import { multipart, uploadErrorHandler } from "../security/upload.ts";
import { rateLimit } from "../security/rate-limit.ts";
const router=Router();
const uploadLimiter=rateLimit({windowMs:60_000,max:20,message:"Too many uploads, slow down"});

router.post("/upload",requireAuth,uploadLimiter,multipart.single("file"),uploadErrorHandler,upload)

export default router
