import type { Character, ChoiceDef, ChoiceValues, EffectDef, Grant, Scaling } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";

/** Something active on the character that grants things: a race, a class feature, an item, a manual entry. */
export interface Source {
  /** Definition id, or "manual:<n>" for hand-entered grants. */
  id: string;
  label: string;
  grant: Grant;
  /** The player's choices for this definition. */
  choices: ChoiceValues;
  /** Level tables for "scale.<name>" values in this source's grant. */
  scaling?: Record<string, Scaling>;
  /** Set when the source is an item, so item-scoped modifiers stay on that item. */
  itemInstanceId?: string;
  /** Every character has it (the actions anyone can take). */
  common?: boolean;
  /** Set when the source is an active effect or condition. */
  effectInstanceId?: string;
  /** Slot level an effect was cast at ("slotLevel" in its expressions). */
  slotLevel?: number;
}

/** The modifiers an effect applies at a given level (levels are cumulative, like Exhaustion). */
export function effectModifiers(def: EffectDef, level = 1) {
  return [...def.modifiers, ...(def.levels ?? []).slice(0, level).flat()];
}

/** Walks the character and returns every active source, in sheet order. */
export function collectSources(c: Character, reg: ContentRegistry): Source[] {
  const out: Source[] = [];
  const choicesFor = (id: string): ChoiceValues => c.choices[id] ?? {};

  /** Activates the features the player picked for any "feature" choice on a definition. */
  const pushChosenFeatures = (defId: string, choiceDefs: ChoiceDef[] | undefined) => {
    for (const ch of choiceDefs ?? []) {
      if (ch.kind !== "feature") continue;
      for (const picked of choicesFor(defId)[ch.id] ?? []) pushFeature(picked);
    }
  };

  const pushFeature = (featureId: string): void => {
    const f = reg.get(featureId, "feature");
    const source: Source = { id: f.id, label: f.name, grant: f.grant ?? {}, choices: choicesFor(f.id) };
    if (f.scaling) source.scaling = f.scaling;
    out.push(source);
    pushChosenFeatures(f.id, f.choices);
  };

  const race = reg.get(c.race, "race");
  out.push({ id: race.id, label: race.name, grant: race.grant ?? {}, choices: choicesFor(race.id) });
  race.features.forEach(pushFeature);

  if (c.background) {
    const bg = reg.get(c.background, "background");
    out.push({ id: bg.id, label: bg.name, grant: bg.grant ?? {}, choices: choicesFor(bg.id) });
    bg.features.forEach(pushFeature);
  }

  c.classes.forEach((cl, index) => {
    const def = reg.get(cl.class, "class");
    const entryGrant = index === 0 ? def.startingGrant : def.multiclassGrant;
    const saves = index === 0 ? def.saves.map((a) => ({ kind: "save" as const, target: a })) : [];
    const grant: Grant = {
      ...entryGrant,
      proficiencies: [...saves, ...(entryGrant?.proficiencies ?? [])],
    };
    out.push({ id: def.id, label: def.name, grant, choices: choicesFor(def.id) });

    def.features.filter((f) => f.level <= cl.level).forEach((f) => pushFeature(f.feature));

    if (cl.subclass) {
      const sub = reg.get(cl.subclass, "subclass");
      sub.features.filter((f) => f.level <= cl.level).forEach((f) => pushFeature(f.feature));
    }
  });

  for (const feat of c.feats) {
    const def = reg.get(feat.feat, "feat");
    out.push({ id: def.id, label: def.name, grant: def.grant ?? {}, choices: choicesFor(def.id) });
    def.features.forEach(pushFeature);
    pushChosenFeatures(def.id, def.choices);
  }

  // What the table gave beyond the rules, each applied like any other source.
  for (const x of c.extras) {
    const label = `Extra (${x.tag})`;
    if (x.kind === "feat") {
      const def = reg.find(x.value, "feat");
      if (!def || out.some((s) => s.id === def.id)) continue;
      out.push({ id: def.id, label: def.name, grant: def.grant ?? {}, choices: choicesFor(def.id) });
      def.features.forEach(pushFeature);
      pushChosenFeatures(def.id, def.choices);
    } else if (x.kind === "spell") {
      const sp = reg.find(x.value, "spell");
      const list = x.list ?? `extra-${x.id}`;
      const grant: Grant = { spells: [{ spell: x.value, name: sp?.name ?? x.value, casting: `extra (${x.tag})`, list }] };
      if (!x.list) grant.spellcasting = { id: list, label: `${sp?.name ?? "Spell"} (${x.tag})`, ability: x.ability ?? "cha", progression: "none" };
      out.push({ id: `extra:${x.id}`, label, grant, choices: {} });
    } else {
      out.push({ id: `extra:${x.id}`, label, grant: { proficiencies: [{ kind: x.kind, target: x.value }] }, choices: {} });
    }
  }

  for (const inst of c.inventory) {
    const def = reg.get(inst.item, "item");
    if (!def.grant || !inst.equipped) continue;
    if (def.requiresAttunement && !inst.attuned) continue;
    out.push({
      id: def.id,
      label: inst.name ?? def.name,
      grant: def.grant,
      choices: choicesFor(def.id),
      itemInstanceId: inst.id,
    });
  }

  c.rules.forEach(pushFeature);
  for (const f of reg.list("feature")) if ((f as { common?: boolean }).common) out.push({ id: f.id, label: f.name, grant: (f as { grant?: Grant }).grant ?? {}, choices: {}, common: true });
  c.extraFeatures.forEach(pushFeature);

  // Active effects and conditions; a condition can include others (Paralyzed includes Incapacitated).
  const seenConditions = new Set<string>();
  const pushEffect = (def: EffectDef, instanceId: string, level: number | undefined, viaName?: string, inst?: Character["effects"][number]) => {
    if (seenConditions.has(def.id) && def.category === "condition") return;
    seenConditions.add(def.id);
    const label = def.levels ? `${def.name} ${level ?? 1}` : viaName ? `${def.name} (${viaName})` : def.name;
    // "{choice}" in selectors becomes what was picked (Hex: roll.check.{choice}); without a choice those modifiers wait.
    // "{choice}" in a value too: Bardic Inspiration adds "1{choice}" with the die picked.
    const modifiers = effectModifiers(def, level).flatMap((m) => {
      const v = (m as { value?: unknown }).value;
      const inValue = typeof v === "string" && v.includes("{choice}");
      if (!m.selector.includes("{choice}") && !inValue) return [m];
      if (!inst?.choice) return [];
      return [{ ...m, selector: m.selector.replace("{choice}", inst.choice), ...(inValue ? { value: (v as string).replace("{choice}", inst.choice) } : {}) } as typeof m];
    });
    const src: Source = { id: def.id, label, grant: { modifiers, ...(def.actions ? { actions: def.actions } : {}) }, choices: {}, effectInstanceId: instanceId };
    if (def.upcast) src.slotLevel = inst?.castLevel ?? def.upcast.baseLevel;
    out.push(src);
    for (const inc of def.includes) pushEffect(reg.get(inc, "effect"), instanceId, undefined, def.name);
  };
  for (const e of c.effects) {
    if (e.effect === "custom" && e.custom) {
      out.push({ id: `custom:${e.id}`, label: e.custom.name, grant: { modifiers: e.custom.modifiers }, choices: {}, effectInstanceId: e.id });
    } else {
      const def = reg.find(reg.effectId(e.effect), "effect");
      if (def) pushEffect(def, e.id, e.level, undefined, e);
    }
  }

  c.manualGrants.forEach((m, i) => {
    out.push({ id: `manual:${i}`, label: m.label, grant: m.grant, choices: {} });
  });

  return out;
}
