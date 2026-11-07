import type { Character } from "@dnd/schema";

/**
 * The table's homebrew items that show a small living emblem on Play while they're yours: attuned (or worn, for one
 * that needs no attunement), or, for the Tome of Wound Forbidding, once you've absorbed its magic.
 */
export type RelicMotif =
  | "tome"
  | "vineyard"
  | "scribing"
  | "winds"
  | "werewolf"
  | "pinecone"
  | "lasthope"
  | "feathertide"
  | "nightclaw"
  | "cychron"
  | "essence"
  | "tinker"
  | "pearl"
  | "unlocking";

export const RELICS: Record<string, { name: string; motif: RelicMotif; attune: boolean; whileOn?: string }> = {
  "item:tattoo-of-vineyard-blessing": { name: "Tattoo of Vineyard Blessing", motif: "vineyard", attune: true, whileOn: "vineyard-grape" },
  "item:tattoo-of-illusionary-scribing": { name: "Tattoo of Illusionary Scribing", motif: "scribing", attune: true },
  "item:tattoo-of-guardian-winds": { name: "Tattoo of Guardian Winds", motif: "winds", attune: true, whileOn: "guardian-winds" },
  "item:tattoo-of-werewolfs-bane": { name: "Tattoo of Werewolf's Bane", motif: "werewolf", attune: true },
  "item:ring-of-the-great-pine-cone": { name: "Ring of the Great Pine Cone", motif: "pinecone", attune: true, whileOn: "in-forest" },
  "item:tattoo-of-last-hope": { name: "Tattoo of Last Hope", motif: "lasthope", attune: true },
  "item:feathertide": { name: "Feathertide", motif: "feathertide", attune: true },
  "item:cloak-of-nightclaw": { name: "Cloak of Nightclaw", motif: "nightclaw", attune: true },
  "item:cloak-of-cychron": { name: "Cloak of Cychron", motif: "cychron", attune: true },
  "item:tattoo-of-empowered-essence": { name: "Tattoo of Empowered Essence", motif: "essence", attune: true },
  "item:staff-of-the-tinker": { name: "Staff of the Tinker", motif: "tinker", attune: true },
  "item:pearl-of-regeneration": { name: "Pearl of Regeneration", motif: "pearl", attune: true, whileOn: "pearl-orbiting" },
  "item:tattoo-of-unlocking": { name: "Tattoo of Unlocking", motif: "unlocking", attune: true },
};

export const TOME_EFFECT = "effect:tome-of-wound-forbidding";

export interface RelicShown {
  key: string;
  name: string;
  motif: RelicMotif;
  /** Its power is on now (the grape's temporary HP, the winds, in a forest, the pearl orbiting): it glows brighter. */
  active: boolean;
  /** The inventory item to open, or the effect (the tome's lore). */
  instanceId?: string;
  effectId?: string;
}

/** The emblems to show now, in inventory order; the tome's lore first. */
export function relicsOf(c: Character | undefined): RelicShown[] {
  if (!c) return [];
  const out: RelicShown[] = [];
  const tome = c.effects.find((e) => e.effect === TOME_EFFECT);
  if (tome) out.push({ key: `tome-${tome.id}`, name: "Tome of Wound Forbidding (its lore is yours)", motif: "tome", active: true, effectId: tome.id });
  for (const i of c.inventory) {
    const r = RELICS[i.item];
    if (!r || !i.equipped || (r.attune && !i.attuned)) continue;
    out.push({ key: i.id, name: i.name ?? r.name, motif: r.motif, active: !!r.whileOn && c.toggles.includes(r.whileOn), instanceId: i.id });
  }
  return out;
}
