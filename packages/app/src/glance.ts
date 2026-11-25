import { SKILLS, SKILL_NAMES, type Skill } from "@dnd/schema";
import type { DerivedSheet } from "@dnd/engine";
import type { RollRecord } from "./rolls";

/** The skills rolled most (by the rolls' titles), topped up with your best ones. */
export function topSkills(sheet: Pick<DerivedSheet, "skills">, rolls: Pick<RollRecord, "title">[], n = 3): Skill[] {
  const count = new Map<Skill, number>();
  for (const r of rolls) {
    for (const sk of SKILLS) {
      const name = SKILL_NAMES[sk];
      if (r.title === name || r.title.startsWith(`${name} (`)) count.set(sk, (count.get(sk) ?? 0) + 1);
    }
  }
  const rolled = [...count.entries()].sort((a, b) => b[1] - a[1] || sheet.skills[b[0]].total - sheet.skills[a[0]].total).map(([sk]) => sk);
  const best = [...SKILLS].sort((a, b) => sheet.skills[b].total - sheet.skills[a].total);
  return [...new Set([...rolled, ...best])].slice(0, n);
}

