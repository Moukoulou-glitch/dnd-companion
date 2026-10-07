/**
 * The SRD dataset has no structured damage or save for some spells (Flaming
 * Sphere, Moonbeam, Spirit Guardians...). This reads them from the spell's
 * own SRD text with the same reader used for book files, and only fills in
 * what's missing. Run: npx vite-node scripts/enrich-srd-spells.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spellMechanics } from "../packages/engine/src/books/spells.js";

const path = "content/packs/srd-5.1/spells.json";
const pack = JSON.parse(readFileSync(path, "utf8"));
const filled: string[] = [];
for (const s of pack.definitions) {
  const m = spellMechanics(s.level, s.text.map((t: string) => t.replace(/1dl0/g, "1d10")), s.higherLevels.map((t: string) => t.replace(/1dl0/g, "1d10")));
  const added: string[] = [];
  if (!s.damage && m.damage) (s.damage = m.damage), added.push("damage");
  if (!s.heal && m.heal) (s.heal = m.heal), added.push("healing");
  if (!s.save && !s.attack && m.save) (s.save = m.save), added.push("save");
  if (!s.attack && !s.save && m.attack) (s.attack = m.attack), added.push("attack");
  if (added.length) filled.push(`${s.name}: ${added.join(", ")}`);
}
writeFileSync(path, JSON.stringify(pack, null, 2) + "\n");
console.log(filled.length, "spells filled in\n" + filled.join("\n"));
