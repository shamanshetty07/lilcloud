import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, formatSize, MAX_FILE_SIZE, type Group, type GroupFile, type Member } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { Link, navigate } from "../lib/router.tsx";
import { AppHeader } from "../components/AppHeader.tsx";

type Upload = { key: number; name: string; pct: number; error?: string };
let uploadKey = 0;

export default function GroupPage({ id }: { id: string }) {
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [files, setFiles] = useState<GroupFile[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isAdmin = group?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [g, f, m] = await Promise.all([api.group(id), api.groupFiles(id), api.members(id)]);
      setGroup(g.group); setFiles(f.files); setMembers(m.members); setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else { setError((e as Error).message); setFiles(f => f ?? []); }
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); await load(); }
  };

  const patch = (key: number, p: Partial<Upload>) => setUploads(u => u.map(x => x.key === key ? { ...x, ...p } : x));
  const send = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const key = ++uploadKey;
      setUploads(u => [...u, { key, name: file.name, pct: 0 }]);
      if (file.size > MAX_FILE_SIZE) { patch(key, { error: "Larger than 25 MB" }); continue; }
      try {
        await api.upload(file, pct => patch(key, { pct }), { groupId: id });
        setUploads(u => u.filter(x => x.key !== key));
        await load();
      } catch (e) { patch(key, { error: (e as Error).message }); }
    }
  };

  if (missing) return (
    <div className="min-h-screen"><AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-sm text-muted">This group doesn't exist, or you're no longer a member.</p>
        <Link href="/app/groups" className="mt-4 inline-block font-mono text-xs underline underline-offset-4">back to shared spaces</Link>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/app/groups" className="font-mono text-xs text-muted hover:text-fg">← shared spaces</Link>
        <div className="mb-6 mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="label">{isAdmin ? "you're an admin" : "shared space"}</p>
            {renaming !== null ? (
              <form className="mt-1 flex gap-3" onSubmit={e => { e.preventDefault(); act(async () => { await api.renameGroup(id, renaming); setRenaming(null); }); }}>
                <input className="input max-w-xs" autoFocus maxLength={100} aria-label="Group name" value={renaming} onChange={e => setRenaming(e.target.value)} />
                <button className="btn btn-primary" disabled={!renaming.trim()}>Save</button>
                <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : <h1 className="mt-1 truncate text-3xl font-bold tracking-[-0.04em]">{group?.name ?? "…"}</h1>}
          </div>
          {isAdmin && renaming === null && (
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setRenaming(group!.name)}>Rename</button>
              {confirming === "group"
                ? <button className="btn btn-ghost text-danger" onClick={() => act(async () => { await api.deleteGroup(id); navigate("/app/groups"); })}>Confirm delete group</button>
                : <button className="btn btn-ghost" onClick={() => setConfirming("group")}>Delete group</button>}
            </div>
          )}
        </div>
        {confirming === "group" && <p className="mb-4 text-sm text-muted">Deleting the group removes it for everyone. The files stay with the people who uploaded them.</p>}

        {error && (
          <p role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}<button onClick={() => setError("")} aria-label="Dismiss">✕</button>
          </p>
        )}

        <div className="grid gap-8 md:grid-cols-[1fr_16rem]">
          <section>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files); }}
              onClick={() => input.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={e => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              className={`hatch cursor-pointer rounded-xl border border-dashed px-6 py-8 text-center transition-colors ${dragging ? "border-fg bg-raised" : "border-line-strong hover:bg-surface"}`}
            >
              <p className="text-sm">Drop files for the group or <span className="underline underline-offset-4">browse</span></p>
              <p className="mt-1 font-mono text-xs text-muted">up to 25 MB each · counts toward your storage</p>
              <input ref={input} type="file" multiple hidden onChange={e => { if (e.target.files) send(e.target.files); e.target.value = ""; }} />
            </div>

            {uploads.length > 0 && (
              <ul className="mt-4 space-y-2">
                {uploads.map(u => (
                  <li key={u.key} className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">{u.name}</span>
                      {u.error
                        ? <button className="font-mono text-xs text-danger" onClick={() => setUploads(x => x.filter(i => i.key !== u.key))}>{u.error} ✕</button>
                        : <span className="font-mono text-xs text-muted">{u.pct}%</span>}
                    </div>
                    {!u.error && <div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-fg transition-all" style={{ width: `${u.pct}%` }} /></div>}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 overflow-hidden rounded-xl border border-line">
              {files === null ? <p className="p-8 text-center text-sm text-muted">Loading…</p>
                : files.length === 0 ? <p className="p-10 text-center text-sm text-muted">No files in this space yet.</p>
                : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-line bg-surface text-left"><tr>
                      <th className="label px-4 py-3 font-normal">name</th>
                      <th className="label hidden px-4 py-3 font-normal sm:table-cell">shared by</th>
                      <th className="label hidden px-4 py-3 text-right font-normal sm:table-cell">size</th>
                      <th className="label hidden px-4 py-3 font-normal md:table-cell">shared</th>
                      <th className="px-4 py-3" />
                    </tr></thead>
                    <tbody>
                      {files.map(f => (
                        <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface">
                          <td className="max-w-[14rem] truncate px-4 py-3">{f.name}</td>
                          <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{f.uploadedBy.name}</td>
                          <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted sm:table-cell">{formatSize(f.size)}</td>
                          <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{new Date(f.sharedAt).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {confirming === f.id ? (
                              <span className="inline-flex items-center gap-3 font-mono text-xs">
                                <button className="text-danger" title="Removes it from the group; the file itself is kept" onClick={() => act(async () => { await api.unshare(id, f.id); setConfirming(null); })}>confirm remove</button>
                                <button className="text-muted" onClick={() => setConfirming(null)}>cancel</button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-4 font-mono text-xs">
                                <button className="hover:underline" onClick={() => act(() => api.open(f, id))}>open</button>
                                <button className="hover:underline" onClick={() => act(() => api.download(f, id))}>download</button>
                                {(isAdmin || f.uploadedBy.id === user?.id) && <button className="text-muted hover:text-danger" onClick={() => setConfirming(f.id)}>remove</button>}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </section>

          <aside>
            <p className="label">members · {members.length}</p>
            <ul className="mt-3 overflow-hidden rounded-xl border border-line">
              {members.map(m => (
                <li key={m.userId} className="border-b border-line px-4 py-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{m.username}{m.userId === user?.id && <span className="text-muted"> (you)</span>}</span>
                    <span className="label shrink-0">{m.role}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-xs text-muted">
                    <span>joined {new Date(m.joinedAt).toLocaleDateString()}</span>
                    <span className="inline-flex gap-3">
                      {isAdmin && m.userId !== user?.id && (
                        <button className="hover:text-fg" onClick={() => act(() => api.setRole(id, m.userId, m.role === "admin" ? "member" : "admin"))}>{m.role === "admin" ? "demote" : "make admin"}</button>
                      )}
                      {(isAdmin && m.userId !== user?.id) && <button className="hover:text-danger" onClick={() => act(() => api.removeMember(id, m.userId))}>remove</button>}
                      {m.userId === user?.id && <button className="hover:text-danger" onClick={() => act(async () => { await api.removeMember(id, m.userId); navigate("/app/groups"); })}>leave</button>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {isAdmin && (
              <form className="mt-4" onSubmit={e => { e.preventDefault(); if (adding.trim()) act(async () => { await api.addMember(id, adding.trim()); setAdding(""); }); }}>
                <input className="input" placeholder="Add by username or email" aria-label="Add member by username or email" maxLength={254} value={adding} onChange={e => setAdding(e.target.value)} />
                <button className="btn btn-ghost mt-2 w-full" disabled={!adding.trim()}>Add member</button>
              </form>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
