import { ChangesEditor, changesToModifiers, emptyChange, modifiersToChanges, type ChangeDraft } from "./ChangesEditor";
import { useState } from "react";
import type { ContentRegistry } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, type Ability, type Character, type CustomAction, type CustomItem, type CustomSpell, type OperationType } from "@dnd/schema";
import { NumberStep } from "./Adjust";
import { MarkdownHelp } from "./Markdown";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"] as const;
const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
const newId = () => crypto.randomUUID().slice(0, 8);

/** A labelled choice of a few options. */
function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={`segmented small${options.length > 2 ? " three" : ""}`} role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="story-field">
      <span className="row-title">{label}</span>
      {hint && <span className="row-sub">{hint}</span>}
      {children}
    </label>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <select className="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** How long it lasts: nothing, rounds, minutes or hours. */
function DurationPick({ value, onChange }: { value: CustomAction["duration"]; onChange: (d: CustomAction["duration"]) => void }) {
  const unit = !value ? "none" : value.rounds ? "rounds" : value.minutes && value.minutes % 60 === 0 ? "hours" : "minutes";
  const n = !value ? 1 : value.rounds ?? (unit === "hours" ? value.minutes! / 60 : value.minutes!);
  const set = (u: string, k: number) => onChange(u === "none" ? undefined : u === "rounds" ? { rounds: k } : { minutes: u === "hours" ? k * 60 : k });
  return (
    <>
      <Seg
        label="Duration"
        value={unit}
        onChange={(u) => set(u, n)}
        options={[
          ["none", "None"],
          ["rounds", "Rounds"],
          ["minutes", "Minutes"],
          ["hours", "Hours"],
        ]}
      />
      {unit !== "none" && (
        <div className="group">
          <NumberStep label={unit === "rounds" ? "Rounds (10 = 1 minute)" : unit === "hours" ? "Hours" : "Minutes"} value={n} min={1} max={unit === "rounds" ? 100 : 999} onChange={(k) => set(unit, k)} />
        </div>
      )}
    </>
  );
}

/**
 * An action of your own: an attack, something that forces a save (damage,
 * a condition), healing, or anything else, with its economy, source, target,
 * range, duration and uses. It shows up with your other actions.
 */
export function CustomActionForm({ c, reg, act, editing, done }: { c: Character; reg: ContentRegistry; act: Act; editing?: CustomAction; done: () => void }) {
  const [a, setA] = useState<CustomAction>(
    editing ?? { id: newId(), name: "", economy: "action", source: "", description: "", kind: "attack", concentration: false, attack: { mode: "melee", ability: "str", proficient: true, bonus: 0, damage: "1d6", addAbility: true, damageBonus: 0, damageType: "bludgeoning" } },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<CustomAction>) => setA({ ...a, ...p });
  const conditions = reg.list("effect").filter((e) => e.category === "condition");
  const atk = a.attack ?? { mode: "melee" as const, ability: "str" as const, proficient: true, bonus: 0, damage: "1d6", addAbility: true, damageBonus: 0, damageType: "bludgeoning" as const };
  const sv = a.save ?? { ability: "wis" as Ability, dc: "spell" as const, onSuccess: "none" as const };
  const save = () => {
    const out: CustomAction = { ...a, name: a.name.trim() };
    if (out.kind !== "attack") delete out.attack;
    else out.attack = atk;
    if (out.kind !== "save") delete out.save;
    else out.save = sv;
    if (out.kind !== "heal") delete out.heal;
    for (const k of ["target", "range"] as const) if (!out[k]?.trim()) delete out[k];
    act("setCustomAction", { action: JSON.parse(JSON.stringify(out)) }, `${out.name} saved.`);
    done();
  };
  return (
    <div className="custom-form">
      <Field label="Name">
        <input className="search" value={a.name} maxLength={80} placeholder="Horn Gore, Dread Howl…" onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
      </Field>
      <Field label="Takes">
        <Seg
          label="Takes"
          value={a.economy}
          onChange={(v) => set({ economy: v })}
          options={[
            ["action", "Action"],
            ["bonus", "Bonus"],
            ["reaction", "Reaction"],
            ["free", "No action"],
          ]}
        />
      </Field>
      <Field label="Source" hint="Where it comes from: an item, a boon, your DM">
        <input className="search" value={a.source} maxLength={80} onChange={(e) => set({ source: e.target.value })} aria-label="Source" />
      </Field>
      <Field label="What it does">
        <Seg
          label="Kind"
          value={a.kind}
          onChange={(v) => set({ kind: v })}
          options={[
            ["attack", "Attack roll"],
            ["save", "Saving throw"],
            ["heal", "Healing"],
            ["other", "Other"],
          ]}
        />
      </Field>

      {a.kind === "attack" && (
        <div className="group form-group">
          <Seg
            label="Melee or ranged"
            value={atk.mode}
            onChange={(v) => set({ attack: { ...atk, mode: v } })}
            options={[
              ["melee", "Melee"],
              ["ranged", "Ranged"],
            ]}
          />
          <div className="row">
            <div className="row-main row-title">Ability</div>
            <Select
              label="Ability"
              value={atk.ability}
              onChange={(v) => set({ attack: { ...atk, ability: v as typeof atk.ability } })}
              options={[...ABILITIES.map((x): [string, string] => [x, ABILITY_NAMES[x]]), ["spell", "Spellcasting ability"], ["none", "None"]]}
            />
          </div>
          <label className="row">
            <div className="row-main row-title">Proficient (adds your proficiency bonus)</div>
            <input type="checkbox" checked={atk.proficient} onChange={(e) => set({ attack: { ...atk, proficient: e.target.checked } })} />
          </label>
          <NumberStep label="Extra to hit" sub="A magic +1, a blessing" value={atk.bonus} min={-20} max={20} onChange={(n) => set({ attack: { ...atk, bonus: n } })} />
          <div className="row">
            <div className="row-main row-title">Damage dice</div>
            <input className="search" value={atk.damage} maxLength={40} onChange={(e) => set({ attack: { ...atk, damage: e.target.value.replace(/\s/g, "") } })} aria-label="Damage dice" />
          </div>
          <label className="row">
            <div className="row-main row-title">Add the ability modifier to damage</div>
            <input type="checkbox" checked={atk.addAbility} onChange={(e) => set({ attack: { ...atk, addAbility: e.target.checked } })} />
          </label>
          <NumberStep label="Extra damage" value={atk.damageBonus} min={-50} max={50} onChange={(n) => set({ attack: { ...atk, damageBonus: n } })} />
          <div className="row">
            <div className="row-main row-title">Damage type</div>
            <Select label="Damage type" value={atk.damageType} onChange={(v) => set({ attack: { ...atk, damageType: v as typeof atk.damageType } })} options={DAMAGE_TYPES.map((d): [string, string] => [d, d])} />
          </div>
        </div>
      )}

      {a.kind === "save" && (
        <div className="group form-group">
          <div className="row">
            <div className="row-main row-title">They save with</div>
            <Select label="Save ability" value={sv.ability} onChange={(v) => set({ save: { ...sv, ability: v as Ability } })} options={ABILITIES.map((x): [string, string] => [x, ABILITY_NAMES[x]])} />
          </div>
          <div className="row">
            <div className="row-main row-title">DC</div>
            <Select
              label="DC"
              value={typeof sv.dc === "number" ? "fixed" : sv.dc}
              onChange={(v) => set({ save: { ...sv, dc: v === "fixed" ? 13 : (v as "spell" | Ability) } })}
              options={[["spell", "Your spell save DC"], ...ABILITIES.map((x): [string, string] => [x, `8 + proficiency + ${ABILITY_NAMES[x]}`]), ["fixed", "A number"]]}
            />
          </div>
          {typeof sv.dc === "number" && <NumberStep label="DC" value={sv.dc} min={1} max={40} onChange={(n) => set({ save: { ...sv, dc: n } })} />}
          <div className="row">
            <div className="row-main row-title">Damage (optional)</div>
            <input className="search" value={sv.damage ?? ""} placeholder="2d6" maxLength={40} onChange={(e) => set({ save: { ...sv, ...(e.target.value ? { damage: e.target.value.replace(/\s/g, "") } : { damage: undefined as unknown as string }) } })} aria-label="Save damage" />
          </div>
          {sv.damage && (
            <>
              <div className="row">
                <div className="row-main row-title">Damage type</div>
                <Select label="Save damage type" value={sv.damageType ?? "force"} onChange={(v) => set({ save: { ...sv, damageType: v as NonNullable<typeof sv.damageType> } })} options={DAMAGE_TYPES.map((d): [string, string] => [d, d])} />
              </div>
              <Seg
                label="On a success"
                value={sv.onSuccess}
                onChange={(v) => set({ save: { ...sv, onSuccess: v } })}
                options={[
                  ["half", "Half damage"],
                  ["none", "No damage"],
                  ["other", "Something else"],
                ]}
              />
            </>
          )}
          <div className="row">
            <div className="row-main row-title">Condition on a failure</div>
            <Select label="Condition" value={sv.condition ?? ""} onChange={(v) => set({ save: { ...sv, ...(v ? { condition: v } : { condition: undefined as unknown as string }) } })} options={[["", "None"], ...conditions.map((x): [string, string] => [x.id, x.name])]} />
          </div>
        </div>
      )}

      {a.kind === "heal" && (
        <div className="group form-group">
          <div className="row">
            <div className="row-main row-title">How much</div>
            <input className="search" value={a.heal?.amount ?? ""} placeholder="1d8 + 3" maxLength={40} onChange={(e) => set({ heal: { amount: e.target.value, temp: a.heal?.temp ?? false } })} aria-label="Healing amount" />
          </div>
          <label className="row">
            <div className="row-main row-title">Temporary hit points instead</div>
            <input type="checkbox" checked={a.heal?.temp ?? false} onChange={(e) => set({ heal: { amount: a.heal?.amount ?? "", temp: e.target.checked } })} />
          </label>
          <p className="note">Dice and numbers, plus "pb", "level" or "mod.con" if you like (1d8 + mod.wis).</p>
        </div>
      )}

      <Field label="Target" hint="One creature you can see, a 15-ft cone, yourself…">
        <input className="search" value={a.target ?? ""} maxLength={80} onChange={(e) => set({ target: e.target.value })} aria-label="Target" />
      </Field>
      <Field label="Range">
        <input className="search" value={a.range ?? ""} maxLength={40} placeholder="Touch, 5 ft, 60 ft" onChange={(e) => set({ range: e.target.value })} aria-label="Range" />
      </Field>
      <Field label="How long it lasts">
        <DurationPick value={a.duration} onChange={(d) => setA(d ? { ...a, duration: d } : (({ duration: _, ...rest }) => rest)(a))} />
      </Field>
      {a.duration && (
        <label className="row">
          <div className="row-main row-title">Needs concentration</div>
          <input type="checkbox" checked={a.concentration} onChange={(e) => set({ concentration: e.target.checked })} />
        </label>
      )}
      <Field label="Uses">
        <Seg
          label="Uses"
          value={a.uses ? a.uses.reset : "free"}
          onChange={(v) => setA(v === "free" ? (({ uses: _, ...rest }) => rest)(a) : { ...a, uses: { max: a.uses?.max ?? 1, reset: v as "short" } })}
          options={[
            ["free", "Unlimited"],
            ["short", "Short rest"],
            ["long", "Long rest"],
            ["dawn", "Dawn"],
          ]}
        />
      </Field>
      {a.uses && (
        <div className="group">
          <NumberStep label="Times" value={a.uses.max} min={1} max={99} onChange={(n) => set({ uses: { ...a.uses!, max: n } })} />
        </div>
      )}
      <Field label="Notes" hint="Anything else: what it looks like, special rules">
        <textarea className="story-text" rows={4} value={a.description} onChange={(e) => set({ description: e.target.value })} aria-label="Notes" />
      </Field>
      <div className="big-actions">
        {editing &&
          (confirmDelete ? (
            <button
              className="big damage"
              onClick={() => {
                act("removeCustomAction", { id: a.id }, `${a.name} deleted.`);
                done();
              }}
            >
              Delete it
            </button>
          ) : (
            <button className="big" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button className="big primary" disabled={!a.name.trim() || (a.kind === "heal" && !a.heal?.amount.trim())} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

/** A spell of your own, on one of your spell lists: casting, attack or save, damage or healing and how it grows. */
export function CustomSpellForm({ c, act, lists, editing, done }: { c: Character; act: Act; lists: { id: string; label: string }[]; editing?: CustomSpell; done: () => void }) {
  const [sp, setSp] = useState<CustomSpell>(
    editing ?? { id: newId(), name: "", level: 1, school: "Evocation", castingTime: "1 action", range: "60 feet", components: ["V", "S"], duration: "Instantaneous", concentration: false, ritual: false, description: "", source: "" },
  );
  const current = editing ? c.spells.find((x) => x.spell === `spell:custom-${editing.id}`)?.list : undefined;
  const [list, setList] = useState(current ?? lists[0]?.id ?? "innate");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<CustomSpell>) => setSp({ ...sp, ...p });
  const [dmgType, setDmgType] = useState(editing?.damage?.type ?? "fire");
  // Its effect on whoever it's on: rows the sheet applies, and the player's own words for the rest.
  const [changes, setChanges] = useState<ChangeDraft[]>(() => (editing?.effect?.modifiers.length ? modifiersToChanges(editing.effect.modifiers) : []));
  const [effText, setEffText] = useState(editing?.effect?.text ?? "");
  const [untilRest, setUntilRest] = useState<"" | "short" | "long">(editing?.effect?.untilRest ?? "");
  const effect = sp.attack ? "attack" : sp.save ? "save" : sp.heal ? "heal" : "none";
  const setEffect = (e: string) => {
    const { attack: _a, save: _s, heal: _h, ...rest } = sp;
    if (e === "attack") setSp({ ...rest, attack: "ranged" });
    else if (e === "save") setSp({ ...rest, save: { ability: "dex", onSuccess: "half" } });
    else if (e === "heal") setSp({ ...rest, heal: { dice: "1d8", addMod: true } });
    else setSp(rest);
  };
  return (
    <div className="custom-form">
      <Field label="Name">
        <input className="search" value={sp.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} aria-label="Spell name" />
      </Field>
      <div className="group">
        <NumberStep label="Level" sub="0 is a cantrip" value={sp.level} min={0} max={9} onChange={(n) => set({ level: n })} />
        <div className="row">
          <div className="row-main row-title">School</div>
          <Select label="School" value={sp.school} onChange={(v) => set({ school: v })} options={SCHOOLS.map((x): [string, string] => [x, x])} />
        </div>
        <div className="row">
          <div className="row-main row-title">Cast with</div>
          <Select label="Spell list" value={list} onChange={setList} options={lists.length ? lists.map((l): [string, string] => [l.id, l.label]) : [["innate", "Innate"]]} />
        </div>
      </div>
      <Field label="Casting time">
        <input className="search" value={sp.castingTime} maxLength={60} onChange={(e) => set({ castingTime: e.target.value })} aria-label="Casting time" />
      </Field>
      <Field label="Range">
        <input className="search" value={sp.range} maxLength={60} onChange={(e) => set({ range: e.target.value })} aria-label="Spell range" />
      </Field>
      <Field label="Duration">
        <input className="search" value={sp.duration} maxLength={60} placeholder="Instantaneous, 1 minute, 1 hour" onChange={(e) => set({ duration: e.target.value })} aria-label="Spell duration" />
      </Field>
      <div className="group">
        <label className="row">
          <div className="row-main row-title">Concentration</div>
          <input type="checkbox" checked={sp.concentration} onChange={(e) => set({ concentration: e.target.checked })} />
        </label>
        <label className="row">
          <div className="row-main row-title">Ritual</div>
          <input type="checkbox" checked={sp.ritual} onChange={(e) => set({ ritual: e.target.checked })} />
        </label>
        <div className="row">
          <div className="row-main row-title">Components</div>
          {(["V", "S", "M"] as const).map((k) => (
            <label key={k} className="comp">
              <input type="checkbox" checked={sp.components.includes(k)} onChange={(e) => set({ components: e.target.checked ? [...sp.components, k] : sp.components.filter((x) => x !== k) })} /> {k}
            </label>
          ))}
        </div>
      </div>
      {sp.components.includes("M") && (
        <Field label="Material">
          <input className="search" value={sp.material ?? ""} maxLength={200} onChange={(e) => set({ material: e.target.value })} aria-label="Material" />
        </Field>
      )}
      <Field label="Area (optional)">
        <input className="search" value={sp.area ?? ""} maxLength={60} placeholder="20-foot-radius sphere" onChange={(e) => set(e.target.value ? { area: e.target.value } : { area: undefined as unknown as string })} aria-label="Area" />
      </Field>
      <Field label="It makes">
        <Seg
          label="Spell effect"
          value={effect}
          onChange={setEffect}
          options={[
            ["attack", "Spell attack"],
            ["save", "A save"],
            ["heal", "Healing"],
            ["none", "Neither"],
          ]}
        />
      </Field>
      {sp.attack && (
        <Seg
          label="Attack"
          value={sp.attack}
          onChange={(v) => set({ attack: v })}
          options={[
            ["melee", "Melee spell attack"],
            ["ranged", "Ranged spell attack"],
          ]}
        />
      )}
      {sp.save && (
        <div className="group form-group">
          <div className="row">
            <div className="row-main row-title">Save</div>
            <Select label="Spell save" value={sp.save.ability} onChange={(v) => set({ save: { ...sp.save!, ability: v as Ability } })} options={ABILITIES.map((x): [string, string] => [x, ABILITY_NAMES[x]])} />
          </div>
          <Seg
            label="On a success"
            value={sp.save.onSuccess}
            onChange={(v) => set({ save: { ...sp.save!, onSuccess: v } })}
            options={[
              ["half", "Half damage"],
              ["none", "Nothing"],
              ["other", "Something else"],
            ]}
          />
        </div>
      )}
      {!sp.heal && (
        <div className="group form-group">
          <div className="row">
            <div className="row-main row-title">Damage</div>
            <input className="search" value={sp.damage?.dice ?? ""} placeholder="3d6" maxLength={40} onChange={(e) => set(e.target.value ? { damage: { addMod: false, cantripScaling: sp.level === 0, type: dmgType, ...sp.damage, dice: e.target.value.replace(/\s/g, "") } } : { damage: undefined as unknown as CustomSpell["damage"] })} aria-label="Spell damage" />
          </div>
          <div className="row">
            <div className="row-main row-title">Damage type</div>
            <Select
              label="Spell damage type"
              value={sp.damage?.type ?? dmgType}
              onChange={(v) => {
                setDmgType(v);
                if (sp.damage) set({ damage: { ...sp.damage, type: v } });
              }}
              options={DAMAGE_TYPES.map((d): [string, string] => [d, d.replace(/^./, (x) => x.toUpperCase())])}
            />
          </div>
          {sp.damage && (
            <>
              <label className="row">
                <div className="row-main row-title">Add your spellcasting modifier</div>
                <input type="checkbox" checked={sp.damage.addMod} onChange={(e) => set({ damage: { ...sp.damage!, addMod: e.target.checked } })} />
              </label>
              {sp.level === 0 ? (
                <label className="row">
                  <div className="row-main row-title">Grows like a cantrip (5th, 11th, 17th level)</div>
                  <input type="checkbox" checked={sp.damage.cantripScaling} onChange={(e) => set({ damage: { ...sp.damage!, cantripScaling: e.target.checked } })} />
                </label>
              ) : (
                <div className="row">
                  <div className="row-main row-title">More for each slot level above {sp.level}</div>
                  <input className="search" value={sp.damage.perSlot ?? ""} placeholder="1d6" maxLength={20} onChange={(e) => set({ damage: { ...sp.damage!, ...(e.target.value ? { perSlot: e.target.value.replace(/\s/g, "") } : { perSlot: undefined as unknown as string }) } })} aria-label="Damage per slot" />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {sp.heal && (
        <div className="group form-group">
          <div className="row">
            <div className="row-main row-title">Healing dice</div>
            <input className="search" value={sp.heal.dice} maxLength={40} onChange={(e) => set({ heal: { ...sp.heal!, dice: e.target.value.replace(/\s/g, "") } })} aria-label="Healing dice" />
          </div>
          <label className="row">
            <div className="row-main row-title">Add your spellcasting modifier</div>
            <input type="checkbox" checked={sp.heal.addMod} onChange={(e) => set({ heal: { ...sp.heal!, addMod: e.target.checked } })} />
          </label>
          <div className="row">
            <div className="row-main row-title">More for each slot level above {Math.max(1, sp.level)}</div>
            <input className="search" value={sp.heal.perSlot ?? ""} placeholder="1d8" maxLength={20} onChange={(e) => set({ heal: { ...sp.heal!, ...(e.target.value ? { perSlot: e.target.value.replace(/\s/g, "") } : { perSlot: undefined as unknown as string }) } })} aria-label="Healing per slot" />
          </div>
        </div>
      )}
      <section className="form-group">
        <h2 className="sub-head">Its effect on a creature (optional)</h2>
        <p className="note">
          What the sheet applies while the spell is on someone: AC, advantage or disadvantage, bonuses or penalties. Cast on yourself (“Put its effect on me”), it becomes a tag on you for the spell's duration{sp.concentration ? ", ended with your concentration" : ""}.
        </p>
        {changes.length > 0 ? <ChangesEditor value={changes} onChange={setChanges} /> : (
          <button className="link" onClick={() => setChanges([emptyChange()])}>
            + Add a change the sheet applies
          </button>
        )}
        <Field label="Reminder in your words (shown, not applied)">
          <textarea className="story-text" rows={2} value={effText} maxLength={2000} onChange={(e) => setEffText(e.target.value)} aria-label="Effect reminder" placeholder="e.g. The target can't take reactions" />
        </Field>
        <div className="segmented small" role="radiogroup" aria-label="Ends at a rest">
          {([["", "Spell's duration"], ["short", "Until a short rest"], ["long", "Until a long rest"]] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={untilRest === k} onClick={() => setUntilRest(k)}>
              {l}
            </button>
          ))}
        </div>
      </section>
      <Field label="What it does">
        <textarea className="story-text" rows={6} value={sp.description} onChange={(e) => set({ description: e.target.value })} aria-label="Spell description" />
      </Field>
      <Field label="At higher levels (optional)">
        <textarea className="story-text" rows={2} value={sp.higherLevels ?? ""} onChange={(e) => set(e.target.value ? { higherLevels: e.target.value } : { higherLevels: undefined as unknown as string })} aria-label="At higher levels" />
      </Field>
      <Field label="Source">
        <input className="search" value={sp.source} maxLength={80} placeholder="Your DM, a spellbook you found" onChange={(e) => set({ source: e.target.value })} aria-label="Spell source" />
      </Field>
      <div className="big-actions">
        {editing &&
          (confirmDelete ? (
            <button
              className="big damage"
              onClick={() => {
                act("removeCustomSpell", { id: sp.id }, `${sp.name} deleted.`);
                done();
              }}
            >
              Delete it
            </button>
          ) : (
            <button className="big" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button
          className="big primary"
          disabled={!sp.name.trim()}
          onClick={() => {
            const mods = changesToModifiers(changes, sp.name.trim());
            const effect = mods.length || effText.trim() ? { modifiers: mods, ...(effText.trim() ? { text: effText.trim() } : {}), ...(untilRest ? { untilRest } : {}) } : undefined;
            const { effect: _old, ...rest } = sp;
            const clean = JSON.parse(JSON.stringify({ ...rest, name: sp.name.trim(), ...(effect ? { effect } : {}) })) as CustomSpell;
            act("setCustomSpell", { spell: clean, list }, `${clean.name} saved.`);
            done();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export const ITEM_TYPES: [CustomItem["category"], string][] = [
  ["gear", "Gear"],
  ["tool", "Tool"],
  ["consumable", "Consumable"],
  ["wondrous", "Wondrous item"],
  ["focus", "Spellcasting focus"],
];

/**
 * An item of your own: what it is and what it says (only shown), and, if you
 * want, changes the sheet applies while it's equipped (and attuned, if it needs
 * attunement), like a magic item's. Without changes it changes nothing.
 */
export function CustomItemForm({ act, editing, done }: { act: Act; editing?: CustomItem; done: (deleted?: boolean) => void }) {
  const [it, setIt] = useState<CustomItem>(editing ?? { id: newId(), name: "", category: "gear", description: "", requiresAttunement: false, modifiers: [], source: "" });
  const set = (p: Partial<CustomItem>) => setIt({ ...it, ...p });
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState(editing?.weight !== undefined ? String(editing.weight) : "");
  const [value, setValue] = useState(editing?.value ? String(editing.value.amount) : "");
  const [unit, setUnit] = useState<NonNullable<CustomItem["value"]>["unit"]>(editing?.value?.unit ?? "gp");
  const [changes, setChanges] = useState<ChangeDraft[]>(() => (editing?.modifiers.length ? modifiersToChanges(editing.modifiers) : []));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const num = (x: string) => (x.trim() === "" ? undefined : Number(x.replace(",", ".")));
  const w = num(weight);
  const v = num(value);
  const bad = (x: number | undefined) => x !== undefined && (!Number.isFinite(x) || x < 0);
  return (
    <div className="custom-form">
      <Field label="Name">
        <input className="search" value={it.name} maxLength={80} placeholder="Grandmother's locket" onChange={(e) => set({ name: e.target.value })} aria-label="Item name" />
      </Field>
      <Field label="Type">
        <Select label="Item type" value={it.category} onChange={(x) => set({ category: x as CustomItem["category"] })} options={ITEM_TYPES} />
      </Field>
      <div className="group">
        {!editing && <NumberStep label="How many" value={quantity} min={1} max={9999} onChange={setQuantity} />}
        <div className="row">
          <div className="row-main row-title">Weight (lb.)</div>
          <input className="search narrow" inputMode="decimal" value={weight} placeholder="—" onChange={(e) => setWeight(e.target.value)} aria-label="Weight in pounds" />
        </div>
        <div className="row">
          <div className="row-main row-title">Value</div>
          <input className="search narrow" inputMode="decimal" value={value} placeholder="—" onChange={(e) => setValue(e.target.value)} aria-label="Value" />
          <Select label="Coin" value={unit} onChange={(x) => setUnit(x as typeof unit)} options={(["cp", "sp", "ep", "gp", "pp"] as const).map((x): [string, string] => [x, x])} />
        </div>
        <label className="row">
          <div className="row-main">
            <div className="row-title">Needs attunement</div>
            <div className="row-sub">Its changes then apply only while attuned too</div>
          </div>
          <input type="checkbox" checked={it.requiresAttunement} onChange={(e) => set({ requiresAttunement: e.target.checked })} />
        </label>
      </div>
      {(bad(w) || bad(v)) && <p className="note danger-text">Weight and value are numbers, 0 or more.</p>}
      <Field label="Description (shown, not applied)" hint="What it looks like, what it does, where it came from">
        <textarea className="story-text" rows={6} value={it.description} maxLength={6000} onChange={(e) => set({ description: e.target.value })} aria-label="Item description" />
      </Field>
      <MarkdownHelp />
      <section className="form-group">
        <h2 className="sub-head">What the sheet applies (optional)</h2>
        <p className="note">
          Only these change your numbers, and only while the item is equipped{it.requiresAttunement ? " and you're attuned to it" : ""}. Anything else it does, write in the description: the app shows it but doesn't apply it.
        </p>
        {changes.length > 0 ? (
          <ChangesEditor value={changes} onChange={setChanges} />
        ) : (
          <button className="link" onClick={() => setChanges([emptyChange()])}>
            + Add a change the sheet applies
          </button>
        )}
      </section>
      <Field label="Source">
        <input className="search" value={it.source} maxLength={80} placeholder="Found in the crypt, a gift from your DM" onChange={(e) => set({ source: e.target.value })} aria-label="Item source" />
      </Field>
      <div className="big-actions">
        {editing &&
          (confirmDelete ? (
            <button
              className="big damage"
              onClick={() => {
                act("removeCustomItem", { id: it.id }, `${it.name} deleted.`);
                done(true);
              }}
            >
              Delete it
            </button>
          ) : (
            <button className="big" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button
          className="big primary"
          disabled={!it.name.trim() || bad(w) || bad(v)}
          onClick={() => {
            const { weight: _w, value: _v, ...rest } = it;
            const item: CustomItem = {
              ...rest,
              name: it.name.trim(),
              description: it.description.trim(),
              source: it.source.trim(),
              modifiers: changesToModifiers(changes, it.name.trim()),
              ...(w !== undefined ? { weight: w } : {}),
              ...(v !== undefined ? { value: { amount: v, unit } } : {}),
            };
            act("setCustomItem", editing ? { item } : { item, instanceId: crypto.randomUUID(), quantity }, editing ? `${item.name} changed.` : `${item.name} added.`);
            done();
          }}
        >
          {editing ? "Save" : "Add it"}
        </button>
      </div>
      {editing && confirmDelete && <p className="note">Deleting it takes every one of it out of your inventory.</p>}
    </div>
  );
}
