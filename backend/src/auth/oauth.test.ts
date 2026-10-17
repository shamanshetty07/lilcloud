import { test, expect } from "bun:test";
import { buildAuthUrl, pkceChallenge, isProvider } from "./oauth.providers.ts";
import { deriveUsername } from "./oauth.service.ts";

process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GITHUB_CLIENT_ID = "ghid";

test("google url carries state, PKCE challenge and scopes", () => {
    const u = new URL(buildAuthUrl("google", "http://api/cb", "st", "verifier"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge("verifier"));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("email");
});

test("github url has no PKCE and asks for email scope", () => {
    const u = new URL(buildAuthUrl("github", "http://api/cb", "st", "v"));
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("scope")).toContain("user:email");
});

test("only known providers are accepted", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("../etc")).toBe(false);
});

test("derived usernames always satisfy the signup rule", () => {
    const ok = /^[A-Za-z0-9_.-]{3,30}$/;
    for (const [n, e] of [["Jo", "jo@x.com"], ["Zoë Ñandú", "z@x.com"], ["", "a@x.com"], ["x".repeat(80), "x@x.com"], ["日本語", "j@x.com"]]) {
        expect(deriveUsername(n, e)).toMatch(ok);
    }
});
