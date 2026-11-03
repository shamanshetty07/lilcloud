import { string } from "zod"
import { env } from "../lib/env.ts";
import { pool } from "../db/client.ts";
import { findUserByUsernameOrEmail, findUserByEmail, findUserById, createUser } from "./users.repository.ts";
import { DomainError, conflict } from "../lib/errors.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


type signupData={
    username:string,    
    email:string,
    password:string
}

export const  signupService=async(data:signupData)=>{
    const userExists=await findUserByUsernameOrEmail(pool,data.username,data.email);
    if(userExists){
        if(data.username===userExists.username){
            throw conflict("That username is already taken");
        }
        if(data.email===userExists.email){
            throw conflict("An account with that email already exists");
        }
    }
    const hashedpassword=await bcrypt.hash(data.password,10);

    const user=await createUser(pool,{username:data.username,email:data.email,password_hash:hashedpassword})
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

type signinData={
    email:string,
    password:string
}

export const signinService=async(data:signinData)=>{
    const user=await findUserByEmail(pool,data.email);
    if(!user || !user.is_active){
        throw new DomainError(401,"Invalid email or password");
    }
    const passwordMatches=await bcrypt.compare(data.password,user.password_hash);
    if(!passwordMatches){
        throw new DomainError(401,"Invalid email or password");
    }
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

export const meService=async(userId:number)=>{
    const user=await findUserById(pool,userId);
    if(!user || !user.is_active){
        throw new Error("user not found");
    }
    return {
        user:{
            id:user.user_id,
            name:user.username,
            email:user.email
        }
    }
}
