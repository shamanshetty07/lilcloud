import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.ts";
import { validateBody, createFolderSchema, renameFolderSchema, moveSchema } from "../security/validate.ts";
import { create, contents, rename, move, remove, restore, permanentlyDelete } from "./folders.controller.ts";
const router=Router();

router.post("/",requireAuth,validateBody(createFolderSchema),create)
router.get("/:id",requireAuth,contents)
router.patch("/:id",requireAuth,validateBody(renameFolderSchema),rename)
router.patch("/:id/move",requireAuth,validateBody(moveSchema),move)
router.post("/trash/:id/restore",requireAuth,restore)
router.delete("/trash/:id/permanent",requireAuth,permanentlyDelete)
router.delete("/:id",requireAuth,remove)

export default router
