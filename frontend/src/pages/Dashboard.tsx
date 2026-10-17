import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatSize, MAX_FILE_SIZE, type FileItem } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { Link } from "../lib/router.tsx";
import { Logo } from "../components/Logo.tsx";

type Upload = { key: number; name: string; pct: number; error?: string };
let uploadKey = 0;

export default function Dashboard() {
  const { user, signout } = useAuth();
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setFiles((await api.list()).files); setError(""); }
    catch (e) { setError((e as Error).message); setFiles(f => f ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (key: number, p: Partial<Upload>) => setUploads(u => u.map(x => x.key === key ? { ...x, ...p } : x));

  const send = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const key = ++uploadKey;
      setUploads(u => [...u, { key, name: file.name, pct: 0 }]);
      if (file.size > MAX_FILE_SIZE) { patch(key, { error: "Larger than 25 MB" }); continue; }
      try {
        const saved = await api.upload(file, pct => patch(key, { pct }));
        setFiles(f => [saved, ...(f ?? [])]);
        setUploads(u => u.filter(x => x.key !== key));
      } catch (e) { patch(key, { error: (e as Error).message }); }
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  const shown = (files ?? []).filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  const total = (files ?? []).reduce((s, f) => s + f.size, 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3">
            <Link href="/docs" className="hidden font-mono text-xs text-muted hover:text-fg sm:block">docs</Link>
            <span className="hidden font-mono text-xs text-muted sm:block">{user?.name}</span>
            <button className="btn btn-ghost" onClick={signout}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">your storage</p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em]">Storage</h1>
          </div>
          <p className="font-mono text-xs text-muted">{files?.length ?? 0} files · {formatSize(total)}</p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          className={`hatch cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-fg bg-raised" : "border-line-strong hover:bg-surface"}`}
        >
          <p className="text-sm">Drop anything here or <span className="underline underline-offset-4">browse</span></p>
          <p className="mt-1 font-mono text-xs text-muted">up to 25 MB each</p>
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

        {error && (
          <p role="alert" className="mt-4 flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}<button onClick={() => setError("")} aria-label="Dismiss">✕</button>
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <input className="input max-w-xs" placeholder="Search your storage…" value={query} onChange={e => setQuery(e.target.value)} />
          <button className="btn btn-ghost" onClick={load}>Refresh</button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {files === null ? (
            <p className="p-8 text-center text-sm text-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">{files.length === 0 ? "Nothing here yet. Upload your first item above." : "Nothing matches your search."}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface text-left"><tr>
                <th className="label px-4 py-3 font-normal">name</th>
                <th className="label hidden px-4 py-3 font-normal sm:table-cell">type</th>
                <th className="label px-4 py-3 text-right font-normal">size</th>
                <th className="label hidden px-4 py-3 font-normal md:table-cell">uploaded</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {shown.map(f => (
                  <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="max-w-[16rem] truncate px-4 py-3">{f.name}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{f.type}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">{formatSize(f.size)}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{new Date(f.uploadedAt).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {confirming === f.id ? (
                        <span className="inline-flex items-center gap-3 font-mono text-xs">
                          <button className="text-danger" onClick={() => act(async () => { await api.remove(f.id); setFiles(x => x!.filter(i => i.id !== f.id)); setConfirming(null); })}>confirm delete</button>
                          <button className="text-muted" onClick={() => setConfirming(null)}>cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-4 font-mono text-xs">
                          <button className="hover:underline" onClick={() => act(() => api.download(f))}>download</button>
                          <button className="text-muted hover:text-danger" onClick={() => setConfirming(f.id)}>delete</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
