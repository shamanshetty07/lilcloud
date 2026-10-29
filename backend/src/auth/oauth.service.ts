import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { env } from "../lib/env.ts";
import type { OAuthProfile } from "./oauth.providers.ts";

export const deriveUsername = (name: string, email: string) => {
    const base = (name || email.split("@")[0] || "user").normalize("NFKD")
        .replace(/[^A-Za-z0-9_.-]+/g, "").slice(0, 24);
    return base.length >= 3 ? base : `user${base}`.slice(0, 24);
};

const uniqueUsername = async (base: string) => {
    for (let i = 0; i < 20; i++) {
        const candidate = i === 0 ? base : `${base}${randomBytes(2).toString("hex")}`;
        if (!(await prisma.user.findUnique({ where: { username: candidate } }))) return candidate;
    }
    return `${base.slice(0, 20)}${randomBytes(4).toString("hex")}`;
};

export const findOrCreateOAuthUser = async (profile: OAuthProfile) => {
    if (!profile.email || !profile.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
    const email = profile.email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.is_active) throw new Error("ACCOUNT_DISABLED");
    if (!user) {
        const password_hash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
        user = await prisma.user.create({
            data: { email, password_hash, username: await uniqueUsername(deriveUsername(profile.name, email)) },
        });
    }
    return user;
};

export const issueToken = (user: { user_id: number; email: string }) =>
    jwt.sign({ id: user.user_id, email: user.email }, env.JWT_SECRET, { expiresIn: "7d" });
