import { useState } from "react";
import { signInAgain, signOut } from "../cloud";
import type { Account, MoveOver } from "../useCharacters";

/** A whole-screen message about the account: signed out, or not on the list. */
export function AccountGate({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <main style={{ padding: 16 }}>
      <h2>{title}</h2>
      <p className="note">{text}</p>
      <button className="big primary" style={{ width: "100%", marginTop: 12 }} onClick={onAction}>
        {action}
      </button>
    </main>
  );
}

/** Who's signed in, how many characters of the limit, and whether everything is saved to the account. */
export function AccountLine({ account, onRetry }: { account: Extract<Account, { kind: "cloud" }>; onRetry?: () => void }) {
  const { me } = account;
  const state = account.signedOut
    ? "Sign-in ran out: changes wait on this phone."
    : !account.online
      ? account.waiting
        ? `Offline: ${account.waiting} character${account.waiting === 1 ? "" : "s"} with changes waiting to be saved.`
        : "Offline: everything was saved."
      : account.waiting
        ? "Saving…"
        : "Everything is saved to your account.";
  return (
    <div className="account-line">
      <div className="row-title">{me.email}</div>
      <div className="row-sub">
        {me.limit === null ? `${me.count} character${me.count === 1 ? "" : "s"} (admin: no limit)` : `${me.count} of ${me.limit} characters`} · {state}
      </div>
      <div className="account-actions">
        {(!account.online || account.signedOut) && onRetry && (
          <button className="chip" onClick={account.signedOut ? signInAgain : onRetry}>
            {account.signedOut ? "Sign in again" : "Try again"}
          </button>
        )}
        <button className="chip" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * The first time on the account: the characters already on this phone. The ones picked (up to the limit)
 * go to the account; the rest, and any in Deleted characters, are downloaded as one file and removed.
 */
export function MoveOverScreen({ move, online, email, onMove }: { move: MoveOver; online: boolean; email: string; onMove: (picked: string[]) => Promise<string> }) {
  const room = move.room;
  const [picked, setPicked] = useState<string[]>(() => move.active.filter((c) => c.played).slice(0, room ?? move.active.length).map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : room !== null && p.length >= room ? p : [...p, id]));
  const leaving = move.active.filter((c) => !picked.includes(c.id)).length + move.bin.length;
  return (
    <main style={{ padding: 16 }}>
      <h2>Move your characters to your account</h2>
      <p className="note">
        Signed in as {email}. These characters are on this phone from before.
        {room === null ? " Pick the ones to keep on your account." : room === 0 ? " Your account is already full, so none can go online: they'll be downloaded as a file." : ` Pick up to ${room} to keep on your account.`}
      </p>
      {move.active.length > 0 && (
        <div className="group">
          {move.active.map((c) => (
            <label key={c.id} className="row check">
              <input type="checkbox" checked={picked.includes(c.id)} disabled={!picked.includes(c.id) && room !== null && picked.length >= room} onChange={() => toggle(c.id)} />
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">
                  {c.summary}
                  {c.played ? "" : " · never played on this phone"}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
      {move.bin.length > 0 && <p className="note">In Deleted characters: {move.bin.map((b) => b.name).join(", ")}. They go into the file too.</p>}
      <p className="note">
        {leaving
          ? `${leaving} character${leaving === 1 ? "" : "s"} not moved will be downloaded as one file (import it later to bring any back), then removed from this phone.`
          : "Nothing is left behind."}
      </p>
      {!online && <p className="note warn">You're offline: moving needs a connection.</p>}
      <button
        className="big primary"
        style={{ width: "100%", marginTop: 12 }}
        disabled={!online || busy}
        onClick={async () => {
          setBusy(true);
          const said = await onMove(picked);
          // Still here (nothing moved, offline): ready to try again.
          setBusy(false);
          if (said) console.info(said);
        }}
      >
        {busy ? "Moving…" : picked.length ? `Move ${picked.length} to my account` : "Download them and continue"}
      </button>
    </main>
  );
}
