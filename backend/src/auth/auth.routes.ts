import { Router } from "express";
import {signup,signin,me} from "./auth.controller"
import {requireAuth} from "./auth.middleware"
const router=Router();
router.post("/signup",signup)
router.post("/signin",signin)
router.get("/me",requireAuth,me)


export default router