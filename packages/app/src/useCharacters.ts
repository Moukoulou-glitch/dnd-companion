import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derive, type DerivedSheet } from "@dnd/engine";
import { Character as CharacterSchema, Operation as OperationSchema, type Character, type OperationType } from "@dnd/schema";
import { CharacterLog, HybridClock, type Prompt } from "@dnd/store";
import { registry, starterCharacters } from "./content";
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
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
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
        for (const s of stored) {
          if (s.fixtureHash) fixtureHashes.current.set(s.id, s.fixtureHash);
          // Re-parsing upgrades characters saved by an older version (new fields get their defaults).
          const snapshot = CharacterSchema.parse(s.snapshot);
          const ops = s.ops.map((o) => OperationSchema.parse(o));
          logs.current.set(s.id, new CharacterLog(snapshot, registry, clock, "player", ops));
          rolls.current.set(s.id, s.rolls ?? []);
        }
        setSelectedId((cur) => (cur && logs.current.has(cur) ? cur : stored[0]?.id ?? null));
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
        const notes = log.record(type, payload);
        setVersion((v) => v + 1);
        setToast({ id: Date.now(), text: [label, ...notes].join(" "), canUndo: true });
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${character.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [log, character, selectedId]);

  return { ready, error, character, sheet, roster, selectedId, select, act, undo, canUndo: !!log?.canUndo, toast, setToast, history: log?.history ?? [], exportSelected, addRoll, rolls: (selectedId && rolls.current.get(selectedId)) || [] };
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
