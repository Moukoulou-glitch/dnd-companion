import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derive, type DerivedSheet } from "@dnd/engine";
import { Character as CharacterSchema, Operation as OperationSchema, type Character, type OperationType } from "@dnd/schema";
import { CharacterLog, HybridClock, type Prompt } from "@dnd/store";
import { addBooks, referencesOf, registry, starterCharacters, stubMissing } from "./content";
import { db, deviceId, requestPersistentStorage, type StoredCharacter } from "./db";
import { MAX_ROLLS, type RollRecord } from "./rolls";

export interface Toast {
  id: number;
  text: string;
  canUndo: boolean;
}

const clock = new HybridClock(deviceId());

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
  /** Deleted characters, kept whole (with their changes and rolls) so they can be restored. */
  const deleted = useRef(new Map<string, StoredCharacter & { deletedAt: number }>());
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        addBooks(await db.books());
      } catch (e) {
        setError(`Couldn't read the book text on this device: ${(e as Error).message}`);
      }
      try {
        let stored = await db.all();
        if (stored.length === 0) {
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
      await db.put(rec);
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    }
  }, []);

  /** Records an operation on the selected character and shows what happened. */
  /** Records an operation and returns any follow-up it asks for (a concentration check). */
  const act = useCallback(
    (type: OperationType, payload: unknown, label: string): Prompt[] => {
      if (!log || !selectedId) return [];
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
    () => [...logs.current.entries()].map(([id, l]) => ({ id, name: l.character.name, summary: summarize(l.character) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, version],
  );

  const exportSelected = useCallback(() => {
    if (!log || !character) return;
    const data = { format: "table-companion/character@1", character, operations: log.operations, rolls: rolls.current.get(selectedId ?? "") ?? [] };
    download(`${character.name}.json`, data);
  }, [log, character, selectedId]);

  /** Every character on this device in one file: the backup to keep somewhere else. */
  const exportAll = useCallback(() => {
    const characters = [...logs.current.entries()].map(([id, l]) => ({ format: "table-companion/character@1", character: l.character, operations: l.operations, rolls: rolls.current.get(id) ?? [] }));
    if (!characters.length) return;
    download(`D&D Companion backup ${new Date().toISOString().slice(0, 10)}.json`, { format: "table-companion/backup@1", exportedAt: new Date().toISOString(), characters });
    markBackup();
  }, []);

  /** Adds a character (a new one from the builder, or an imported file) and selects it. */
  const create = useCallback(
    async (c: Character, label = `${c.name} created.`) => {
      const l = new CharacterLog(CharacterSchema.parse(c), registry, clock, "player");
      logs.current.set(c.id, l);
      rolls.current.set(c.id, []);
      fixtureHashes.current.delete(c.id);
      deleted.current.delete(c.id);
      await persist(l, c.id);
      select(c.id);
      setVersion((v) => v + 1);
      setToast({ id: Date.now(), text: label, canUndo: false });
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

  return { ready, error, character, sheet, roster, selectedId, select, act, undo, canUndo: !!log?.canUndo, toast, setToast, history: log?.history ?? [], exportSelected, exportAll, addRoll, rolls: (selectedId && rolls.current.get(selectedId)) || [], create, readImport, remove, restore, purge, deleted: deletedList };
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** When this device last made a full backup (a reminder only: it lives in this browser). */
export function lastBackup(): number | undefined {
  try {
    const v = Number(localStorage.getItem("dnd-last-backup"));
    return v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}
function markBackup() {
  try {
    localStorage.setItem("dnd-last-backup", String(Date.now()));
  } catch {
    /* private window: no reminder, nothing lost */
  }
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
