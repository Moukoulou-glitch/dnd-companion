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

export const Operation = z.discriminatedUnion("type", [
  OperationBase.extend({
    type: z.literal("damage"),
    payload: z.object({ amount: z.number().int().min(0), damageType: z.string().optional() }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("heal"),
    payload: z.object({ amount: z.number().int().min(0) }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("setTempHp"),
    payload: z.object({ amount: z.number().int().min(0) }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("setHp"),
    payload: z.object({ current: z.number().int() }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("spendResource"),
    payload: z.object({ resource: z.string(), amount: z.number().int().default(1) }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("restoreResource"),
    payload: z.object({ resource: z.string(), amount: z.number().int().default(1) }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("rest"),
    payload: z.object({ kind: z.enum(["short", "long"]) }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("toggle"),
    payload: z.object({ name: z.string(), on: z.boolean() }).strict(),
  }),
  OperationBase.extend({
    type: z.literal("setField"),
    /** Generic edit of a base value, e.g. path ["abilities","str"]. */
    payload: z.object({ path: z.array(z.union([z.string(), z.number()])), value: z.unknown() }).strict(),
  }),
]);
export type Operation = z.infer<typeof Operation>;
