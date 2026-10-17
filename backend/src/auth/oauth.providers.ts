import { createHash } from "node:crypto";

export type ProviderId = "google" | "github";
export type OAuthProfile = { email: string; emailVerified: boolean; name: string };

type Provider = {
    authUrl: string;
    scope: string;
    pkce: boolean;
    clientId: () => string | undefined;
    clientSecret: () => string | undefined;
    exchange: (code: string, redirectUri: string, verifier: string) => Promise<OAuthProfile>;
};

export const isProvider = (id: string): id is ProviderId => id === "google" || id === "github";

const json = async (res: Response) => {
    if (!res.ok) throw new Error(`provider responded ${res.status}`);
    return res.json() as Promise<any>;
};

const google: Provider = {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    pkce: true,
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    async exchange(code, redirectUri, verifier) {
        const token = await json(await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code, redirect_uri: redirectUri, grant_type: "authorization_code",
                client_id: google.clientId()!, client_secret: google.clientSecret()!, code_verifier: verifier,
            }),
        }));
        const info = await json(await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${token.access_token}` },
        }));
        return { email: String(info.email ?? ""), emailVerified: info.email_verified === true, name: String(info.name ?? "") };
    },
};

const github: Provider = {
    authUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    pkce: false,
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    async exchange(code, redirectUri) {
        const token = await json(await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({ code, redirect_uri: redirectUri, client_id: github.clientId()!, client_secret: github.clientSecret()! }),
        }));
        if (!token.access_token) throw new Error("no access token");
        const headers = { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "lilcloud" };
        const user = await json(await fetch("https://api.github.com/user", { headers }));
        const emails = await json(await fetch("https://api.github.com/user/emails", { headers })) as { email: string; primary: boolean; verified: boolean }[];
        // only a primary, verified address may be used to match or create an account
        const primary = emails.find(e => e.primary && e.verified);
        return { email: primary?.email ?? "", emailVerified: !!primary, name: String(user.name || user.login || "") };
    },
};

export const providers: Record<ProviderId, Provider> = { google, github };

export const isConfigured = (id: ProviderId) => !!(providers[id].clientId() && providers[id].clientSecret());

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const buildAuthUrl = (id: ProviderId, redirectUri: string, state: string, verifier: string) => {
    const p = providers[id];
    const params = new URLSearchParams({
        client_id: p.clientId()!, redirect_uri: redirectUri, response_type: "code", scope: p.scope, state,
    });
    if (p.pkce) { params.set("code_challenge", pkceChallenge(verifier)); params.set("code_challenge_method", "S256"); }
    if (id === "google") params.set("prompt", "select_account");
    return `${p.authUrl}?${params}`;
};
