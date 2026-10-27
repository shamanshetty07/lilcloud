import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import { validateBody, createGroupSchema, renameGroupSchema, addMemberSchema, setRoleSchema, shareFileSchema } from "../security/validate.ts";
import { multipart, uploadErrorHandler } from "../security/upload.ts";
import { uploadLimiter } from "../files/files.routes.ts";
import { upload } from "../files/files.controller.ts";
import * as c from "./groups.controller.ts";
const router=Router();

router.post("/",requireAuth,validateBody(createGroupSchema),c.create)
router.get("/",requireAuth,c.list)
router.get("/:id",requireAuth,c.get)
router.patch("/:id",requireAuth,validateBody(renameGroupSchema),c.rename)
router.delete("/:id",requireAuth,c.remove)

router.get("/:id/members",requireAuth,c.members)
router.post("/:id/members",requireAuth,validateBody(addMemberSchema),c.addMember)
router.patch("/:id/members/:userId",requireAuth,validateBody(setRoleSchema),c.setRole)
router.delete("/:id/members/:userId",requireAuth,c.removeMember)

router.get("/:id/files",requireAuth,c.files)
router.post("/:id/files",requireAuth,validateBody(shareFileSchema),c.share)
router.post("/:id/files/upload",requireAuth,c.memberOnly,uploadLimiter,multipart.single("file"),uploadErrorHandler,upload)
router.delete("/:id/files/:fileId",requireAuth,c.unshare)
router.get("/:id/files/:fileId/download",requireAuth,c.download)
router.post("/:id/files/:fileId/view",requireAuth,c.view)

export default router
