import { describe, expect, it } from "vitest";
import { createThrower, DICE_EVENT, physicsFor, SkipError, type Box, type DiceEvent } from "../src/diceBox";

/** A stand-in dice box: lands each die on a face we choose, after a moment, telling each settled die like dice-box does. */
function fakeBox(faces: (sides: number, i: number) => number, opts: { hang?: boolean } = {}) {
  const calls: { notation: { qty: number; sides: number; data?: unknown; themeColor?: string; theme?: string }[]; config: object | undefined }[] = [];
  let config: object | undefined;
  let dieDone: ((d: { data?: unknown; value: number }) => void) | undefined;
  let cleared = 0;
  let hidden = 0;
  const box: Box = {
    init: async () => undefined,
    roll: (notation) => {
      calls.push({ notation, config });
      if (opts.hang) return new Promise(() => undefined);
      return new Promise((resolve) =>
        setTimeout(() => {
          // Group ids are dice-box's own counter (not ours); the tag comes back as given.
          const out = notation.map((n, k) => ({ groupId: 500 + k, rollId: k, sides: n.sides, value: faces(n.sides, k), data: n.data }));
          // Settle in reverse order: the strip still knows each die by its group.
          for (const d of [...out].reverse()) dieDone?.(d);
          resolve(out);
        }, 5),
      );
    },
    clear: () => cleared++,
    show: () => undefined,
    hide: () => hidden++,
    updateConfig: (c: object) => {
      config = c;
    },
  };
  const t = createThrower(async () => box, { modeOf: () => "full", hideAfterMs: 0 });
  dieDone = t.dieDone;
  return { t, calls, counts: () => ({ cleared, hidden }) };
}

// The tests run in Node: a window to send the dice events on (Node has EventTarget and CustomEvent).
(globalThis as { window?: EventTarget }).window ??= new EventTarget();

const listen = () => {
  const events: DiceEvent[] = [];
  const h = (e: Event) => events.push((e as CustomEvent<DiceEvent>).detail);
  window.addEventListener(DICE_EVENT, h);
  return { events, stop: () => window.removeEventListener(DICE_EVENT, h) };
};

describe("The 3D thrower: what's asked is what's read, in order", () => {
  it("faces come back in the order asked; each die its own group with its theme and colour", async () => {
    const f = fakeBox((sides, i) => (i % sides) + 1);
    const look = { theme: "default", color: "#d9480f", id: "damage-fire", label: "fire" };
    const faces = await f.t.throwDice([8, 8, 6], [look, look, undefined]);
    expect(faces).toEqual([1, 2, 3]);
    expect(f.calls[0]!.notation).toEqual([
      { qty: 1, sides: 8, data: 0, themeColor: "#d9480f", theme: "default" },
      { qty: 1, sides: 8, data: 1, themeColor: "#d9480f", theme: "default" },
      { qty: 1, sides: 6, data: 2 },
    ]);
  });

  it("40 dice go up in 4 throws of at most 12, and every die is announced once, by its place in the roll", async () => {
    const f = fakeBox(() => 3);
    const l = listen();
    const faces = await f.t.throwDice(Array(40).fill(6));
    l.stop();
    expect(faces).toHaveLength(40);
    expect(f.calls.map((c) => c.notation.length)).toEqual([12, 12, 12, 4]);
    const dies = l.events.filter((e) => e.type === "die") as { index: number }[];
    expect(dies.map((d) => d.index).sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(l.events[0]!.type).toBe("start");
    expect(l.events.at(-1)!.type).toBe("end");
  });

  it("two throws asked at once (a double tap) go one after the other, never mixed", async () => {
    const f = fakeBox((sides) => sides);
    const [a, b] = await Promise.all([f.t.throwDice([20]), f.t.throwDice([4, 4])]);
    expect(a).toEqual([20]);
    expect(b).toEqual([4, 4]);
    expect(f.calls.map((c) => c.notation.length)).toEqual([1, 2]);
  });

  it("Skip: the throw in the air stops at once with a SkipError, the dice are cleared, and the next throw works", async () => {
    const f = fakeBox(() => 1, { hang: true });
    const l = listen();
    const p = f.t.throwDice([20]);
    await new Promise((r) => setTimeout(r, 0));
    f.t.skip();
    await expect(p).rejects.toBeInstanceOf(SkipError);
    l.stop();
    expect(l.events.map((e) => e.type)).toEqual(["start", "skip"]);
    expect(f.counts().cleared).toBe(1);
    expect(f.counts().hidden).toBe(1);
  });

  it("the physics follow the mode; a critical hit is thrown harder; shadows only in full", () => {
    expect(physicsFor("full", false)).toMatchObject({ throwForce: 5, enableShadows: true });
    expect(physicsFor("full", true).throwForce).toBe(8);
    expect(physicsFor("fast", false)).toMatchObject({ gravity: 3, settleTimeout: 2500, enableShadows: false });
    expect(physicsFor("reduced", false).enableShadows).toBe(false);
  });

  it("the throw sends its physics first, and the box is hidden again once the dice clear", async () => {
    const f = fakeBox(() => 2);
    await f.t.throwDice([6], undefined, { strong: true });
    expect(f.calls[0]!.config).toMatchObject({ throwForce: 8 });
    await new Promise((r) => setTimeout(r, 5));
    expect(f.counts()).toEqual({ cleared: 1, hidden: 1 });
  });

  it("Skip works while the library is still loading (the first throw of a visit)", async () => {
    const never = new Promise<Box>(() => undefined);
    const t = createThrower(() => never, { modeOf: () => "full", hideAfterMs: 0 });
    const p = t.throwDice([20]);
    await new Promise((r) => setTimeout(r, 0));
    t.skip();
    await expect(p).rejects.toBeInstanceOf(SkipError);
  });

  it("a big roll's later batches fall faster (the first keeps the mode, and a crit's stronger throw)", async () => {
    const f = fakeBox(() => 1);
    await f.t.throwDice(Array(20).fill(6), undefined, { strong: true });
    expect(f.calls[0]!.config).toMatchObject({ throwForce: 8, gravity: 1 });
    expect(f.calls[1]!.config).toMatchObject({ gravity: 3, enableShadows: true });
  });
});
