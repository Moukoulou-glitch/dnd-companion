import { useEffect, useState } from "react";
import { AdminApi, type AdminCharacter, type AdminList } from "../cloud";
import { download, fileOf } from "../useCharacters";

const api = new AdminApi();
const when = (ms: number) => new Date(ms).toLocaleDateString();

/**
 * The admin's page (only the admin's account can use it; the server checks): who may sign in, how many
 * characters each may keep, and everyone's characters (download a file of one, or delete it).
 */
export function AdminPanel() {
  const [list, setList] = useState<AdminList | null>(null);
  const [chars, setChars] = useState<AdminCharacter[]>([]);
  const [msg, setMsg] = useState("");
  /** The last message was a problem (shown in red), not a confirmation. */
  const [bad, setBad] = useState(false);
  const say = (text: string, problem = false) => {
    setMsg(text);
    setBad(problem);
  };
  const [email, setEmail] = useState("");
  const [limit, setLimit] = useState(6);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = async () => {
    const [l, c] = await Promise.all([api.players(), api.characters()]);
    if ("error" in l) return say(l.error, true);
    setList(l);
    setLimit((x) => x || l.defaultLimit);
    if (!("error" in c)) setChars(c.characters);
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (what: () => Promise<{ error: string } | object>, said?: (r: never) => string) => {
    setBusy(true);
    const r = await what();
    setBusy(false);
    setConfirm(null);
    if ("error" in r) return say(r.error as string, true);
    say(said ? said(r as never) : "");
    await load();
  };

  const fileOfOne = async (c: AdminCharacter): Promise<boolean> => {
    const r = await api.character(c.id);
    if ("error" in r) {
      say(r.error, true);
      return false;
    }
    download(`${c.name || "Character"} (${c.owner}).json`, fileOf({ ...r.data, rolls: r.data.rolls ?? [] }));
    return true;
  };

  if (!list) return <p className="note">{msg || "Loading…"}</p>;
  const owners = [list.admin.email, ...list.players.map((p) => p.email), ...list.removed.map((r) => r.email)];
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="admin">
      {msg && <p className={`note${bad ? " warn" : " admin-said"}`}>{msg}</p>}

      <p className="sub-head">Add a Google account</p>
      <input className="text" type="email" inputMode="email" autoCapitalize="none" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="admin-row">
        <span>Characters they can keep</span>
        <LimitInput value={limit} onChange={setLimit} />
      </div>
      <button
        className="big primary"
        style={{ width: "100%" }}
        disabled={!valid || busy}
        onClick={() =>
          void run(
            () => api.setPlayer(email.trim(), limit),
            (r: { email: string; limit: number }) => {
              setEmail("");
              return `${r.email} can sign in now (up to ${r.limit} characters).`;
            },
          )
        }
      >
        Add
      </button>

      <p className="sub-head" style={{ marginTop: 20 }}>
        Players ({list.players.length})
      </p>
      {list.players.length === 0 && <p className="note">Nobody yet. Add your players' Gmail addresses above.</p>}
      <div className="group">
        {list.players.map((p) => (
          <div key={p.email} className="row admin-player">
            <div className="row-main">
              <div className="row-title">{p.email}</div>
              <div className="row-sub">
                {p.count} of {p.limit} characters{p.count > p.limit ? " (over the limit: they keep them, but can't add more)" : ""} · added {when(p.addedAt)}
              </div>
              <div className="admin-row">
                <span>Limit</span>
                <LimitInput value={p.limit} onChange={(n) => void run(() => api.setPlayer(p.email, n), (r: { note?: string }) => r.note ?? "")} />
                {confirm === p.email ? (
                  <>
                    <button className="chip danger-text" disabled={busy} onClick={() => void run(() => api.removePlayer(p.email), (r: { characters: number }) => `${p.email} can't sign in any more.${r.characters ? ` Their ${r.characters} character${r.characters === 1 ? " is" : "s are"} kept below.` : ""}`)}>
                      Yes, remove
                    </button>
                    <button className="chip" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="chip danger-text" onClick={() => setConfirm(p.email)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="sub-head" style={{ marginTop: 20 }}>
        Everyone's characters ({chars.length})
      </p>
      {owners.map((o) => {
        const mine = chars.filter((c) => c.owner === o);
        if (!mine.length) return null;
        const removed = list.removed.some((r) => r.email === o);
        return (
          <div key={o} style={{ marginBottom: 12 }}>
            <div className="row-sub">
              {o}
              {o === list.admin.email ? " (you)" : removed ? " (no longer on the list)" : ""}
            </div>
            <div className="group">
              {mine.map((c) => (
                <div key={c.id} className="row">
                  <div className="row-main">
                    <div className="row-title">{c.name || "(no name)"}</div>
                    <div className="row-sub">changed {when(c.updatedAt)}</div>
                    <div className="admin-row">
                      <button className="chip" onClick={() => void fileOfOne(c)}>
                        Download file
                      </button>
                      {confirm === c.id ? (
                        <>
                          <button
                            className="chip danger-text"
                            disabled={busy}
                            onClick={async () => {
                              // Its file first, then gone for good (like a player's own delete).
                              if (await fileOfOne(c)) await run(() => api.deleteCharacter(c.id), () => `${c.name} deleted for good; their file was downloaded.`);
                            }}
                          >
                            Yes, delete
                          </button>
                          <button className="chip" onClick={() => setConfirm(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <button className="chip danger-text" onClick={() => setConfirm(c.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="note">You ({list.admin.email}) can always sign in and have no limit. The default for new players is {list.defaultLimit}.</p>
    </div>
  );
}

/** A small number box with − and + (0 to 100). */
function LimitInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(100, n)));
  return (
    <span className="limit-input">
      <button className="chip" aria-label="One fewer" onClick={() => set(value - 1)} disabled={value <= 0}>
        −
      </button>
      <span className="limit-value">{value}</span>
      <button className="chip" aria-label="One more" onClick={() => set(value + 1)} disabled={value >= 100}>
        +
      </button>
    </span>
  );
}
