import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth/auth.middleware.ts";
import { upload } from "./files.controller.ts";
const router=Router();
const multipart=multer({storage:multer.memoryStorage()});

router.post("/upload",requireAuth,multipart.single("file"),upload)

export default router
