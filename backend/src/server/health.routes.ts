import { Router } from "express";
import { prisma } from "../lib/prisma.ts";
import { storage } from "../files/storage.ts";

const router=Router();

router.get("/",async (_req,res)=>{
    const database=await prisma.$queryRaw`SELECT 1`.then(()=>true,()=>false);
    const disk=await storage.health();
    const ok=database && disk.ok;
    res.status(ok?200:503).json({
        status:ok?"ok":"degraded",
        database:database?"ok":"unavailable",
        storage:disk.ok?"ok":"unavailable",
        ...(disk.ok && disk.lowDisk ? {warning:"low disk space"} : {})
    });
})

export default router
