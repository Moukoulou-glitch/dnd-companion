import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { derive, type DerivedSheet } from "@dnd/engine";
import type { Character, OperationType } from "@dnd/schema";
import { CharacterLog, HybridClock } from "@dnd/store";
import { registry, starterCharacters } from "./content";
import { db, deviceId, requestPersistentStorage } from "./db";

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
          stored = starterCharacters.map((c) => ({ id: c.id, snapshot: c, ops: [] }));
          await Promise.all(stored.map((s) => db.put(s)));
        }
        for (const s of stored) logs.current.set(s.id, new CharacterLog(s.snapshot, registry, clock, "player", s.ops));
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
      await db.put({ id, snapshot: l.base, ops: [...l.operations] });
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    }
  }, []);

  /** Records an operation on the selected character and shows what happened. */
  const act = useCallback(
    (type: OperationType, payload: unknown, label: string) => {
      if (!log || !selectedId) return;
      try {
        const notes = log.record(type, payload);
        setVersion((v) => v + 1);
        setToast({ id: Date.now(), text: [label, ...notes].join(" "), canUndo: true });
        void persist(log, selectedId);
      } catch (e) {
        setToast({ id: Date.now(), text: `Not saved: ${(e as Error).message}`, canUndo: false });
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
    const data = { format: "table-companion/character@1", character, operations: log.operations };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${character.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [log, character]);

  return { ready, error, character, sheet, roster, selectedId, select, act, undo, canUndo: !!log?.canUndo, toast, setToast, history: log?.history ?? [], exportSelected };
}

function summarize(c: Character): string {
  return c.classes.map((cl) => `${registry.get(cl.class, "class").name} ${cl.level}`).join(" / ");
}
