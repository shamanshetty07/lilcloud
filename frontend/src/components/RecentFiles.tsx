import { useCallback, useEffect, useState } from "react";
import { api, formatSize, type RecentItem } from "../lib/api.ts";

export function RecentFiles() {
  const [items, setItems] = useState<RecentItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (more = false, from: string | null = null) => {
    try {
      const page = await api.recent(more ? from : null);
      setItems(prev => more ? [...(prev ?? []), ...page.items] : page.items);
      setCursor(page.nextCursor);
      setError("");
    } catch (e) { setError((e as Error).message); setItems(i => i ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (f: RecentItem) => {
    try { await api.open(f); load(); }
    catch (e) {
      setError((e as Error).message);
      load(); // the file may be gone or no longer shared with you, so refresh the list
    }
  };

  return (
    <>
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {items === null ? <p className="p-8 text-center text-sm text-muted">Loading…</p>
          : items.length === 0 ? <p className="p-10 text-center text-sm text-muted">Files you open will show up here.</p>
          : (
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface text-left"><tr>
                <th className="label px-4 py-3 font-normal">name</th>
                <th className="label hidden px-4 py-3 font-normal sm:table-cell">type</th>
                <th className="label hidden px-4 py-3 text-right font-normal sm:table-cell">size</th>
                <th className="label px-4 py-3 font-normal">last viewed</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>
                {items.map(f => (
                  <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="max-w-[16rem] truncate px-4 py-3">{f.name}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted sm:table-cell">{f.type}</td>
                    <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted sm:table-cell">{formatSize(f.size)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{new Date(f.viewedAt).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs"><button className="hover:underline" onClick={() => open(f)}>open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {cursor && <div className="mt-3 text-center"><button className="btn btn-ghost" onClick={() => load(true, cursor)}>Load more</button></div>}
    </>
  );
}
