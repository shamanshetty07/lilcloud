import { Router } from "express";
import {signup,signin,me,logout} from "./auth.controller"
import {requireAuth} from "./auth.middleware"
const router=Router();
router.post("/signup",signup)
router.post("/signin",signin)
router.post("/logout",requireAuth,logout)
router.get("/me",requireAuth,me)


export default router