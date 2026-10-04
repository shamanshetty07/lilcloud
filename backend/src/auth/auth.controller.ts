import { signupService } from "./auth.service";
import  type { Request,Response} from "express";

export const signup=async (req:Request,res:Response)=>{

    const {username,email,password}=req.body;
    try{
    const result=await signupService({
        username,email,password
    })
    return res.status(201).json(result);}
    catch(err){
        return res.status(404).json({
            message:"User already exists"
        })
    }
}