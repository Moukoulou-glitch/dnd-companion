import type { ActionDef, Modifier } from "@dnd/schema";

/**
 * Battle Master maneuvers (PHB, TCoE), in our own words: where each one
 * shows up. A maneuver on an attack is a tick-box on that roll; ticking it
 * spends a superiority die when the roll is made. "{dc}" is the maneuver
 * save DC.
 */
interface ManeuverDef {
  /** Added to the damage roll of a hit, with what happens. */
  damage?: string;
  /** On the attack roll (Precision Attack: the die; Feinting Attack: advantage). */
  attack?: "die" | "advantage";
  /** Added to these checks (Ambush: Stealth; Commanding Presence: Persuasion...). */
  checks?: string[];
  initiative?: boolean;
  /** An action of its own (Bait and Switch, Rally, Parry). */
  action?: { economy: ActionDef["economy"]; note: string; acUntilTurnStart?: boolean };
  /** A reaction attack: ticked already when you attack as a reaction for it. */
  reaction?: boolean;
}

export const MANEUVERS: Record<string, ManeuverDef> = {
  "Precision Attack": { attack: "die" },
  "Trip Attack": { damage: "Strength save DC {dc} or the target (Large or smaller) is knocked prone." },
  "Pushing Attack": { damage: "Strength save DC {dc} or the target (Large or smaller) is pushed up to 15 ft away." },
  "Menacing Attack": { damage: "Wisdom save DC {dc} or the target is frightened of you until the end of your next turn." },
  "Disarming Attack": { damage: "Strength save DC {dc} or the target drops one item it holds (it lands at its feet)." },
  "Goading Attack": { damage: "Wisdom save DC {dc} or the target has disadvantage on attacks against anyone but you until the end of your next turn." },
  "Distracting Strike": { damage: "The next attack against the target by someone other than you has advantage, before your next turn starts." },
  "Lunging Attack": { damage: "Your reach is 5 ft longer for this attack." },
  "Maneuvering Attack": { damage: "A friendly creature that can see or hear you may use its reaction to move half its speed without provoking opportunity attacks from the target." },
  "Sweeping Attack": { damage: "Instead of adding it here: another creature within 5 ft of you and of the target takes the die as damage, if your roll would hit it." },
  "Feinting Attack": { attack: "advantage", damage: "Bonus action first: advantage on your next attack against the creature this turn, and the die on that hit." },
  "Grappling Strike": { damage: "Right after the hit, a bonus action to grapple the target, adding the die to your Strength (Athletics) check." },
  "Quick Toss": { damage: "Bonus action: draw and throw a thrown weapon as an attack, adding the die to its damage." },
  "Riposte": { damage: "Reaction when a creature misses you with a melee attack: this attack, with the die.", reaction: true },
  "Brace": { damage: "Reaction when a creature you can see moves into your reach: this attack, with the die.", reaction: true },
  "Commander's Strike": { action: { economy: "free", note: "Give up one of your attacks and use a bonus action: a companion who can see or hear you makes one weapon attack with its reaction, adding the die to its damage." } },
  "Ambush": { checks: ["stealth"], initiative: true },
  "Commanding Presence": { checks: ["intimidation", "performance", "persuasion"] },
  "Tactical Assessment": { checks: ["investigation", "history", "insight"] },
  "Bait and Switch": {
    action: { economy: "free", note: "Spend at least 5 ft of movement to swap places with a willing creature within 5 ft (no opportunity attacks). You or it adds the die to AC until the start of your next turn.", acUntilTurnStart: true },
  },
  "Evasive Footwork": { action: { economy: "free", note: "When you move: add the die to your AC until you stop moving." } },
  Parry: { action: { economy: "reaction", note: "When a creature damages you with a melee attack: reduce the damage by the die + your Dexterity modifier." } },
  Rally: { action: { economy: "bonus", note: "A friendly creature that can see or hear you gains temporary hit points equal to the die + your Charisma modifier." } },
};

/** The modifiers and actions for the maneuvers someone knows, spending dice from `resource`. */
export function maneuverGrant(names: string[], die: string, resource: string, dc: number): { modifiers: Modifier[]; actions: ActionDef[] } {
  const modifiers: Modifier[] = [];
  const actions: ActionDef[] = [];
  const spends = { resource, amount: 1 };
  for (const name of names) {
    const m = MANEUVERS[name];
    if (!m) continue;
    const text = (s: string) => s.replace(/\{dc\}/g, String(dc));
    const base = { mode: "suggested" as const, label: name, spends, group: "maneuver" };
    if (m.attack === "die") modifiers.push({ selector: "roll.attack.weapon.*", op: "add", value: die, ...base, when: { text: "spend a superiority die; before or after you see the roll" } });
    if (m.attack === "advantage") modifiers.push({ selector: "roll.attack.weapon.*", op: "advantage", mode: "suggested", label: name, group: "maneuver", when: { text: "bonus action before the attack; the die is spent on the damage" } });
    if (m.damage) modifiers.push({ selector: "roll.damage.weapon.*", op: "add", value: die, ...base, when: { text: text(m.damage) }, ...(m.reaction ? { preset: "reaction" as const } : {}) });
    for (const sk of m.checks ?? []) modifiers.push({ selector: `roll.check.skill.${sk}`, op: "add", value: die, ...base, when: { text: "spend a superiority die" } });
    if (m.initiative) modifiers.push({ selector: "roll.initiative", op: "add", value: die, ...base, when: { text: "spend a superiority die" } });
    if (m.action)
      actions.push({
        id: `maneuver-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        name,
        economy: m.action.economy,
        toggles: [],
        cost: { resource, amount: 1 },
        roll: { dice: die, label: m.action.acUntilTurnStart ? "AC until the start of your next turn" : "superiority die" },
        note: text(m.action.note),
        ...(m.action.acUntilTurnStart ? { untilTurnStart: true } : {}),
      });
  }
  return { modifiers, actions };
}
