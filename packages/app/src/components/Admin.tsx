import { useEffect, useState } from "react";
import { AdminApi, TAG_KINDS, type AdminCharacter, type AdminList, type TagKind } from "../cloud";
import { download, fileOf } from "../useCharacters";

const api = new AdminApi();
const when = (ms: number) => new Date(ms).toLocaleDateString();
const TAG_LABEL: Record<TagKind, string> = { player: "Player", character: "Character", level: "Level", campaign: "Campaign", general: "General" };

/**
 * The admin's page (only the admin's account can use it; the server checks): who may sign in, how many
 * characters each may keep, and everyone's characters (download a file of one, or delete it).
 */
export function AdminPanel({ sync }: { sync?: () => Promise<void> } = {}) {
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
  /** Moving a character: which one, and to whom. */
  const [moving, setMoving] = useState<{ id: string; to: string; copy: boolean } | null>(null);
  /** The tags being edited (one character at a time). */
  const [tagging, setTagging] = useState<{ id: string; tags: Partial<Record<TagKind, string>> } | null>(null);
  const [q, setQ] = useState("");

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
  /** Where a character can go: another account on the list or yours; a copy can stay with its owner too. */
  const targets = (c: AdminCharacter, copy: boolean) => owners.filter((x) => (copy || x !== c.owner) && !list.removed.some((r) => r.email === x));
  /** A tag: typed by you, or filled in (Player: the account, Character: the name, Level: its level). */
  const autoTag = (c: AdminCharacter, k: TagKind) => (k === "player" ? (c.owner === list.admin.email ? "you" : c.owner) : k === "character" ? c.name : k === "level" ? (c.level ? String(c.level) : "") : "");
  const tagsOf = (c: AdminCharacter) =>
    Object.fromEntries(TAG_KINDS.map((k) => [k, c.tags?.[k] ? { value: c.tags[k]!, typed: true } : { value: autoTag(c, k), typed: false }])) as Record<TagKind, { value: string; typed: boolean }>;
  const matches = (c: AdminCharacter) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [c.name, c.owner, ...TAG_KINDS.map((k) => tagsOf(c)[k].value)].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };

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
      <input className="search" type="search" placeholder="Search: name, player, campaign, level, any tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search characters" />
      {owners.map((o) => {
        const mine = chars.filter((c) => c.owner === o && matches(c));
        if (!mine.length) return null;
        const removed = list.removed.some((r) => r.email === o);
        return (
          <div key={o} style={{ marginBottom: 12 }}>
            <div className="row-sub">
              {o}
              {o === list.admin.email ? " (you)" : removed ? " (no longer on the list)" : ""}
            </div>
            <div className="group">
              {mine.map((c) => {
                const tags = tagsOf(c);
                return (
                  <div key={c.id} className="row">
                    <div className="row-main">
                      <div className="row-title">{c.name || "(no name)"}</div>
                      <div className="row-sub">changed {when(c.updatedAt)}</div>
                      <div className="admin-tags" aria-label="Tags">
                        {TAG_KINDS.map((k) =>
                          tags[k].value ? (
                            <span key={k} className={`admin-tag${tags[k].typed ? "" : " auto"}`} title={tags[k].typed ? "typed by you" : "filled in by the app"}>
                              <b>{TAG_LABEL[k]}</b> {tags[k].value}
                            </span>
                          ) : null,
                        )}
                      </div>
                      {tagging?.id === c.id && (
                        <div className="admin-move">
                          {TAG_KINDS.map((k) => (
                            <label key={k} className="admin-tag-field">
                              <span className="row-sub">{TAG_LABEL[k]}</span>
                              <input
                                className="text"
                                value={tagging.tags[k] ?? ""}
                                placeholder={autoTag(c, k) || (k === "general" ? "anything (comma-separated)" : "")}
                                onChange={(e) => setTagging({ id: c.id, tags: { ...tagging.tags, [k]: e.target.value } })}
                              />
                            </label>
                          ))}
                          <p className="note">Empty: Player, Character and Level fill themselves in (the account, the name, the level). Several values: separate them with commas. Only you see these.</p>
                          <div className="admin-row">
                            <button className="chip" disabled={busy} onClick={() => void run(() => api.setTags(c.id, tagging.tags), () => `Tags saved for ${c.name || "the character"}.`).then(() => setTagging(null))}>
                              Save tags
                            </button>
                            <button className="chip" onClick={() => setTagging(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {moving?.id === c.id && (
                        <div className="admin-move">
                          <div className="segmented" role="radiogroup" aria-label="Move or copy">
                            <button role="radio" aria-checked={!moving.copy} onClick={() => setMoving({ ...moving, copy: false, to: moving.to === c.owner ? (targets(c, false)[0] ?? "") : moving.to })}>
                              Move
                            </button>
                            <button role="radio" aria-checked={moving.copy} onClick={() => setMoving({ ...moving, copy: true })}>
                              Copy
                            </button>
                          </div>
                          <label className="row-sub" htmlFor={`move-${c.id}`}>
                            {moving.copy ? "A copy of" : "Move"} {c.name || "it"} to
                          </label>
                          <select id={`move-${c.id}`} className="text" value={moving.to} onChange={(e) => setMoving({ ...moving, to: e.target.value })}>
                            {targets(c, moving.copy).map((x) => {
                              const p = list.players.find((y) => y.email === x);
                              return (
                                <option key={x} value={x}>
                                  {x === list.admin.email ? `${x} (you)` : `${x} (${p?.count ?? 0} of ${p?.limit ?? "?"})`}
                                </option>
                              );
                            })}
                          </select>
                          <p className="note">
                            {moving.copy
                              ? "A new character with everything this one has (and your tags); the original stays where it is."
                              : `It leaves ${c.owner === list.admin.email ? "your" : `${c.owner}'s`} account (and their devices, the next time they open the app) and appears on the new owner's. Nothing is lost.`}
                          </p>
                          <div className="admin-row">
                            <button
                              className="chip"
                              disabled={busy || !moving.to}
                              onClick={async () => {
                                // Your own: anything not yet on the account goes up first, so nothing is left behind.
                                if (c.owner === list.admin.email) await sync?.();
                                const { to, copy } = moving;
                                await run(
                                  () => api.moveCharacter(c.id, to, copy),
                                  (r: { owner: string }) => `${c.name || "The character"} ${copy ? "copied" : "moved"} to ${r.owner === list.admin.email ? "you" : r.owner}.`,
                                );
                                setMoving(null);
                                // Gone from this device when it was yours, here when it's now yours.
                                await sync?.();
                              }}
                            >
                              {moving.copy ? "Make the copy" : "Move"}
                            </button>
                            <button className="chip" onClick={() => setMoving(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="admin-row">
                        <button className="chip" onClick={() => void fileOfOne(c)}>
                          Download file
                        </button>
                        {moving?.id !== c.id && (
                          <button className="chip" onClick={() => setMoving({ id: c.id, to: targets(c, false)[0] ?? list.admin.email, copy: false })}>
                            Move or copy…
                          </button>
                        )}
                        {tagging?.id !== c.id && (
                          <button className="chip" onClick={() => setTagging({ id: c.id, tags: { ...(c.tags ?? {}) } })}>
                            Tags
                          </button>
                        )}
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
                );
              })}
            </div>
          </div>
        );
      })}
      {q && !chars.some(matches) && <p className="note">No character matches "{q}".</p>}
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
