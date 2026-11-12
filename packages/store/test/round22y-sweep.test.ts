import { expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
it("22y: no subclass, race, feat or item makes a NaN, undefined or a throw on the sheet", () => {
  const reg = tableRegistry();
  const subs = reg.list("subclass") as unknown as { id: string; class: string }[];
  const out: string[] = [];
  for (const s of subs) for (const level of [3, 6, 10, 14, 17, 20]) {
    const c = newCharacter({ id: "s", name: "S", race: "race:human", class: s.class, abilities: { str: 12, dex: 14, con: 14, int: 12, wis: 14, cha: 14 } }, reg);
    c.classes = [{ class: s.class, level, subclass: s.id }];
    try {
      const sh = derive(c, reg);
      const txt = JSON.stringify({ a: sh.actions, r: sh.resources, at: sh.attacks });
      for (const m of txt.matchAll(/.{60}(NaN|undefined|\[object|Infinity).{20}/g)) out.push(`${s.id} ${level}: ${m[0]}`);
    } catch (e) { out.push(`${s.id} ${level}: THROW ${(e as Error).message}`); }
  }
  for (const r of reg.list("race") as unknown as { id: string }[]) for (const f of [null, ...(reg.list("feat") as unknown as { id: string }[])].slice(0, 400)) {
    const c = newCharacter({ id: "s", name: "S", race: r.id, class: "class:fighter", abilities: { str: 12, dex: 14, con: 14, int: 12, wis: 14, cha: 14 } }, reg);
    c.classes = [{ class: "class:fighter", level: 8 }];
    if (f) c.feats.push({ feat: f.id, from: "x" });
    try {
      const sh = derive(c, reg);
      const txt = JSON.stringify({ a: sh.actions, r: sh.resources, at: sh.attacks });
      for (const m of txt.matchAll(/.{60}(NaN|undefined|\[object|Infinity).{20}/g)) out.push(`${r.id} ${f?.id}: ${m[0]}`);
    } catch (e) { out.push(`${r.id} ${f?.id}: THROW ${(e as Error).message}`); }
    if (r.id !== "race:human" && f) break;
  }
  for (const it of reg.list("item") as unknown as { id: string }[]) {
    const c = newCharacter({ id: "s", name: "S", race: "race:human", class: "class:wizard", abilities: { str: 12, dex: 14, con: 14, int: 12, wis: 14, cha: 14 } }, reg);
    c.classes = [{ class: "class:wizard", level: 10 }];
    c.inventory.push({ id: "i", item: it.id, quantity: 1, equipped: true, attuned: true });
    try {
      const sh = derive(c, reg);
      const txt = JSON.stringify({ a: sh.actions, r: sh.resources, at: sh.attacks, ac: sh.ac, sp: sh.spells });
      for (const m of txt.matchAll(/.{60}(NaN|undefined|\[object|Infinity).{20}/g)) out.push(`${it.id}: ${m[0]}`);
    } catch (e) { out.push(`${it.id}: THROW ${(e as Error).message}`); }
  }
  expect([...new Set(out)].slice(0, 20)).toEqual([]);
}, 120_000);
