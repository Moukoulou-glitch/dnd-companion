import { Operation as OperationSchema, type Character, type Operation, type OperationType } from "@dnd/schema";
import type { ContentRegistry } from "@dnd/engine";
import { applyOperation, type Prompt } from "./apply.js";
import { HybridClock } from "./clock.js";

export interface HistoryEntry {
  op: Operation;
  notes: string[];
}

/**
 * A character as a starting snapshot plus an ordered log of operations.
 * The current character is always the snapshot with the log replayed, so
 * undo is just "replay without the last operation". Undone operations stay
 * available for redo until a new operation is recorded.
 */
const CHECKPOINT = 25;

export class CharacterLog {
  private ops: Operation[] = [];
  private redoStack: Operation[] = [];
  private cache?: { character: Character; history: HistoryEntry[] };
  /**
   * The state after every CHECKPOINT operations (index k: after k × CHECKPOINT; 0 is the snapshot), so an
   * undo replays a few operations, not the whole log (each one derives the sheet; a session has hundreds).
   */
  private checkpoints: Character[] = [];
  /** Follow-ups the last recorded operation asks for (a concentration check). */
  lastPrompts: Prompt[] = [];

  constructor(
    private readonly snapshot: Character,
    private readonly reg: ContentRegistry,
    private readonly clock: HybridClock,
    private readonly author: string,
    ops: Operation[] = [],
  ) {
    this.ops = [...ops].sort((a, b) => a.at.localeCompare(b.at));
    for (const op of this.ops) clock.observe(op.at);
  }

  /** The current character, with every logged operation applied. */
  get character(): Character {
    return this.replay().character;
  }

  /** Every applied operation with the notes it produced, oldest first. */
  get history(): readonly HistoryEntry[] {
    return this.replay().history;
  }

  /** The starting snapshot the log is replayed on. */
  get base(): Character {
    return this.snapshot;
  }

  get operations(): readonly Operation[] {
    return this.ops;
  }

  get canUndo(): boolean {
    return this.ops.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Records a new operation and returns the notes it produced. Clears redo. */
  record<T extends OperationType>(type: T, payload: unknown): string[] {
    const op = OperationSchema.parse({
      id: crypto.randomUUID(),
      characterId: this.snapshot.id,
      author: this.author,
      at: this.clock.tick(),
      type,
      payload,
    });
    // Validate against the current state first, so a bad edit never enters the log.
    const before = this.replay();
    const result = applyOperation(before.character, op, this.reg);
    this.ops.push(op);
    this.redoStack = [];
    // The new operation is the latest by clock, so the state is the one just worked out: no replay of the whole
    // log on the next read (a long session's log made every tap replay hundreds of operations).
    this.cache = { character: result.character, history: [...before.history, { op, notes: result.notes }] };
    this.keep(this.ops.length, result.character);
    this.lastPrompts = result.prompts;
    return result.notes;
  }

  /** Removes the last operation. Returns it, or undefined when there is nothing to undo. */
  undo(): Operation | undefined {
    const before = this.cache;
    const op = this.ops.pop();
    if (op) {
      this.redoStack.push(op);
      const n = this.ops.length;
      // Checkpoints past the new end no longer hold.
      this.checkpoints.length = Math.min(this.checkpoints.length, Math.floor(n / CHECKPOINT) + 1);
      const k = this.checkpoints.length - 1;
      if (before && k >= 0) {
        // From the nearest checkpoint: at most CHECKPOINT - 1 operations again.
        let character = this.checkpoints[k]!;
        for (let i = k * CHECKPOINT; i < n; i++) character = applyOperation(character, this.ops[i]!, this.reg).character;
        this.cache = { character, history: before.history.slice(0, n) };
      } else this.invalidate();
    }
    return op;
  }

  /** Re-applies the most recently undone operation. */
  redo(): Operation | undefined {
    const op = this.redoStack.pop();
    if (op) {
      const before = this.cache;
      this.ops.push(op);
      // It was the latest when it was undone, and nothing was recorded since (recording clears redo).
      if (before) {
        const r = applyOperation(before.character, op, this.reg);
        this.cache = { character: r.character, history: [...before.history, { op, notes: r.notes }] };
        this.keep(this.ops.length, r.character);
      } else this.invalidate();
    }
    return op;
  }

  /**
   * Merges operations from another device. Unknown ones are added and the
   * whole log is re-sorted by clock, so both devices end at the same state.
   */
  merge(remote: Operation[]): number {
    const known = new Set(this.ops.map((o) => o.id));
    const fresh = remote.filter((o) => !known.has(o.id));
    for (const op of fresh) this.clock.observe(op.at);
    this.ops = [...this.ops, ...fresh].sort((a, b) => a.at.localeCompare(b.at));
    if (fresh.length) this.invalidate();
    return fresh.length;
  }

  private invalidate() {
    this.cache = undefined;
    this.checkpoints = [];
  }

  /** Keeps the state after `n` operations when n is a checkpoint. */
  private keep(n: number, character: Character) {
    if (n % CHECKPOINT === 0 && this.checkpoints.length === n / CHECKPOINT) this.checkpoints.push(character);
  }

  private replay() {
    if (this.cache) return this.cache;
    let character = this.snapshot;
    const history: HistoryEntry[] = [];
    this.checkpoints = [character];
    for (const op of this.ops) {
      const result = applyOperation(character, op, this.reg);
      character = result.character;
      history.push({ op, notes: result.notes });
      this.keep(history.length, character);
    }
    this.cache = { character, history };
    return this.cache;
  }
}
