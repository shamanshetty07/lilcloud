import { one, type Db } from "../db/query.ts";

export type UserRow = {
    user_id:number,
    username:string,
    email:string,
    password_hash:string,
    created_at:Date,
    updated_at:Date,
    is_active:boolean,
    role:"user"|"admin"
};

const USER_COLUMNS=`user_id, username, email, password_hash, created_at, updated_at, is_active, role`;

export const findUserByUsernameOrEmail=(db:Db,username:string,email:string)=>
    one<UserRow>(db,`SELECT ${USER_COLUMNS} FROM users WHERE username = $1 OR email = $2 LIMIT 1`,[username,email]);

export const findUserByEmail=(db:Db,email:string)=>
    one<UserRow>(db,`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,[email]);

export const findUserById=(db:Db,userId:number)=>
    one<UserRow>(db,`SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1`,[userId]);

export const findUserByUsername=(db:Db,username:string)=>
    one<UserRow>(db,`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`,[username]);

export const AUTH_USER_SQL=`SELECT is_active, username, email FROM users WHERE user_id = $1`;

export const findAuthUser=(db:Db,userId:number)=>
    one<{is_active:boolean,username:string,email:string}>(db,AUTH_USER_SQL,[userId]);

export const findActiveUserByIdentifier=(db:Db,username:string,email:string)=>
    one<{user_id:number,username:string}>(db,
        `SELECT user_id, username FROM users WHERE is_active = true AND (username = $1 OR email = $2) LIMIT 1`,
        [username,email]);

export const createUser=async(db:Db,data:{username:string,email:string,password_hash:string})=>
    (await one<UserRow>(db,
        `INSERT INTO users (username, email, password_hash, updated_at) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
        [data.username,data.email,data.password_hash,new Date()]))!;
