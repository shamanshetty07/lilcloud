import { signupService, signinService, meService } from "./auth.service";
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

export const signin=async (req:Request,res:Response)=>{
    const {email,password}=req.body;
    if(!email || !password){
        return res.status(400).json({message:"email and password are required"});
    }
    try{
        const result=await signinService({email,password});
        return res.status(200).json(result);
    }
    catch(err){
        return res.status(401).json({message:"Invalid email or password"});
    }
}

export const me=async (req:Request,res:Response)=>{
    try{
        const result=await meService((req as any).userId);
        return res.status(200).json(result);
    }
    catch(err){
        return res.status(404).json({message:"User not found"});
    }
}
