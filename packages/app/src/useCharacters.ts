import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derive, type DerivedSheet } from "@dnd/engine";
import { Character as CharacterSchema, Operation as OperationSchema, type Character, type OperationType } from "@dnd/schema";
import { CharacterLog, HybridClock, type Prompt } from "@dnd/store";
import { addBooks, referencesOf, registry, starterCharacters, stubMissing } from "./content";
import { db, deviceId, requestPersistentStorage, type StoredCharacter } from "./db";
import { MAX_ROLLS, type RollRecord } from "./rolls";
import { CommitGuard } from "./commitGuard";
import { lastBackup, markBackup } from "./backup";
import { cachedMe, Cloud, mergeCopies, reconcile, toCloud, type CloudData, type Me, type ServerCharacter } from "./cloud";

export { lastBackup };

export interface Toast {
  id: number;
  text: string;
  canUndo: boolean;
}

const clock = new HybridClock(deviceId());

/**
 * Where characters are kept: this device only (the app on GitHub Pages, as before), or the signed-in
 * account (the app on the Worker), with this device's copy for offline play.
 */
export type Account =
  | { kind: "local" }
  | { kind: "cloud"; me: Me; online: boolean; signedOut: boolean; waiting: number }
  | { kind: "signed-out" }
  | { kind: "no-access"; message: string };

/** Characters from before signing in, waiting to be moved to the account (or downloaded). */
export interface MoveOver {
  active: { id: string; name: string; summary: string; played: boolean }[];
  bin: { id: string; name: string }[];
  /** How many can go online (null: no limit). */
  room: number | null;
}

function readSelected(): string | null {
  try {
    return localStorage.getItem("selected-character");
  } catch {
    return null;
  }
}

/** Loads every character from the device, tracks the selected one, and records changes. */
export function useCharacters() {
  const logs = useRef(new Map<string, CharacterLog>());
  const rolls = useRef(new Map<string, RollRecord[]>());
  const fixtureHashes = useRef(new Map<string, string>());
  const guard = useRef(new CommitGuard());
  /** Deleted characters, kept whole (with their changes and rolls) so they can be restored. */
  const deleted = useRef(new Map<string, StoredCharacter & { deletedAt: number }>());
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cloud = useRef(new Cloud());
  const [account, setAccount] = useState<Account>({ kind: "local" });
  const acct = useRef<Account>(account);
  acct.current = account;
  /** Per character, on the account: the server's version, changed since, and a counter of local changes. */
  const meta = useRef(new Map<string, { serverVersion?: number; dirty?: boolean; rev: number; blocked?: boolean }>());
  const pushing = useRef(new Set<string>());
  const again = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const unowned = useRef<StoredCharacter[]>([]);
  const [moveOver, setMoveOver] = useState<MoveOver | null>(null);

  useEffect(() => {
    (async () => {
      try {
        addBooks(await db.books());
      } catch (e) {
        setError(`Couldn't read the book text on this device: ${(e as Error).message}`);
      }
      try {
        let stored = await db.all();
        // On the account's app: who's signed in (the server says, from the sign-in), or the last account offline.
        const who = await cloud.current.me();
        const me = who.kind === "cloud" ? who.me : who.kind === "offline" || who.kind === "signed-out" ? cachedMe() : undefined;
        if (who.kind === "no-access") {
          setAccount({ kind: "no-access", message: who.message });
          setReady(true);
          return;
        }
        if (who.kind === "signed-out" && !me) {
          setAccount({ kind: "signed-out" });
          setReady(true);
          return;
        }
        if (me) {
          const a: Account = { kind: "cloud", me, online: who.kind === "cloud", signedOut: who.kind === "signed-out", waiting: 0 };
          // Known at once (not only from the next render): the first sync below needs it.
          acct.current = a;
          setAccount(a);
          // This account's characters; ones from before signing in wait to be moved over; other accounts' stay hidden.
          unowned.current = stored.filter((r) => !r.owner);
          stored = stored.filter((r) => r.owner === me.email);
          for (const r of stored) meta.current.set(r.id, { ...(r.serverVersion !== undefined ? { serverVersion: r.serverVersion } : {}), ...(r.dirty ? { dirty: true } : {}), rev: 0 });
        } else if (stored.length === 0) {
          stored = starterCharacters.map((c) => ({ id: c.id, snapshot: c, ops: [], fixtureHash: hashOf(c) }));
          await Promise.all(stored.map((s) => db.put(s)));
        }
        // Reference characters updated in a new version: take the new snapshot and replay the player's changes on it.
        for (const rec of stored) {
          const fresh = starterCharacters.find((c) => c.id === rec.id);
          if (!fresh || rec.fixtureHash === hashOf(fresh)) continue;
          rec.snapshot = fresh;
          rec.fixtureHash = hashOf(fresh);
          await db.put(rec);
        }
        stubMissing(stored.flatMap((s) => referencesOf(s.snapshot, s.ops)));
        for (const s of stored) {
          if (s.deletedAt) {
            deleted.current.set(s.id, s as StoredCharacter & { deletedAt: number });
            continue;
          }
          if (s.fixtureHash) fixtureHashes.current.set(s.id, s.fixtureHash);
          // Re-parsing upgrades characters saved by an older version (new fields get their defaults).
          const snapshot = CharacterSchema.parse(s.snapshot);
          const ops = s.ops.map((o) => OperationSchema.parse(o));
          logs.current.set(s.id, new CharacterLog(snapshot, registry, clock, "player", ops));
          rolls.current.set(s.id, s.rolls ?? []);
        }
        setSelectedId((cur) => (cur && logs.current.has(cur) ? cur : [...logs.current.keys()][0] ?? null));
        void requestPersistentStorage();
        if (me) {
          if (unowned.current.length) setMoveOver(moveOverOf(unowned.current, me, stored.filter((r) => !r.deletedAt).length));
          if (who.kind === "cloud") void syncAll();
        }
      } catch (e) {
        setError(`Couldn't open saved characters: ${(e as Error).message}`);
      }
      setReady(true);
    })();
  }, []);

  const log = selectedId ? logs.current.get(selectedId) : undefined;

  const character: Character | undefined = useMemo(() => log?.character, [log, version]);
  const sheet: DerivedSheet | undefined = useMemo(() => (character ? derive(character, registry) : undefined), [character]);

  const persist = useCallback(async (l: CharacterLog, id: string) => {
    try {
      const rec: StoredCharacter = { id, snapshot: l.base, ops: [...l.operations], rolls: rolls.current.get(id) ?? [] };
      const hash = fixtureHashes.current.get(id);
      if (hash) rec.fixtureHash = hash;
      const a = acct.current;
      if (a.kind === "cloud") {
        // On the account: marked as changed here, and sent shortly (one send for a burst of taps).
        const m = meta.current.get(id) ?? { rev: 0 };
        m.rev += 1;
        m.dirty = true;
        meta.current.set(id, m);
        rec.owner = a.me.email;
        if (m.serverVersion !== undefined) rec.serverVersion = m.serverVersion;
        rec.dirty = true;
        await db.put(rec);
        schedulePush(id);
        return;
      }
      await db.put(rec);
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The account (the app on the Worker) ----

  /** This device's record of a character, as it would be saved. */
  const recordOf = (id: string): StoredCharacter | undefined => {
    const l = logs.current.get(id);
    if (!l) return undefined;
    const rec: StoredCharacter = { id, snapshot: l.base, ops: [...l.operations], rolls: rolls.current.get(id) ?? [] };
    const hash = fixtureHashes.current.get(id);
    if (hash) rec.fixtureHash = hash;
    return rec;
  };

  /** Puts a character from the account (or a merged copy) on this device. */
  const loadFrom = async (data: CloudData, serverVersion: number, dirty: boolean) => {
    const a = acct.current;
    if (a.kind !== "cloud") return;
    stubMissing(referencesOf(data.snapshot, data.ops));
    const l = new CharacterLog(CharacterSchema.parse(data.snapshot), registry, clock, "player", data.ops.map((o) => OperationSchema.parse(o)));
    logs.current.set(data.id, l);
    rolls.current.set(data.id, data.rolls ?? []);
    if (data.fixtureHash) fixtureHashes.current.set(data.id, data.fixtureHash);
    const m = meta.current.get(data.id) ?? { rev: 0 };
    m.serverVersion = serverVersion;
    m.dirty = dirty;
    meta.current.set(data.id, m);
    await db.put({ ...data, rolls: data.rolls ?? [], owner: a.me.email, serverVersion, ...(dirty ? { dirty: true } : {}) });
  };

  const setCloud = (change: (a: Extract<Account, { kind: "cloud" }>) => Partial<Extract<Account, { kind: "cloud" }>>) => {
    const cur = acct.current;
    if (cur.kind === "cloud") acct.current = { ...cur, ...change(cur) };
    setAccount((a) => (a.kind === "cloud" ? { ...a, ...change(a) } : a));
  };
  const waitingCount = () => [...meta.current.entries()].filter(([id, m]) => m.dirty && logs.current.has(id)).length;
  const refreshCount = () => setCloud((a) => ({ waiting: waitingCount(), me: { ...a.me, count: logs.current.size } }));

  const schedulePush = (id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.set(id, setTimeout(() => void push(id), 1200));
    refreshCount();
  };

  /** Sends one character's changes to the account. */
  const push = async (id: string): Promise<void> => {
    const a = acct.current;
    if (a.kind !== "cloud" || !a.online || a.signedOut) return;
    if (pushing.current.has(id)) {
      again.current.add(id);
      return;
    }
    const rec = recordOf(id);
    const m = meta.current.get(id);
    if (!rec || !m || m.blocked) return;
    pushing.current.add(id);
    const rev = m.rev;
    const data = toCloud(rec);
    const name = logs.current.get(id)!.character.name;
    try {
      const r = await cloud.current.save(data, name, m.serverVersion);
      if (r.kind === "saved") {
        // Changes from another device came along: this device's copy takes them in.
        if (r.data && r.data !== data) {
          const added = logs.current.get(id)?.merge(r.data.ops) ?? 0;
          if (r.data.rolls) rolls.current.set(id, r.data.rolls);
          if (added) {
            setVersion((v) => v + 1);
            setToast({ id: Date.now(), text: `${name}: changes from another device added.`, canUndo: false });
          }
        }
        m.serverVersion = r.version;
        if (m.rev === rev) m.dirty = false;
        const now = recordOf(id);
        if (now) await db.put({ ...now, owner: a.me.email, serverVersion: r.version, ...(m.dirty ? { dirty: true } : {}) });
      } else if (r.kind === "limit") {
        // Made offline past the limit: it stays on this device only, not sent again.
        m.blocked = true;
        setToast({ id: Date.now(), text: `${name} couldn't be saved to your account: ${r.message} It's only on this device; export it as a file to keep it.`, canUndo: false });
      } else if (r.kind === "offline") setCloud(() => ({ online: false }));
      else if (r.kind === "signed-out") setCloud(() => ({ signedOut: true }));
      else if (r.kind === "foreign") setToast({ id: Date.now(), text: `${name} belongs to another account and can't be saved to yours.`, canUndo: false });
      else if (r.kind === "error") setToast({ id: Date.now(), text: `${name} wasn't saved to your account: ${r.message}`, canUndo: false });
    } finally {
      pushing.current.delete(id);
      refreshCount();
      if (again.current.delete(id)) void push(id);
    }
  };

  /** Reads the account and brings this device in step with it. */
  const syncAll = async (): Promise<void> => {
    const a = acct.current;
    if (a.kind !== "cloud") return;
    const list = await cloud.current.list();
    if (list === "offline") return setCloud(() => ({ online: false }));
    if (list === "signed-out") return setCloud(() => ({ signedOut: true }));
    setCloud(() => ({ online: true, signedOut: false }));
    const local = [...logs.current.keys()].map((id) => ({ ...recordOf(id)!, ...meta.current.get(id) }));
    const plan = reconcile(local, list);
    for (const s2 of plan.take) await loadFrom(s2.data, s2.version, false);
    for (const d of plan.drop) {
      logs.current.delete(d.id);
      rolls.current.delete(d.id);
      meta.current.delete(d.id);
      await db.remove(d.id);
    }
    for (const { local: l, server: sv } of plan.merge) await loadFrom(mergeCopies(toCloud(l), sv.data), sv.version, true);
    for (const x of [...plan.send, ...plan.merge.map((p2) => p2.local)]) void push(x.id);
    if (plan.take.length || plan.drop.length || plan.merge.length) {
      setSelectedId((cur) => (cur && logs.current.has(cur) ? cur : [...logs.current.keys()][0] ?? null));
      setVersion((v) => v + 1);
    }
    refreshCount();
  };

  // Back online, or back to the app: send what's waiting and fetch what changed elsewhere.
  useEffect(() => {
    const wake = async () => {
      const a = acct.current;
      if (a.kind !== "cloud") return;
      const who = await cloud.current.me();
      if (who.kind === "cloud") {
        setCloud(() => ({ online: true, signedOut: false, me: { ...who.me, count: logs.current.size } }));
        acct.current = { ...a, online: true, signedOut: false };
        await syncAll();
      } else if (who.kind === "signed-out") setCloud(() => ({ signedOut: true }));
      else if (who.kind === "offline") setCloud(() => ({ online: false }));
    };
    const visible = () => {
      if (document.visibilityState === "visible") void wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", visible);
    const every = setInterval(() => {
      const a = acct.current;
      if (a.kind === "cloud" && (!a.online || waitingCount() > 0)) void wake();
    }, 30_000);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Moving over the characters from before signing in: the picked ones go to the account; the rest (and the
   * deleted ones) are downloaded together as one backup file, then removed from this device.
   */
  const doMoveOver = useCallback(async (picked: string[]): Promise<string> => {
    const a = acct.current;
    if (a.kind !== "cloud" || !a.online) return "Moving needs a connection.";
    const notes: string[] = [];
    const leave: StoredCharacter[] = [];
    for (const r of unowned.current) {
      if (r.deletedAt || !picked.includes(r.id)) {
        leave.push(r);
        continue;
      }
      let data: CloudData = toCloud(r);
      const nameOf = (d: CloudData) => {
        try {
          return new CharacterLog(CharacterSchema.parse(d.snapshot), registry, clock, "player", d.ops.map((o) => OperationSchema.parse(o))).character.name;
        } catch {
          return d.snapshot.name;
        }
      };
      let res = await cloud.current.save(data, nameOf(data));
      // The same id on another account (a shared file): saved as a copy with a new id.
      if (res.kind === "foreign") {
        const id = crypto.randomUUID();
        data = { ...data, id, snapshot: { ...data.snapshot, id } };
        res = await cloud.current.save(data, nameOf(data));
      }
      if (res.kind === "saved") await loadFrom(res.data ?? data, res.version, false);
      else {
        leave.push(r);
        notes.push(`${nameOf(data)}: ${res.kind === "limit" ? res.message : "not moved"}`);
        if (res.kind === "offline" || res.kind === "signed-out") break;
      }
    }
    if (leave.length) {
      const characters = leave.map((r) => fileOf(r));
      download(`D&D Companion, not moved ${new Date().toLocaleDateString("sv-SE")}.json`, { format: "table-companion/backup@1", exportedAt: new Date().toISOString(), characters });
    }
    // Everything from before signing in leaves this device: on the account, or in the downloaded file.
    for (const r of unowned.current) if (!logs.current.has(r.id) || leave.includes(r)) await db.remove(r.id);
    unowned.current = [];
    setMoveOver(null);
    setSelectedId((cur) => (cur && logs.current.has(cur) ? cur : [...logs.current.keys()][0] ?? null));
    setVersion((v) => v + 1);
    refreshCount();
    await syncAll();
    const said = [`${logs.current.size} character${logs.current.size === 1 ? "" : "s"} on your account.`, leave.length ? `${leave.length} downloaded as a file.` : "", ...notes].filter(Boolean).join(" ");
    setToast({ id: Date.now(), text: said, canUndo: false });
    return said;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Records an operation on the selected character and shows what happened. */
  /** Records an operation and returns any follow-up it asks for (a concentration check). */
  const act = useCallback(
    (type: OperationType, payload: unknown, label: string): Prompt[] => {
      if (!log || !selectedId) return [];
      // A fast second tap on something that spends: recorded once (commitGuard.ts).
      if (!guard.current.allow(type, payload, Date.now())) {
        setToast({ id: Date.now(), text: "Second tap ignored: that was already recorded.", canUndo: false });
        return log.lastPrompts;
      }
      try {
        const before = log.character;
        const notes = log.record(type, payload);
        // For the app's flourishes (a golden glow on Channel Divinity, Rage's veins).
        window.dispatchEvent(new CustomEvent("dnd-op", { detail: { type, payload, before, after: log.character } }));
        setVersion((v) => v + 1);
        setToast({ id: Date.now(), text: [label, ...notes.filter((n) => n !== label)].join(" "), canUndo: true });
        void persist(log, selectedId);
        return log.lastPrompts;
      } catch (e) {
        setToast({ id: Date.now(), text: `Not saved: ${(e as Error).message}`, canUndo: false });
        return [];
      }
    },
    [log, selectedId, persist],
  );

  const undo = useCallback(() => {
    if (!log || !selectedId) return;
    const op = log.undo();
    if (!op) return;
    guard.current.reset();
    setVersion((v) => v + 1);
    setToast({ id: Date.now(), text: "Undone.", canUndo: false });
    void persist(log, selectedId);
  }, [log, selectedId, persist]);

  /** Saves a roll to the selected character's history (newest first, capped). */
  const addRoll = useCallback(
    (r: RollRecord) => {
      if (!log || !selectedId) return;
      rolls.current.set(selectedId, [r, ...(rolls.current.get(selectedId) ?? [])].slice(0, MAX_ROLLS));
      // For the flourishes (a crit, a natural 1, Sneak Attack): once, when the roll is saved.
      window.dispatchEvent(new CustomEvent("dnd-roll", { detail: r }));
      setVersion((v) => v + 1);
      void persist(log, selectedId);
    },
    [log, selectedId, persist],
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem("selected-character", id);
    } catch {
      /* the choice just won't be remembered */
    }
  }, []);

  const roster = useMemo(
    () => [...logs.current.entries()].map(([id, l]) => ({ id, name: l.character.name, summary: summarize(l.character), character: l.character })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, version],
  );

  const exportSelected = useCallback(() => {
    if (!log || !character) return;
    // (the same file as a deleted character's: fileOf)
    const data = { format: "table-companion/character@1", character, operations: log.operations, rolls: rolls.current.get(selectedId ?? "") ?? [] };
    download(`${character.name}.json`, data);
  }, [log, character, selectedId]);

  /** Every character on this device in one file: the backup to keep somewhere else. */
  const exportAll = useCallback(() => {
    const characters = [...logs.current.entries()].map(([id, l]) => ({ format: "table-companion/character@1", character: l.character, operations: l.operations, rolls: rolls.current.get(id) ?? [] }));
    if (!characters.length) return;
    download(`D&D Companion backup ${new Date().toLocaleDateString("sv-SE")}.json`, { format: "table-companion/backup@1", exportedAt: new Date().toISOString(), characters });
    markBackup();
    setVersion((v) => v + 1); // the reminder goes away
  }, []);

  /**
   * The oldest change not in a full backup yet: the earliest change recorded after
   * the last backup (with none ever, any change). Undefined: nothing to back up.
   */
  const oldestUnsaved = useMemo((): number | undefined => {
    if (!ready) return undefined;
    const since = lastBackup() ?? 0;
    let oldest: number | undefined;
    for (const l of logs.current.values()) {
      for (const op of l.operations) {
        const ms = HybridClock.parse(op.at).ms;
        if (ms > since && (oldest === undefined || ms < oldest)) oldest = ms;
      }
    }
    return oldest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version]);

  /**
   * Adds a character (a new one from the builder, or an imported file) and selects it. On the account,
   * a new one counts toward the limit: past it, it isn't added (false).
   */
  const create = useCallback(
    async (c: Character, label = `${c.name} created.`): Promise<boolean> => {
      const a = acct.current;
      if (a.kind === "cloud" && !logs.current.has(c.id)) {
        const limitMsg = (n: number) => `You've reached your limit of ${n} characters. Delete one, or ask your DM for more.`;
        if (a.me.limit !== null && logs.current.size >= a.me.limit) {
          setToast({ id: Date.now(), text: `${c.name} wasn't added. ${limitMsg(a.me.limit)}`, canUndo: false });
          return false;
        }
        if (a.online && !a.signedOut) {
          let data: CloudData = { id: c.id, snapshot: c, ops: [], rolls: [] };
          let r = await cloud.current.save(data, c.name);
          if (r.kind === "foreign") {
            // A file from another account's character: it comes in as a copy of its own.
            const id = crypto.randomUUID();
            c = { ...c, id };
            data = { ...data, id, snapshot: c };
            r = await cloud.current.save(data, c.name);
          }
          if (r.kind === "limit") {
            setToast({ id: Date.now(), text: `${c.name} wasn't added. ${limitMsg(r.limit)}`, canUndo: false });
            return false;
          }
          if (r.kind === "saved") meta.current.set(c.id, { serverVersion: r.version, rev: 0 });
        }
      }
      const l = new CharacterLog(CharacterSchema.parse(c), registry, clock, "player");
      logs.current.set(c.id, l);
      rolls.current.set(c.id, []);
      fixtureHashes.current.delete(c.id);
      deleted.current.delete(c.id);
      await persist(l, c.id);
      select(c.id);
      setVersion((v) => v + 1);
      setToast({ id: Date.now(), text: label, canUndo: false });
      return true;
    },
    [persist, select],
  );

  /**
   * Reads an exported character file. Returns the character, or why it can't be
   * read; `exists` says a character with that id is already on this device.
   */
  const readImport = useCallback((text: string): { character?: Character; exists?: boolean; error?: string } => {
    try {
      const data = JSON.parse(text) as { format?: string; character?: unknown };
      if (data.format !== "table-companion/character@1" || !data.character) return { error: "That isn't a character file exported from this app." };
      const character = CharacterSchema.parse(data.character);
      for (const cl of character.classes) if (!registry.has(cl.class)) return { error: `It uses a class this app doesn't have: ${cl.class}.` };
      if (!registry.has(character.race)) return { error: `It uses a race this app doesn't have: ${character.race}.` };
      stubMissing(referencesOf(character, ((data as { operations?: { type: string; payload: unknown }[] }).operations ?? [])));
      return { character, exists: logs.current.has(character.id) };
    } catch (e) {
      return { error: `Couldn't read it: ${(e as Error).message}` };
    }
  }, []);

  /** Deletes a character: it moves to the deleted list, with everything it had, and can be restored. */
  const remove = useCallback(
    async (id: string) => {
      const l = logs.current.get(id);
      if (!l) return;
      const name = l.character.name;
      const a = acct.current;
      if (a.kind === "cloud") {
        // On the account: its file is downloaded, then it's deleted for good (no bin).
        if (!a.online || a.signedOut) {
          setToast({ id: Date.now(), text: `Deleting ${name} needs a connection: nothing was deleted.`, canUndo: false });
          return;
        }
        download(`${name}.json`, fileOf(recordOf(id)!));
        const r = meta.current.get(id)?.serverVersion !== undefined ? await cloud.current.remove(id) : "deleted";
        if (r !== "deleted") {
          setToast({ id: Date.now(), text: `${name} wasn't deleted: ${typeof r === "object" ? r.error : r === "offline" ? "no connection" : "sign in again"}. Its file was downloaded anyway.`, canUndo: false });
          return;
        }
        await db.remove(id);
        logs.current.delete(id);
        rolls.current.delete(id);
        meta.current.delete(id);
        const next = [...logs.current.keys()][0];
        if (next) select(next);
        else setSelectedId(null);
        setVersion((v) => v + 1);
        refreshCount();
        setToast({ id: Date.now(), text: `${name} deleted for good. Their file was downloaded: import it to bring them back.`, canUndo: false });
        return;
      }
      const rec: StoredCharacter & { deletedAt: number } = { id, snapshot: l.base, ops: [...l.operations], rolls: rolls.current.get(id) ?? [], deletedAt: Date.now() };
      const hash = fixtureHashes.current.get(id);
      if (hash) rec.fixtureHash = hash;
      try {
        await db.put(rec);
      } catch (e) {
        setError(`Couldn't delete: ${(e as Error).message}`);
        return;
      }
      deleted.current.set(id, rec);
      logs.current.delete(id);
      rolls.current.delete(id);
      const next = [...logs.current.keys()][0];
      if (next) select(next);
      else setSelectedId(null);
      setVersion((v) => v + 1);
      setToast({ id: Date.now(), text: `${name} deleted. You can restore them from Deleted characters.`, canUndo: false });
    },
    [select],
  );

  /** Brings a deleted character back exactly as they were. */
  const restore = useCallback(
    async (id: string) => {
      const rec = deleted.current.get(id);
      if (!rec) return;
      stubMissing(referencesOf(rec.snapshot, rec.ops));
      const snapshot = CharacterSchema.parse(rec.snapshot);
      const ops = rec.ops.map((o) => OperationSchema.parse(o));
      const l = new CharacterLog(snapshot, registry, clock, "player", ops);
      const back: StoredCharacter = { id, snapshot: rec.snapshot, ops: rec.ops, rolls: rec.rolls ?? [] };
      if (rec.fixtureHash) back.fixtureHash = rec.fixtureHash;
      await db.put(back);
      deleted.current.delete(id);
      logs.current.set(id, l);
      rolls.current.set(id, rec.rolls ?? []);
      if (rec.fixtureHash) fixtureHashes.current.set(id, rec.fixtureHash);
      select(id);
      setVersion((v) => v + 1);
      setToast({ id: Date.now(), text: `${l.character.name} restored.`, canUndo: false });
    },
    [select],
  );

  /** Removes a deleted character for good. */
  const purge = useCallback(async (id: string) => {
    const name = deleted.current.get(id)?.snapshot.name ?? "Character";
    await db.remove(id);
    deleted.current.delete(id);
    setVersion((v) => v + 1);
    setToast({ id: Date.now(), text: `${name} is gone for good.`, canUndo: false });
  }, []);

  const deletedList = useMemo(
    () =>
      [...deleted.current.values()]
        .sort((a, b) => b.deletedAt - a.deletedAt)
        .map((r) => {
          let summary = "";
          let name = r.snapshot.name;
          try {
            const c = new CharacterLog(CharacterSchema.parse(r.snapshot), registry, clock, "player", r.ops.map((o) => OperationSchema.parse(o))).character;
            name = c.name;
            summary = summarize(c);
          } catch {
            /* a class this device no longer has */
          }
          return { id: r.id, name, summary, deletedAt: r.deletedAt };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, version],
  );

  return { ready, error, character, sheet, roster, selectedId, select, act, undo, canUndo: !!log?.canUndo, toast, setToast, history: log?.history ?? [], exportSelected, exportAll, oldestUnsaved, addRoll, rolls: (selectedId && rolls.current.get(selectedId)) || [], create, readImport, remove, restore, purge, deleted: account.kind === "cloud" ? [] : deletedList, account, moveOver, doMoveOver, retrySync: () => void syncAll() };
}

export function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}


/** The character files inside a backup (or the one character file), for importing. */
export function filesIn(text: string): string[] {
  try {
    const data = JSON.parse(text) as { format?: string; characters?: unknown[] };
    if (data.format === "table-companion/backup@1" && Array.isArray(data.characters)) return data.characters.map((x) => JSON.stringify(x));
  } catch {
    /* not JSON: readImport says so */
  }
  return [text];
}

function summarize(c: Character): string {
  return c.classes.map((cl) => `${registry.get(cl.class, "class").name} ${cl.level}`).join(" / ");
}

/** Short fingerprint of a reference character, to notice when a new version ships. */
function hashOf(c: Character): string {
  const text = JSON.stringify(c);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** A character's export file (the same as "Export as a file"), from a saved record. */
export function fileOf(r: StoredCharacter) {
  let character: Character = r.snapshot;
  try {
    character = new CharacterLog(CharacterSchema.parse(r.snapshot), registry, clock, "player", r.ops.map((o) => OperationSchema.parse(o))).character;
  } catch {
    /* a class this device no longer has: the starting snapshot */
  }
  return { format: "table-companion/character@1", character, operations: r.ops, rolls: r.rolls ?? [] };
}

/** The move-over screen's list: played characters first, untouched reference characters last. */
function moveOverOf(records: StoredCharacter[], me: Me, onAccount: number): MoveOver {
  const active = records
    .filter((r) => !r.deletedAt)
    .map((r) => {
      const f = fileOf(r);
      let summary = "";
      try {
        summary = summarize(f.character);
      } catch {
        /* unknown class */
      }
      return { id: r.id, name: f.character.name, summary, played: r.ops.length > 0 || !r.fixtureHash };
    })
    .sort((a, b) => Number(b.played) - Number(a.played));
  const bin = records.filter((r) => r.deletedAt).map((r) => ({ id: r.id, name: fileOf(r).character.name }));
  return { active, bin, room: me.limit === null ? null : Math.max(0, me.limit - Math.max(onAccount, me.count)) };
}
