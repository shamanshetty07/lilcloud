import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatSize, MAX_FILE_SIZE, type FileItem, type FolderContents, type FolderItem, type Usage } from "../lib/api.ts";
import { Link, usePath } from "../lib/router.tsx";
import { AppHeader } from "../components/AppHeader.tsx";
import { FolderPicker } from "../components/FolderPicker.tsx";
import { RecentFiles } from "../components/RecentFiles.tsx";
import { FolderPreview } from "../components/ui/folder-preview.tsx";

type Upload = { key: number; name: string; pct: number; error?: string };
type Moving = { kind: "file"; item: FileItem } | { kind: "folder"; item: FolderItem };
type PreviewLine = { name: string; type?: "muted" };
let uploadKey = 0;

const PREVIEW_LINES = 6;
// what the hover bubble lists for a folder: subfolders first, then files, capped with a "+N more" line
const summarize = (c: FolderContents): PreviewLine[] => {
  const names = [...c.folders.map(f => `${f.name}/`), ...c.files.map(f => f.name)];
  if (names.length === 0) return [{ name: "empty", type: "muted" }];
  const shown = names.length > PREVIEW_LINES ? names.slice(0, PREVIEW_LINES - 1) : names;
  const rest = names.length - shown.length;
  return [...shown.map(name => ({ name })), ...(rest > 0 ? [{ name: `+${rest} more`, type: "muted" as const }] : [])];
};

export default function Dashboard() {
  const recent = usePath() === "/app/recent";
  const [folderId, setFolderId] = useState<string | null>(null);
  const [data, setData] = useState<FolderContents | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewLine[]>>({});
  const loadUsage = useCallback(() => { api.usage().then(setUsage).catch(() => {}); }, []);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    // contents may have changed, so hover previews are fetched again on demand
    try { setData(await api.folder(folderId)); setPreviews({}); setError(""); }
    catch (e) {
      setError((e as Error).message);
      // the folder we were in may have been deleted elsewhere: fall back to the top level
      if (folderId) setFolderId(null); else setData(d => d ?? { folder: null, breadcrumb: [], folders: [], files: [] });
    }
  }, [folderId]);
  useEffect(() => { load(); loadUsage(); }, [load, loadUsage]);
  useEffect(() => { setQuery(""); setConfirming(null); setRenaming(null); }, [folderId]);

  const patch = (key: number, p: Partial<Upload>) => setUploads(u => u.map(x => x.key === key ? { ...x, ...p } : x));

  const send = async (list: FileList | File[]) => {
    const target = folderId;
    for (const file of Array.from(list)) {
      const key = ++uploadKey;
      setUploads(u => [...u, { key, name: file.name, pct: 0 }]);
      if (file.size > MAX_FILE_SIZE) { patch(key, { error: "Larger than 25 MB" }); continue; }
      try {
        const saved = await api.upload(file, pct => patch(key, { pct }), { folderId: target });
        // only show it here if the user is still looking at the folder it went into
        setData(d => d && (d.folder?.id ?? null) === target ? { ...d, files: [saved, ...d.files] } : d);
        loadUsage();
        setUploads(u => u.filter(x => x.key !== key));
      } catch (e) { patch(key, { error: (e as Error).message }); }
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  // fetched the first time a folder is hovered or focused, then cached until the next load()
  const peek = (id: string) => {
    if (previews[id]) return;
    setPreviews(p => ({ ...p, [id]: [{ name: "loading…", type: "muted" }] }));
    api.folder(id)
      .then(c => setPreviews(p => ({ ...p, [id]: summarize(c) })))
      .catch(() => setPreviews(p => ({ ...p, [id]: [{ name: "couldn't load", type: "muted" }] })));
  };

  const match = (name: string) => name.toLowerCase().includes(query.toLowerCase());
  const folders = (data?.folders ?? []).filter(f => match(f.name));
  const files = (data?.files ?? []).filter(f => match(f.name));
  const total = (data?.folders.length ?? 0) + (data?.files.length ?? 0);

  const create = () => act(async () => {
    if (creating === null || !creating.trim()) return;
    await api.createFolder(creating.trim(), folderId);
    setCreating(null);
    await load();
  });
  const rename = () => act(async () => {
    if (!renaming) return;
    await api.renameFolder(renaming.id, renaming.name);
    setRenaming(null);
    await load();
  });
  const moveTo = (dest: string | null) => act(async () => {
    if (!moving) return;
    if (moving.kind === "file") await api.moveFile(moving.item.id, dest);
    else await api.moveFolder(moving.item.id, dest);
    setMoving(null);
    await load();
  });

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {recent ? (
          <>
            <div className="mb-6">
              <p className="label">pick up where you left off</p>
              <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em]">Recently viewed</h1>
            </div>
            <RecentFiles />
          </>
        ) : (<>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label">your storage</p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em]">Storage</h1>
          </div>
          <p className="font-mono text-xs text-muted">{total} items</p>
        </div>

        {usage && (
          <div className="mb-6 rounded-xl border border-line bg-surface px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm"><span className="font-medium">{formatSize(usage.usedBytes)}</span> <span className="text-muted">of {formatSize(usage.limitBytes)} used</span></p>
              <Link href="/pricing" className="font-mono text-xs text-muted underline underline-offset-4 hover:text-fg">need more space?</Link>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className={`h-full rounded-full transition-all ${usage.usedBytes / usage.limitBytes > 0.9 ? "bg-danger" : usage.usedBytes / usage.limitBytes > 0.75 ? "bg-warn" : "bg-fg"}`}
                style={{ width: `${Math.min(100, Math.max(usage.usedBytes > 0 ? 1 : 0, (usage.usedBytes / usage.limitBytes) * 100))}%` }} />
            </div>
            {usage.usedBytes / usage.limitBytes > 0.9 && (
              <p className="mt-3 text-sm text-muted">You're almost out of space. Larger plans are launching soon, so <Link href="/pricing" className="text-fg underline underline-offset-4">join the waitlist</Link>.</p>
            )}
          </div>
        )}

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
          <p className="mt-1 font-mono text-xs text-muted">up to 25 MB each{data?.folder ? <> · into <span className="text-fg">{data.folder.name}</span></> : null}</p>
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 truncate font-mono text-xs text-muted" aria-label="Current folder">
            <button className={data?.folder ? "hover:text-fg" : "text-fg"} onClick={() => setFolderId(null)}>storage</button>
            {data?.breadcrumb.map((c, i, all) => (
              <span key={c.id}> / <button className={i === all.length - 1 ? "text-fg" : "hover:text-fg"} onClick={() => setFolderId(c.id)}>{c.name}</button></span>
            ))}
          </p>
          <div className="flex items-center gap-3">
            <input className="input max-w-xs" placeholder="Search this folder…" value={query} onChange={e => setQuery(e.target.value)} />
            <button className="btn btn-ghost whitespace-nowrap" onClick={() => setCreating("")}>New folder</button>
            <button className="btn btn-ghost" onClick={load}>Refresh</button>
          </div>
        </div>

        {creating !== null && (
          <form className="mt-3 flex gap-3" onSubmit={e => { e.preventDefault(); create(); }}>
            <input className="input max-w-xs" autoFocus maxLength={100} placeholder="Folder name" aria-label="Folder name" value={creating} onChange={e => setCreating(e.target.value)} />
            <button className="btn btn-primary" disabled={!creating.trim()}>Create</button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(null)}>Cancel</button>
          </form>
        )}

        {data === null ? (
          <p className="mt-3 rounded-xl border border-line p-8 text-center text-sm text-muted">Loading…</p>
        ) : folders.length + files.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line p-10 text-center text-sm text-muted">{total === 0 ? (data.folder ? "This folder is empty." : "Nothing here yet. Upload your first item above.") : "Nothing matches your search."}</p>
        ) : (<>
          {folders.length > 0 && (
            // top padding leaves room for the contents bubble that pops up above the first row
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-8 rounded-xl border border-line px-4 pb-6 pt-12">
              {folders.map(f => (
                <li key={f.id} className="flex min-w-0 flex-col items-center gap-2">
                  <div
                    role="button" tabIndex={0} aria-label={`Open folder ${f.name}`}
                    className="w-24 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
                    onMouseEnter={() => peek(f.id)} onFocus={() => peek(f.id)}
                    onClick={() => setFolderId(f.id)}
                    onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setFolderId(f.id))}
                  >
                    <FolderPreview variant="lilcloud" size="md" label={renaming?.id === f.id ? undefined : f.name} files={previews[f.id] ?? []} className="w-full" />
                  </div>
                  {renaming?.id === f.id ? (
                    <form className="flex w-full flex-col items-center gap-1" onSubmit={e => { e.preventDefault(); rename(); }}>
                      <input className="input py-1 text-center text-sm" autoFocus maxLength={100} aria-label="New folder name" value={renaming.name} onChange={e => setRenaming({ id: f.id, name: e.target.value })} />
                      <span className="inline-flex gap-3 font-mono text-xs">
                        <button className="hover:underline">save</button>
                        <button type="button" className="text-muted" onClick={() => setRenaming(null)}>cancel</button>
                      </span>
                    </form>
                  ) : confirming === f.id ? (
                    <span className="inline-flex flex-wrap justify-center gap-x-3 font-mono text-xs">
                      <button className="text-danger" title="Moves the folder and everything inside it to trash" onClick={() => act(async () => { await api.deleteFolder(f.id); setConfirming(null); await load(); })}>move contents to trash</button>
                      <button className="text-muted" onClick={() => setConfirming(null)}>cancel</button>
                    </span>
                  ) : (
                    <span className="inline-flex flex-wrap justify-center gap-x-3 font-mono text-xs text-muted">
                      <button className="hover:text-fg" onClick={() => setRenaming({ id: f.id, name: f.name })}>rename</button>
                      <button className="hover:text-fg" onClick={() => setMoving({ kind: "folder", item: f })}>move</button>
                      <button className="hover:text-danger" onClick={() => setConfirming(f.id)}>delete</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(files.length > 0 || (data.folder && !query)) && (
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface text-left"><tr>
                <th className="label px-4 py-3 font-normal">name</th>
                <th className="label hidden px-4 py-3 font-normal sm:table-cell">type</th>
                <th className="label px-4 py-3 text-right font-normal">size</th>
                <th className="label hidden px-4 py-3 font-normal md:table-cell">uploaded</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {data.folder && !query && (
                  <tr className="border-b border-line hover:bg-surface">
                    <td className="px-4 py-3" colSpan={5}>
                      <button className="font-mono text-xs text-muted hover:text-fg" onClick={() => setFolderId(data.folder!.parentId)}>← back</button>
                    </td>
                  </tr>
                )}
                {files.map(f => (
                  <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="max-w-[16rem] truncate px-4 py-3">{f.name}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{f.type}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">{formatSize(f.size)}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{new Date(f.uploadedAt).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {confirming === f.id ? (
                        <span className="inline-flex items-center gap-3 font-mono text-xs">
                          <button className="text-danger" onClick={() => act(async () => { await api.remove(f.id); setData(d => d && { ...d, files: d.files.filter(i => i.id !== f.id) }); setConfirming(null); })}>move to trash</button>
                          <button className="text-muted" onClick={() => setConfirming(null)}>cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-4 font-mono text-xs">
                          <button className="hover:underline" onClick={() => act(() => api.open(f))}>open</button>
                          <button className="hover:underline" onClick={() => act(() => api.download(f))}>download</button>
                          <button className="hover:underline" onClick={() => setMoving({ kind: "file", item: f })}>move</button>
                          <button className="text-muted hover:text-danger" onClick={() => setConfirming(f.id)}>trash</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>)}
        </>)}
      </main>
      {moving && <FolderPicker exclude={moving.kind === "folder" ? moving.item.id : undefined} onPick={moveTo} onClose={() => setMoving(null)} />}
    </div>
  );
}
