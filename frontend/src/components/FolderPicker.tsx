import { useEffect, useState } from "react";
import { api, type FolderContents } from "../lib/api.ts";

export function FolderPicker({ exclude, onPick, onClose }: { exclude?: string; onPick: (folderId: string | null) => void; onClose: () => void }) {
  const [at, setAt] = useState<string | null>(null);
  const [data, setData] = useState<FolderContents | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    api.folder(at).then(d => { setData(d); setError(""); }).catch(e => setError((e as Error).message));
  }, [at]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label="Move to folder" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5" onClick={e => e.stopPropagation()}>
        <p className="label">move to</p>
        <p className="mt-2 truncate font-mono text-xs text-muted">
          <button className="hover:text-fg" onClick={() => setAt(null)}>storage</button>
          {data?.breadcrumb.map(c => <span key={c.id}> / <button className="hover:text-fg" onClick={() => setAt(c.id)}>{c.name}</button></span>)}
        </p>
        <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
          {error ? <li className="p-4 text-sm text-danger">{error}</li>
            : !data ? <li className="p-4 text-sm text-muted">Loading…</li>
            : data.folders.filter(f => f.id !== exclude).length === 0 ? <li className="p-4 text-sm text-muted">No folders here.</li>
            : data.folders.filter(f => f.id !== exclude).map(f => (
              <li key={f.id} className="border-b border-line last:border-0">
                <button className="w-full px-4 py-2.5 text-left text-sm hover:bg-raised" onClick={() => setAt(f.id)}>{f.name}</button>
              </li>
            ))}
        </ul>
        <div className="mt-4 flex justify-end gap-3">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!data} onClick={() => onPick(at)}>Move here</button>
        </div>
      </div>
    </div>
  );
}
