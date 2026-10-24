import type { Character, Operation } from "@dnd/schema";
import type { ContentRegistry } from "@dnd/engine";
import { applyOperation } from "./apply.js";

type DamagePayload = Extract<Operation, { type: "damage" }>["payload"];

/**
 * Whether to ask about Relentless Endurance before recording this damage: it
 * would drop the character from above 0 to 0 hit points without killing them
 * outright (after resistances, temporary HP, a Wild Shape, Death Ward), and a
 * use is left. Works on a copy: nothing is recorded.
 */
export function offersRelentless(c: Character, payload: DamagePayload, reg: ContentRegistry): boolean {
  if (payload.companion || c.hp.current <= 0) return false;
  const op = { id: "dry-run", characterId: c.id, author: "dry-run", at: "0", type: "damage", payload } as Operation;
  const before = applyOperation(c, op, reg);
  if (before.character.hp.current !== 0 || before.prompts.some((p) => p.kind === "dead")) return false;
  // The same damage with the feature chosen: does it actually help (a use left, the feature there)?
  const after = applyOperation(c, { ...op, payload: { ...payload, relentless: true } } as Operation, reg);
  return after.character.hp.current === 1;
}

/**
 * What could stop this damage dropping the character to 0, asked before it's
 * recorded: Strength of the Grave (its save DC: 5 + the damage taken, after
 * resistances) and Relentless Endurance. Works on a copy: nothing is recorded.
 */
export function zeroHpOptions(c: Character, payload: DamagePayload, reg: ContentRegistry): { grave?: { dc: number }; rage?: { dc: number }; relentless: boolean } {
  const relentless = offersRelentless(c, payload, reg);
  if (payload.companion || c.hp.current <= 0) return { relentless };
  const op = { id: "dry-run", characterId: c.id, author: "dry-run", at: "0", type: "damage", payload } as Operation;
  const prompts = applyOperation(c, op, reg).prompts;
  const g = prompts.find((p) => p.kind === "grave");
  // Relentless Rage (while raging): a Constitution save, DC 10 and 5 more for each use since the last rest.
  const r = prompts.find((p) => p.kind === "rage");
  return { ...(g ? { grave: { dc: g.dc } } : {}), ...(r ? { rage: { dc: r.dc } } : {}), relentless };
}
