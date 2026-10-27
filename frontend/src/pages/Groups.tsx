import { useCallback, useEffect, useState } from "react";
import { api, type Group } from "../lib/api.ts";
import { Link } from "../lib/router.tsx";
import { AppHeader } from "../components/AppHeader.tsx";

export default function Groups() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setGroups((await api.groups()).groups); setError(""); }
    catch (e) { setError((e as Error).message); setGroups(g => g ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await api.createGroup(name.trim()); setName(""); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <p className="label">collaborate</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.04em]">Shared spaces</h1>
          <p className="mt-2 text-sm text-muted">Create a group, add people, and share files that all members can reach.</p>
        </div>

        <form className="flex flex-wrap gap-3" onSubmit={create}>
          <input className="input max-w-xs" maxLength={100} placeholder="New group name" aria-label="New group name" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>Create group</button>
        </form>

        {error && (
          <p role="alert" className="mt-4 flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}<button onClick={() => setError("")} aria-label="Dismiss">✕</button>
          </p>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-line">
          {groups === null ? <p className="p-8 text-center text-sm text-muted">Loading…</p>
            : groups.length === 0 ? <p className="p-10 text-center text-sm text-muted">You're not in any groups yet. Create one above, or ask someone to add you.</p>
            : (
              <ul>
                {groups.map(g => (
                  <li key={g.id} className="border-b border-line last:border-0">
                    <Link href={`/app/groups/${g.id}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-surface">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{g.name}</span>
                        <span className="mt-1 block font-mono text-xs text-muted">{g.memberCount} {g.memberCount === 1 ? "member" : "members"} · {g.fileCount} {g.fileCount === 1 ? "file" : "files"}</span>
                      </span>
                      {g.role === "admin" && <span className="label shrink-0">admin</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </main>
    </div>
  );
}
