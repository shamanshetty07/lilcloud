import { string } from "zod"
import { env } from "../lib/env.ts";
import { prisma } from "../lib/prisma.ts"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


type signupData={
    username:string,    
    email:string,
    password:string
}

export const  signupService=async(data:signupData)=>{
    const userExists=await prisma.user.findFirst({
        where:{
            OR:[
            {username:data.username},
            {email:data.email}
        ]
        }
    });
    if(userExists){
        if(data.username===userExists.username){
            throw new Error("username already exits");
        }
        if(data.email===userExists.email){
            throw new Error("email already exists");
        }
    }
    const hashedpassword=await bcrypt.hash(data.password,10);

    const user=await prisma.user.create({
        data:{
            username:data.username,
            email:data.email,
            password_hash:hashedpassword
        }
    })
    const token= jwt.sign({
        id:user.user_id,
        email:user.email
    },env.JWT_SECRET,{
        expiresIn:"7d"
    })
    return {
        token,
        user:{
            id:user.user_id,
            name:user.username,
            email:user.email
        }
    }
}