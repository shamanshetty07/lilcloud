import { resolve } from "node:path";
if (!process.env.PORT) {
    throw new Error("PORT is missing")
}

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing")
}
if(!process.env.JWT_SECRET){
    throw new Error("JWT_SECRET is missing")
}
if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing")
}
export const env = {
    STORAGE_DIR: resolve(process.env.STORAGE_DIR || "uploads"),
    CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "").split(",").map(o=>o.trim()).filter(Boolean),
    REDIS_URL: process.env.REDIS_URL || undefined,
    REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || "lilcloud",
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
   JWT_SECRET:process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI

}