// the deployed build bakes this in; change it and rebuild/redeploy when the tunnel URL changes
// Bun inlines process.env.BUN_PUBLIC_* only when the variable is set; otherwise `process` is undefined in the browser
const configuredUrl = (() => { try { return process.env.BUN_PUBLIC_API_URL; } catch { return undefined; } })();
export const API_URL = (configuredUrl || "http://localhost:3000/api/v1").replace(/\/$/, "");

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export type User = { id: number; name: string; email: string };
export type FileItem = { id: string; name: string; size: number; type: string; uploadedAt: string; folderId: string | null };
export type FolderItem = { id: string; name: string; parentId: string | null; createdAt: string; updatedAt: string };
export type Crumb = { id: string; name: string };
export type FolderContents = { folder: FolderItem | null; breadcrumb: Crumb[]; folders: FolderItem[]; files: FileItem[] };
export type RecentItem = FileItem & { viewedAt: string };
export type GroupRole = "admin" | "member";
export type Group = { id: string; name: string; role: GroupRole; memberCount: number; fileCount: number; createdAt: string; updatedAt: string };
export type Member = { userId: number; username: string; role: GroupRole; joinedAt: string };
export type GroupFile = FileItem & { uploadedBy: { id: number; name: string }; sharedAt: string };
export type Usage = { plan: string; usedBytes: number; limitBytes: number };
export type TrashedFile = FileItem & { deletedAt: string };
export type TrashedFolder = { id: string; name: string; parentId: string | null; deletedAt: string };
export type Health = { status: "ok" | "degraded"; database: string; storage: string; warning?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const TOKEN_KEY = "lilcloud.token";
const USER_KEY = "lilcloud.user";
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  // the remembered user belongs to the token, so it goes with it
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {} },
};

// last known signed-in user, so the UI can render at once while /auth/me re-checks in the background
export const userStore = {
  get: (): User | null => { try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; } },
  set: (u: User) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {} },
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
  trash: () => request<{ files: TrashedFile[]; folders: TrashedFolder[] }>("/files/trash"),
  restoreFile: (id: string) => request<void>(`/files/trash/${id}/restore`, { method: "POST" }),
  permanentlyDeleteFile: (id: string) => request<void>(`/files/trash/${id}`, { method: "DELETE" }),
  health: () => fetch(`${API_URL}/health`).then(r => r.json() as Promise<Health>),

  folder: (id: string | null) => request<FolderContents>(`/folders/${id ?? "root"}`),
  createFolder: (name: string, parentId: string | null) =>
    request<{ folder: FolderItem }>("/folders", { method: "POST", body: JSON.stringify({ name, parentId }) }),
  renameFolder: (id: string, name: string) =>
    request<{ folder: FolderItem }>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  moveFolder: (id: string, folderId: string | null) =>
    request<{ folder: FolderItem }>(`/folders/${id}/move`, { method: "PATCH", body: JSON.stringify({ folderId }) }),
  deleteFolder: (id: string) => request<void>(`/folders/${id}`, { method: "DELETE" }),
  restoreFolder: (id: string) => request<void>(`/folders/trash/${id}/restore`, { method: "POST" }),
  permanentlyDeleteFolder: (id: string) => request<{ deletedFolders: number; deletedFiles: number }>(`/folders/trash/${id}/permanent`, { method: "DELETE" }),
  moveFile: (id: string, folderId: string | null) =>
    request<{ file: FileItem }>(`/files/${id}/move`, { method: "PATCH", body: JSON.stringify({ folderId }) }),

  recent: (cursor?: string | null) =>
    request<{ items: RecentItem[]; nextCursor: string | null }>(`/files/recent?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),

  groups: () => request<{ groups: Group[] }>("/groups"),
  group: (id: string) => request<{ group: Group }>(`/groups/${id}`),
  createGroup: (name: string) => request<{ group: Group }>("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  renameGroup: (id: string, name: string) => request<{ group: Group }>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteGroup: (id: string) => request<void>(`/groups/${id}`, { method: "DELETE" }),
  members: (id: string) => request<{ members: Member[] }>(`/groups/${id}/members`),
  addMember: (id: string, identifier: string) =>
    request<{ member: Member }>(`/groups/${id}/members`, { method: "POST", body: JSON.stringify({ identifier }) }),
  setRole: (id: string, userId: number, role: GroupRole) =>
    request<{ member: Member }>(`/groups/${id}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (id: string, userId: number) => request<void>(`/groups/${id}/members/${userId}`, { method: "DELETE" }),
  groupFiles: (id: string) => request<{ files: GroupFile[] }>(`/groups/${id}/files`),
  unshare: (groupId: string, fileId: string) => request<void>(`/groups/${groupId}/files/${fileId}`, { method: "DELETE" }),

  async download(file: FileItem, groupId?: string) {
    const blob = await fetchBlob(file, groupId);
    save(URL.createObjectURL(blob), file.name, true);
  },

  // records the view, then shows the file in a new tab if it is a type that cannot run script in our origin;
  // anything else (html, svg, ...) is downloaded instead
  async open(file: FileItem, groupId?: string) {
    await request<unknown>(groupId ? `/groups/${groupId}/files/${file.id}/view` : `/files/${file.id}/view`, { method: "POST" });
    const blob = await fetchBlob(file, groupId);
    const type = file.type.toLowerCase();
    if (INLINE_TYPES.has(type)) save(URL.createObjectURL(new Blob([blob], { type })), file.name, false);
    else save(URL.createObjectURL(blob), file.name, true);
  },

  // XHR rather than fetch so we get upload progress. into = a private folder (null/undefined = root) or a group's shared space
  upload(file: File, onProgress: (pct: number) => void, into: { folderId?: string | null; groupId?: string } = {}) {
    return new Promise<FileItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}${into.groupId ? `/groups/${into.groupId}/files/upload` : "/files/upload"}`);
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
      if (into.folderId) form.append("folderId", into.folderId);
      form.append("file", file);
      xhr.send(form);
    });
  },
};

// only types a browser renders without running script; never html or svg
const INLINE_TYPES = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg", "image/gif", "image/webp"]);

async function fetchBlob(file: FileItem, groupId?: string) {
  const path = groupId ? `/groups/${groupId}/files/${file.id}/download` : `/files/${file.id}/download`;
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "That item no longer exists" : "Download failed");
  return res.blob();
}

function save(url: string, name: string, download: boolean) {
  const a = document.createElement("a");
  a.href = url;
  if (download) a.download = name;
  else { a.target = "_blank"; a.rel = "noopener"; }
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const formatSize = (bytes: number) => {
  if (bytes >= 1023.5 * 1024 ** 2) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};
