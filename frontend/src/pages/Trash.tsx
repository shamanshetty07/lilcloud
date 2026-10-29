import { useCallback, useEffect, useState } from "react";
import { api, formatSize, type TrashedFile, type TrashedFolder } from "../lib/api.ts";
import { AppHeader } from "../components/AppHeader.tsx";

export default function Trash() {
  const [files, setFiles] = useState<TrashedFile[] | null>(null);
  const [folders, setFolders] = useState<TrashedFolder[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.trash();
      setFiles(result.files);
      setFolders(result.folders);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setFiles(current => current ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try { await action(); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const empty = files?.length === 0 && folders.length === 0;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <p className="label">deleted items</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em]">Trash</h1>
          <p className="mt-2 text-sm text-muted">Restore items to put them back, or delete them permanently.</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="overflow-hidden rounded-xl border border-line">
          {files === null ? <p className="p-8 text-center text-sm text-muted">Loading…</p>
            : empty ? <p className="p-10 text-center text-sm text-muted">Trash is empty.</p>
            : (
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-surface text-left"><tr>
                  <th className="label px-4 py-3 font-normal">name</th>
                  <th className="label hidden px-4 py-3 font-normal sm:table-cell">kind</th>
                  <th className="label hidden px-4 py-3 text-right font-normal sm:table-cell">size</th>
                  <th className="label hidden px-4 py-3 font-normal md:table-cell">deleted</th>
                  <th className="px-4 py-3" />
                </tr></thead>
                <tbody>
                  {folders.map(folder => {
                    const key = `folder:${folder.id}`;
                    return <tr key={key} className="border-b border-line hover:bg-surface">
                      <td className="max-w-[16rem] truncate px-4 py-3">📁 {folder.name}</td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">folder and contents</td>
                      <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted sm:table-cell">—</td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{new Date(folder.deletedAt).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-4 font-mono text-xs">
                          <button disabled={busy === key} className="hover:underline disabled:opacity-50" onClick={() => act(key, () => api.restoreFolder(folder.id))}>restore</button>
                          <button disabled={busy === key} className="text-muted hover:text-danger disabled:opacity-50" onClick={() => {
                            if (window.confirm(`Permanently delete “${folder.name}” and everything inside it? This cannot be undone.`))
                              void act(key, () => api.permanentlyDeleteFolder(folder.id));
                          }}>delete forever</button>
                        </span>
                      </td>
                    </tr>;
                  })}
                  {files?.map(file => {
                    const key = `file:${file.id}`;
                    return <tr key={key} className="border-b border-line last:border-0 hover:bg-surface">
                      <td className="max-w-[16rem] truncate px-4 py-3">{file.name}</td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{file.type}</td>
                      <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted sm:table-cell">{formatSize(file.size)}</td>
                      <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{new Date(file.deletedAt).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-4 font-mono text-xs">
                          <button disabled={busy === key} className="hover:underline disabled:opacity-50" onClick={() => act(key, () => api.restoreFile(file.id))}>restore</button>
                          <button disabled={busy === key} className="text-muted hover:text-danger disabled:opacity-50" onClick={() => {
                            if (window.confirm(`Permanently delete “${file.name}”? This cannot be undone.`))
                              void act(key, () => api.permanentlyDeleteFile(file.id));
                          }}>delete forever</button>
                        </span>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            )}
        </div>
      </main>
    </div>
  );
}
