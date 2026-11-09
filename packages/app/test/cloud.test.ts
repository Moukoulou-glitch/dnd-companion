import { describe, expect, it } from "vitest";
import { mergeCopies, reconcile, type CloudData } from "../src/cloud.js";
import type { StoredCharacter } from "../src/db.js";

const op = (id: string, at: string) => ({ id, at, type: "rest", payload: {} }) as never;
const char = (id: string, ops: string[] = []): CloudData => ({ id, snapshot: { id, name: id } as never, ops: ops.map((o, i) => op(o, `0000${i}`)), rolls: [] });

describe("21b: in step with the account", () => {
  const rec = (id: string, m: Partial<StoredCharacter> = {}): StoredCharacter => ({ id, snapshot: { id } as never, ops: [], ...m });
  const sv = (id: string, version: number) => ({ id, name: id, version, updatedAt: 0, data: char(id) });
  it("takes newer, sends changed, drops deleted elsewhere, merges both-changed, sends never-sent", () => {
    const plan = reconcile(
      [rec("same", { serverVersion: 2 }), rec("newer", { serverVersion: 1 }), rec("mine", { serverVersion: 3, dirty: true }), rec("both", { serverVersion: 1, dirty: true }), rec("gone", { serverVersion: 1 }), rec("offline-made", { dirty: true })],
      [sv("same", 2), sv("newer", 2), sv("mine", 3), sv("both", 2), sv("elsewhere", 1)],
    );
    expect(plan.take.map((x) => x.id).sort()).toEqual(["elsewhere", "newer"]);
    expect(plan.send.map((x) => x.id).sort()).toEqual(["mine", "offline-made"]);
    expect(plan.drop.map((x) => x.id)).toEqual(["gone"]);
    expect(plan.merge.map((x) => x.local.id)).toEqual(["both"]);
  });
  it("merging: both devices' changes in time order; a replaced copy (other start) wins as sent", () => {
    const a = { ...char("c"), ops: [op("1", "a1"), op("3", "a3")] };
    const b = { ...char("c"), ops: [op("1", "a1"), op("2", "a2")] };
    expect(mergeCopies(a, b).ops.map((o) => o.id)).toEqual(["1", "2", "3"]);
    const replaced = { ...a, snapshot: { id: "c", name: "New" } as never };
    expect(mergeCopies(replaced, b)).toBe(replaced);
  });
});
