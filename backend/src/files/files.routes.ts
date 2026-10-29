import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import { upload, list, usage, download, remove, move, view, recent, trash, restoreFromTrash, permanentlyDelete } from "./files.controller.ts";
import { validateBody, moveSchema } from "../security/validate.ts";
import { multipart, uploadErrorHandler } from "../security/upload.ts";
import { rateLimit } from "../security/rate-limit.ts";
const router=Router();
export const uploadLimiter=rateLimit({windowMs:60_000,max:20,message:"Too many uploads, slow down"});

router.get("/",requireAuth,list)
router.get("/trash",requireAuth,trash)
router.post("/trash/:id/restore",requireAuth,restoreFromTrash)
router.delete("/trash/:id",requireAuth,permanentlyDelete)
router.get("/usage",requireAuth,usage)
router.get("/recent",requireAuth,recent)
router.get("/:id/download",requireAuth,download)
router.post("/:id/view",requireAuth,view)
router.patch("/:id/move",requireAuth,validateBody(moveSchema),move)
router.delete("/:id",requireAuth,remove)
router.post("/upload",requireAuth,uploadLimiter,multipart.single("file"),uploadErrorHandler,upload)

export default router
