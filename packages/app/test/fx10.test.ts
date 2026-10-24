import { describe, expect, it } from "vitest";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CAST_MS, SIGNATURES, genLook, spellInfoOf, tierOf } from "../src/fx/generated.js";
import { SIG_HIT, Signature } from "../src/fx/Signature.js";
import { SPELL_FX } from "../src/fx/spells.js";
import { rollFx } from "../src/fx/triggers.js";
import type { RollRecord } from "../src/rolls.js";

const reg = tableRegistry();
const info = (id: string) => spellInfoOf(reg.find(id, "spell"));
const dmg = (r: Partial<RollRecord>): RollRecord => ({ id: "r", at: 0, title: "", kind: "damage", total: 0, crit: false, fumble: false, physical: false, lines: [], ...r });

describe("signature spells (12b)", () => {
  it("thirty iconic spells, all in the content, each with its own piece on the cast", () => {
    const ids = Object.keys(SIGNATURES);
    expect(ids).toHaveLength(30);
    for (const id of ids) {
      const s = info(id);
      expect(s, id).toBeDefined();
      const g = genLook(s!, "cast");
      expect(g.sig).toBe(SIGNATURES[id]!.sig);
      // Same framework: its tier's length (at most 3 s), title, shake and tap to skip.
      expect(g.ms).toBe(CAST_MS[tierOf(s!.level)]);
      const piece = Signature({ g, x: 195, y: 500 });
      expect(piece.at ?? piece.screen, id).toBeTruthy();
    }
  });
  it("their own colours and place when they have them; no generic circle when they draw their own", () => {
    const pwk = genLook(info("spell:power-word-kill")!, "cast");
    expect([pwk.rgb, pwk.at, pwk.noSigil, pwk.tier, pwk.shake > 0]).toEqual(["200, 30, 45", "center", true, 4, true]);
    const shield = genLook(info("spell:shield")!, "cast");
    expect([shield.at, shield.noSigil]).toEqual(["hp", true]);
    expect(genLook(info("spell:misty-step")!, "cast").at).toBe("tap");
    expect(genLook(info("spell:disintegrate")!, "cast").rgb).toBe("120, 255, 120");
    expect(genLook(info("spell:fireball")!, "cast").noSigil).toBeUndefined();
  });
  it("Magic Missile: three darts, one more for each slot level above 1st", () => {
    const mm = info("spell:magic-missile")!;
    expect(genLook(mm, "cast", { slot: 1 }).count).toBe(3);
    expect(genLook(mm, "cast", { slot: 4 }).count).toBe(6);
  });
  it("on the damage: their own impact when they have one, the hand-made bursts kept", () => {
    for (const s of SIG_HIT) expect(Object.values(SIGNATURES).some((d) => d.sig === s)).toBe(true);
    const ev = rollFx(dmg({ spell: "spell:meteor-swarm", byType: { Fire: 40, Bludgeoning: 40 } }), undefined, info);
    expect((ev[0] as { g: { sig: string; phase: string } }).g).toMatchObject({ sig: "meteors", phase: "resolve" });
    // Fireball and Lightning Bolt keep their own damage looks (fx/spells.ts).
    expect(SPELL_FX["spell:fireball"]?.resolve).toBeDefined();
    expect(rollFx(dmg({ spell: "spell:lightning-bolt", byType: { Lightning: 30 } }), undefined, info)[0]).toEqual({ kind: "spell", spell: "spell:lightning-bolt", phase: "resolve" });
  });
});
