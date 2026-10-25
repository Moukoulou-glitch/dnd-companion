import { describe, expect, it } from "vitest";
import { everyDaysNote } from "../src/everyDays";
import { NameFx } from "../src/fx/NameFx";

const story = (minutes?: number) => ({ session: 4, notes: [], ...(minutes !== undefined ? { calendar: { kind: "harptos", minutes } } : {}) }) as never;
describe("13c: once every N days, written in the Backstory", () => {
  it("the note: when, and when it's back", () => {
    const n = everyDaysNote({ name: "Charm of Sunlight", everyDays: 10 }, undefined, story(0))!;
    expect(n).toMatchObject({ title: "Charm of Sunlight used", category: "gold", session: 4, gameMinutes: 0 });
    expect(n.body).toMatch(/can't be used again for 10 days: from /);
    expect(everyDaysNote({ name: "Charm of Sunlight", everyDays: 10 }, undefined, story())?.body).toBe("Charm of Sunlight was used. It can't be used again for 10 days.");
  });
  it("Divine Intervention: only a roll at or under the cleric level starts the 7 days", () => {
    const di = { name: "Divine Intervention", everyDays: 7, everyDaysIfRollAtMost: 12, roll: { dice: "1d100", label: "d100", text: "1d100" } } as never;
    expect(everyDaysNote(di, 13, story())).toBeUndefined();
    expect(everyDaysNote(di, 12, story())?.body).toMatch(/\(rolled 12\)\. It can't be used again for 7 days/);
    expect(everyDaysNote({ name: "Second Wind" }, 5, story())).toBeUndefined();
  });
});

describe("13c: Mirror Image and Blur on the character's name", () => {
  const fx = (effects: { id: string; counter?: { left: number } }[]) => NameFx({ name: "Ilya", sheet: { effects } as never }) as unknown as { props: { className: string; children: unknown[] } };
  it("one drifting copy per duplicate left, and Blur's shimmer", () => {
    expect(fx([]).props.className).toBe("who-name");
    const m = fx([{ id: "effect:mirror-image", counter: { left: 2 } }]);
    expect(m.props.className).toBe("who-name name-mirror name-mirror-2");
    expect((m.props.children[0] as unknown[]).length).toBe(2);
    expect(fx([{ id: "effect:mirror-image", counter: { left: 0 } }, { id: "effect:blur" }]).props.className).toBe("who-name name-blur");
  });
});
