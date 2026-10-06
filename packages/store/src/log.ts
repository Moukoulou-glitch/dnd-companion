import { Operation as OperationSchema, type Character, type Operation, type OperationType } from "@dnd/schema";
import type { ContentRegistry } from "@dnd/engine";
import { applyOperation } from "./apply.js";
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
export class CharacterLog {
  private ops: Operation[] = [];
  private redoStack: Operation[] = [];
  private cache?: { character: Character; history: HistoryEntry[] };

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
    const result = applyOperation(this.character, op, this.reg);
    this.ops.push(op);
    this.redoStack = [];
    this.invalidate();
    return result.notes;
  }

  /** Removes the last operation. Returns it, or undefined when there is nothing to undo. */
  undo(): Operation | undefined {
    const op = this.ops.pop();
    if (op) {
      this.redoStack.push(op);
      this.invalidate();
    }
    return op;
  }

  /** Re-applies the most recently undone operation. */
  redo(): Operation | undefined {
    const op = this.redoStack.pop();
    if (op) {
      this.ops.push(op);
      this.invalidate();
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
  }

  private replay() {
    if (this.cache) return this.cache;
    let character = this.snapshot;
    const history: HistoryEntry[] = [];
    for (const op of this.ops) {
      const result = applyOperation(character, op, this.reg);
      character = result.character;
      history.push({ op, notes: result.notes });
    }
    this.cache = { character, history };
    return this.cache;
  }
}
