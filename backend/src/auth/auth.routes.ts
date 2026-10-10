import { Router } from "express";
import {signup,signin,me,logout} from "./auth.controller"
import {requireAuth} from "./auth.middleware"
import {validateBody,signupSchema,signinSchema} from "../security/validate.ts"
import {rateLimit} from "../security/rate-limit.ts"
const router=Router();
// brute force / credential stuffing protection
const authLimiter=rateLimit({windowMs:15*60_000,max:20,message:"Too many attempts, try again later"});
router.post("/signup",authLimiter,validateBody(signupSchema),signup)
router.post("/signin",authLimiter,validateBody(signinSchema),signin)
router.post("/logout",requireAuth,logout)
router.get("/me",requireAuth,me)


export default router