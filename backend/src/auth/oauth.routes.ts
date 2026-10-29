import { Router, type Response } from "express";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.ts";
import { rateLimit } from "../security/rate-limit.ts";
import { logAuthEvent } from "../activity/auth-log.service.ts";
import { buildAuthUrl, isConfigured, isProvider, providers } from "./oauth.providers.ts";
import { findOrCreateOAuthUser, issueToken } from "./oauth.service.ts";

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, max: 40, message: "Too many attempts, try again later" });

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "");
const COOKIE = "lilcloud_oauth";
const COOKIE_PATH = "/api/v1/auth/oauth";
const secure = API_PUBLIC_URL.startsWith("https://");

const redirectUri = (provider: string) => `${API_PUBLIC_URL}/api/v1/auth/oauth/${provider}/callback`;
const fail = (res: Response, reason: string) => {
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
    return res.redirect(`${FRONTEND_URL}/signin?error=${encodeURIComponent(reason)}`);
};

router.get("/providers", (_req, res) => {
    res.json({ google: isConfigured("google"), github: isConfigured("github") });
});

router.get("/:provider/start", limiter, (req, res) => {
    const provider = String(req.params.provider);
    if (!isProvider(provider)) return res.status(404).json({ message: "Unknown provider" });
    if (!isConfigured(provider)) return fail(res, "not_configured");

    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const tx = jwt.sign({ provider, state, verifier }, env.JWT_SECRET, { expiresIn: "10m" });
    res.cookie(COOKIE, tx, { httpOnly: true, sameSite: "lax", secure, path: COOKIE_PATH, maxAge: 10 * 60_000 });
    return res.redirect(buildAuthUrl(provider, redirectUri(provider), state, verifier));
});

router.get("/:provider/callback", limiter, async (req, res) => {
    const provider = String(req.params.provider);
    if (!isProvider(provider)) return res.status(404).json({ message: "Unknown provider" });
    if (!isConfigured(provider)) return fail(res, "not_configured");
    if (req.query.error) return fail(res, "cancelled");

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookie = String(req.headers.cookie ?? "").split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!code || !state || !cookie) return fail(res, "invalid_request");

    let tx: { provider: string; state: string; verifier: string };
    try { tx = jwt.verify(decodeURIComponent(cookie), env.JWT_SECRET) as typeof tx; }
    catch { return fail(res, "expired"); }
    if (tx.provider !== provider || tx.state !== state) return fail(res, "invalid_request");

    try {
        const profile = await providers[provider].exchange(code, redirectUri(provider), tx.verifier);
        const user = await findOrCreateOAuthUser(profile);
        void logAuthEvent({ eventType: "login", status: "success", userId: user.user_id, email: user.email, ipAddress: req.ip });
        res.clearCookie(COOKIE, { path: COOKIE_PATH });
        return res.redirect(`${FRONTEND_URL}/auth/callback#token=${issueToken(user)}`);
    } catch (err) {
        const msg = (err as Error).message;
        console.error("oauth failed:", provider, msg);
        return fail(res, msg === "EMAIL_NOT_VERIFIED" ? "email_unverified" : msg === "ACCOUNT_DISABLED" ? "disabled" : "failed");
    }
});

export default router;
