import { Router } from "express";
import {signup} from "./auth.controller"
const router=Router();
router.post("/signup",signup)
// router.post("/signin")


export default router