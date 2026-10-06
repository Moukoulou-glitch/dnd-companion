import { z } from "zod";

/**
 * One logged change to a character. Operations record intent ("take 7 fire
 * damage"), not resulting values, so logs from two devices can be merged by
 * replaying them in clock order. Undo, history, sync and DM actions all come
 * from this log.
 */
export const OperationBase = z.object({
  id: z.string(),
  characterId: z.string(),
  /** User id of whoever made the change (player or DM). */
  author: z.string(),
  /** Hybrid logical clock timestamp: sortable across devices. */
  at: z.string(),
});

export const OPERATION_PAYLOADS = {
  /** Damage of one type; resistances, temp HP and 0 HP are handled when applied. */
  damage: z.object({ amount: z.number().int().min(0), damageType: z.string().optional() }).strict(),
  /** Healing, capped at maximum HP. Healing from 0 HP clears death saves. */
  heal: z.object({ amount: z.number().int().min(0) }).strict(),
  /** Gain temporary HP: they don't stack, so the higher value is kept. 0 clears them. */
  setTempHp: z.object({ amount: z.number().int().min(0) }).strict(),
  /** Set current HP directly (DM ruling, correction). Clamped to 0..max. */
  setHp: z.object({ current: z.number().int() }).strict(),
  spendResource: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict(),
  restoreResource: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict(),
  /** Spend a spell slot of `level`, or a Pact Magic slot. */
  spendSlot: z.object({ level: z.number().int().min(1).max(9), pact: z.boolean().default(false) }).strict(),
  restoreSlot: z.object({ level: z.number().int().min(1).max(9), pact: z.boolean().default(false) }).strict(),
  /** Spend one Hit Die during a short rest; `roll` is the die result (digital or typed from a real die). */
  spendHitDie: z.object({ die: z.string(), roll: z.number().int().min(1) }).strict(),
  rest: z.object({ kind: z.enum(["short", "long"]) }).strict(),
  deathSave: z.object({ result: z.enum(["success", "failure", "critSuccess", "critFailure"]) }).strict(),
  toggle: z.object({ name: z.string(), on: z.boolean() }).strict(),
  /** Generic edit of a stored value, e.g. path ["abilities","str"]. Validated after applying. */
  setField: z.object({ path: z.array(z.union([z.string(), z.number()])).min(1), value: z.unknown() }).strict(),
} as const;

export type OperationType = keyof typeof OPERATION_PAYLOADS;

export const Operation = z.discriminatedUnion("type", [
  OperationBase.extend({ type: z.literal("damage"), payload: OPERATION_PAYLOADS.damage }),
  OperationBase.extend({ type: z.literal("heal"), payload: OPERATION_PAYLOADS.heal }),
  OperationBase.extend({ type: z.literal("setTempHp"), payload: OPERATION_PAYLOADS.setTempHp }),
  OperationBase.extend({ type: z.literal("setHp"), payload: OPERATION_PAYLOADS.setHp }),
  OperationBase.extend({ type: z.literal("spendResource"), payload: OPERATION_PAYLOADS.spendResource }),
  OperationBase.extend({ type: z.literal("restoreResource"), payload: OPERATION_PAYLOADS.restoreResource }),
  OperationBase.extend({ type: z.literal("spendSlot"), payload: OPERATION_PAYLOADS.spendSlot }),
  OperationBase.extend({ type: z.literal("restoreSlot"), payload: OPERATION_PAYLOADS.restoreSlot }),
  OperationBase.extend({ type: z.literal("spendHitDie"), payload: OPERATION_PAYLOADS.spendHitDie }),
  OperationBase.extend({ type: z.literal("rest"), payload: OPERATION_PAYLOADS.rest }),
  OperationBase.extend({ type: z.literal("deathSave"), payload: OPERATION_PAYLOADS.deathSave }),
  OperationBase.extend({ type: z.literal("toggle"), payload: OPERATION_PAYLOADS.toggle }),
  OperationBase.extend({ type: z.literal("setField"), payload: OPERATION_PAYLOADS.setField }),
]);
export type Operation = z.infer<typeof Operation>;
export type OperationInput = z.input<typeof Operation>;
