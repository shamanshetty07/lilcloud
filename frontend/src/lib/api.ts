// the deployed build bakes this in; change it and rebuild/redeploy when the tunnel URL changes
// Bun inlines process.env.BUN_PUBLIC_* only when the variable is set; otherwise `process` is undefined in the browser
const configuredUrl = (() => { try { return process.env.BUN_PUBLIC_API_URL; } catch { return undefined; } })();
export const API_URL = (configuredUrl || "http://localhost:3000/api/v1").replace(/\/$/, "");

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export type User = { id: number; name: string; email: string };
export type FileItem = { id: string; name: string; size: number; type: string; uploadedAt: string };
export type Usage = { plan: string; usedBytes: number; limitBytes: number };
export type Health = { status: "ok" | "degraded"; database: string; storage: string; warning?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const TOKEN_KEY = "lilcloud.token";
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

// the UI listens for this to drop back to the sign-in screen when a token expires
export const onUnauthorized = { handler: () => {} };

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (auth && token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach lilcloud right now. Check your connection and try again.");
  }
  if (res.status === 401 && auth) onUnauthorized.handler();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.errors) ? body.errors.map((e: any) => e.message).join(", ") : "";
    throw new ApiError(res.status, [body.message, detail].filter(Boolean).join(": ") || `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  signin: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  signup: (username: string, email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify({ username, email, password }) }, false),
  me: () => request<{ user: User }>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }).catch(() => {}),
  usage: () => request<Usage>("/files/usage"),
  joinWaitlist: (email: string, plan: "plus" | "pro") =>
    request<{ message: string }>("/waitlist", { method: "POST", body: JSON.stringify({ email, plan }) }, false),
  list: () => request<{ files: FileItem[] }>("/files"),
  remove: (id: string) => request<void>(`/files/${id}`, { method: "DELETE" }),
  health: () => fetch(`${API_URL}/health`).then(r => r.json() as Promise<Health>),

  async download(file: FileItem) {
    const res = await fetch(`${API_URL}/files/${file.id}/download`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
    if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "That item no longer exists" : "Download failed");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  // XHR rather than fetch so we get upload progress
  upload(file: File, onProgress: (pct: number) => void) {
    return new Promise<FileItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/files/upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${tokenStore.get()}`);
      xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onerror = () => reject(new ApiError(0, "Can't reach lilcloud right now. Check your connection and try again."));
      xhr.onload = () => {
        let body: any = {};
        try { body = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401) onUnauthorized.handler();
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.file);
        else reject(new ApiError(xhr.status, body.message || `Upload failed (${xhr.status})`));
      };
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });
  },
};

export const formatSize = (bytes: number) => {
  if (bytes >= 1023.5 * 1024 ** 2) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};
