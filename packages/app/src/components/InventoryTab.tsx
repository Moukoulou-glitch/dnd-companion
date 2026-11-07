import { NumberStep } from "./Adjust";
import { RichText, TextBlocks } from "./Conditions";
import { useEffect, useMemo, useState } from "react";
import { rollOrThrow } from "../dice/quick";
import { isCustomItemId, type ContentRegistry, type DerivedSheet } from "@dnd/engine";
import type { Character, CustomItem, ItemDef, OperationType } from "@dnd/schema";
import { describeChanges } from "./ChangesEditor";
import { ITEM_TYPES } from "./CustomForms";
import { Markdown } from "./Markdown";
import { Sections } from "./Sections";

type Act = (type: OperationType, payload: unknown, label: string) => void;
type Inst = Character["inventory"][number];

const COINS = [
  ["pp", "Platinum"],
  ["gp", "Gold"],
  ["ep", "Electrum"],
  ["sp", "Silver"],
  ["cp", "Copper"],
] as const;

function displayName(inst: Inst, def: ItemDef) {
  return inst.name ?? def.name;
}

/** An item whose definition can't be found (it shouldn't happen): a plain stand-in, so the page still opens. */
const lost = (id: string): ItemDef => ({ kind: "item", id, name: id.replace(/^item:/, ""), category: "gear", requiresAttunement: false, source: { pack: "missing" } }) as ItemDef;
export const itemDef = (reg: ContentRegistry, id: string): ItemDef => reg.find(id, "item") ?? lost(id);

type ItemFilter = "all" | "equipped" | "carried" | "attuned" | "magic";
const ITEM_FILTERS: [ItemFilter, string][] = [
  ["all", "All"],
  ["equipped", "Equipped"],
  ["carried", "Carried"],
  ["attuned", "Attuned"],
  ["magic", "Magic"],
];

/** The Items page's sections, in this order: each item goes in the first that takes it. */
/** A magic item: it has a rarity or a magic bonus, needs attunement, or is a wondrous item or ring. */
const isMagic = (d: ItemDef) => !!d.magic || d.requiresAttunement || d.category === "wondrous";
const ITEM_GROUPS: { key: string; label: string; of: (d: ItemDef) => boolean }[] = [
  { key: "magic-weapons", label: "Magic weapons", of: (d) => d.category === "weapon" && isMagic(d) },
  { key: "magic-armor", label: "Magic armor and shields", of: (d) => (d.category === "armor" || d.category === "shield") && isMagic(d) },
  { key: "magic", label: "Magic items", of: (d) => isMagic(d) && d.category !== "consumable" && d.category !== "ammunition" },
  { key: "consumables", label: "Potions and scrolls", of: (d) => d.category === "consumable" },
  { key: "weapons", label: "Weapons", of: (d) => d.category === "weapon" },
  { key: "armor", label: "Armor and shields", of: (d) => d.category === "armor" || d.category === "shield" },
  { key: "ammo", label: "Ammunition", of: (d) => d.category === "ammunition" },
  { key: "focus", label: "Spellcasting focuses", of: (d) => d.category === "focus" },
  { key: "tools", label: "Tools and instruments", of: (d) => d.category === "tool" },
  { key: "gear", label: "Gear", of: () => true },
];

function itemTags(inst: Inst, def: ItemDef): string[] {
  const tags: string[] = [];
  if (isCustomItemId(def.id)) tags.push("your own");
  if (def.requiresAttunement) tags.push(inst.attuned ? "attuned" : "needs attunement");
  if (def.magic?.rarity) tags.push(def.magic.rarity);
  return tags;
}

/** A spell scroll (DMG p. 200), by its id or name. */
export const isScroll = (def: ItemDef) => def.id.startsWith("item:spell-scroll") || /spell scroll/i.test(def.name);
/** An object holding a spell a Rock Gnome stored in it (Thinking Stone). */
export const isStoredObject = (def: ItemDef) => def.id === "item:thinking-stone-object";

/** The level a scroll is written at, from its name ("Spell Scroll (3rd Level)"); undefined when it doesn't say. */
const scrollLevel = (def: ItemDef) => {
  const m = /(\d)(?:st|nd|rd|th)[- ]level/i.exec(def.name);
  return m ? Number(m[1]) : /cantrip/i.test(def.name) ? 0 : undefined;
};

/** Which spell is written on a scroll: pick one of the app's spells or your own, then read it from here. */
function ScrollSpell({ inst, def, act, spells, onRead, onCopy, onCustom }: { inst: Inst; def: ItemDef; act: Act; spells: { id: string; name: string; level: number }[]; onRead?: () => void; onCopy?: () => void; onCustom: () => void }) {
  const [picking, setPicking] = useState(!inst.scroll);
  const [q, setQ] = useState("");
  const stored = isStoredObject(def);
  // A Thinking Stone holds 1st- and 2nd-level spells.
  const lvl = stored ? 2 : scrollLevel(def);
  const written = inst.scroll ? spells.find((x) => x.id === inst.scroll!.spell) : undefined;
  // A scroll's level: its spell can't be of a higher level (a lower one is written upcast).
  const found = spells
    .filter((x) => (lvl === undefined || x.level <= lvl) && x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, 30);
  return (
    <section>
      <h2 className="sub-head">The spell on it</h2>
      {inst.scroll && !picking && (
        <div className="group">
          <div className="row">
            <div className="row-main">
              <div className="row-title">{written?.name ?? inst.scroll.spell}</div>
              <div className="row-sub">
                {written ? (written.level === 0 ? "Cantrip" : `Level ${written.level} spell`) : "Spell not found"}
                {!stored && lvl !== undefined && written && lvl > written.level ? `, written at level ${lvl}` : ""}
                {inst.scroll.dc !== undefined ? ` · DC ${inst.scroll.dc}, ${(inst.scroll.attack ?? inst.scroll.dc - 8) >= 0 ? "+" : ""}${inst.scroll.attack ?? inst.scroll.dc - 8} to hit` : ""}
                {inst.scroll.by ? ` · by ${inst.scroll.by}` : ""}
              </div>
            </div>
            <button className="link" onClick={() => setPicking(true)}>
              Change
            </button>
          </div>
        </div>
      )}
      {inst.scroll && !picking && <MakerNumbers inst={inst} act={act} stored={stored} />}
      {inst.scroll && !picking && onRead && (
        <button className="big primary wide" style={{ marginTop: 10 }} onClick={onRead}>
          {stored ? "Use the object" : "Read the scroll"}
        </button>
      )}
      {inst.scroll && !picking && onCopy && (
        <>
          <button className="big wide" style={{ marginTop: 8 }} onClick={onCopy}>
            Copy into your spellbook
          </button>
          <p className="note">Intelligence (Arcana) check, DC 10 + the spell's level; 2 hours and 50 gp per level. The scroll is destroyed either way.</p>
        </>
      )}
      {picking && (
        <>
          <input className="search" type="search" placeholder={`Search spells${lvl !== undefined ? ` (level ${lvl} or lower)` : ""}`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="group">
            {found.map((x) => (
              <button
                key={x.id}
                className="row"
                onClick={() => {
                  const keep = inst.scroll && inst.scroll.dc !== undefined ? { dc: inst.scroll.dc, ...(inst.scroll.attack !== undefined ? { attack: inst.scroll.attack } : {}), ...(inst.scroll.by ? { by: inst.scroll.by } : {}) } : {};
                  act("setItem", { instanceId: inst.id, scroll: { spell: x.id, ...(stored ? { level: x.level, stored: true } : {}), ...(stored && inst.scroll?.dc === undefined ? { dc: 12, attack: 4 } : {}), ...keep }, ...(stored ? { name: `Thinking Stone: ${x.name}` } : {}) }, `${displayName(inst, def)}: ${x.name}.`);
                  setPicking(false);
                }}
              >
                <div className="row-main">
                  <div className="row-title">{x.name}</div>
                  <div className="row-sub">{x.level === 0 ? "Cantrip" : `Level ${x.level}`}</div>
                </div>
              </button>
            ))}
          </div>
          {!stored && (
            <>
              <button className="big wide" style={{ marginTop: 10 }} onClick={onCustom}>
                Write your own spell
              </button>
              <p className="note">Your own spell joins your spells too; once saved, pick it here.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The parts picked on this copy (Necklace of Prayer Beads: its beads), each kind with how many. */
function PicksBox({ inst, def, act, uses = {} }: { inst: Inst; def: ItemDef; act: Act; uses?: Record<string, { used: number; max: number }> }) {
  const pk = def.picks!;
  const live = inst.equipped && (!def.requiresAttunement || inst.attuned);
  const picks = inst.picks ?? [];
  const count = (id: string) => picks.filter((x) => x === id).length;
  const set = (next: string[], label: string) => act("setItem", { instanceId: inst.id, picks: next.length ? next : null }, label);
  const name = displayName(inst, def);
  return (
    <section className="picks-box">
      <h2 className="sub-head">
        {pk.label}: {picks.length}
        {pk.max ? ` of up to ${pk.max}` : ""}
      </h2>
      {pk.note && <p className="note">{pk.note}</p>}
      <div className="group">
        {pk.options.map((o) => {
          const n = count(o.id);
          // Each bead of this kind: used until the next dawn, or ready (its resource counts them).
          const rid = o.grant.resources?.[0]?.id;
          const u = rid ? uses[rid] : undefined;
          const spent = Math.min(n, u?.used ?? 0);
          return (
            <div className={`row${n ? "" : " dim"}`} key={o.id}>
              <div className="row-main">
                <div className="row-title">{o.name}</div>
                {o.summary && <div className="row-sub">{o.summary}</div>}
                {n > 0 && rid && live && (
                  <div className="bead-pips" role="group" aria-label={`${o.name}: ${n - spent} of ${n} ready`}>
                    {Array.from({ length: n }, (_, i) => {
                      const used = i < spent;
                      return (
                        <button
                          key={i}
                          className={`bead-pip${used ? " used" : ""}`}
                          aria-pressed={used}
                          aria-label={used ? `${o.name} ${i + 1}: used, tap to get it back` : `${o.name} ${i + 1}: ready, tap to mark it used`}
                          onClick={() =>
                            used
                              ? act("restoreResource", { resource: rid, amount: 1 }, `${o.name}: one ready again.`)
                              : act("spendResource", { resource: rid, amount: 1 }, `${o.name}: one used until the next dawn.`)
                          }
                        />
                      );
                    })}
                    <span className="bead-pips-label">{spent ? `${spent} of ${n} used until dawn` : n > 1 ? "all ready" : "ready"}</span>
                  </div>
                )}
              </div>
              <div className="stepper">
                <button aria-label={`One ${o.name} fewer`} disabled={!n} onClick={() => set(picks.filter((x, i) => !(x === o.id && i === picks.lastIndexOf(o.id))), `${name}: one ${o.name} fewer.`)}>
                  −
                </button>
                <span>{n}</span>
                <button aria-label={`One ${o.name} more`} onClick={() => set([...picks, o.id], `${name}: ${o.name} added.`)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {pk.max && picks.length > pk.max && <p className="warn">More than {pk.max}: kept, beyond the rules.</p>}
      <p className="note">{inst.equipped && (!def.requiresAttunement || inst.attuned) ? "Their spells are on your Spells page, each once until the next dawn." : `Their spells show on your Spells page while you wear it${def.requiresAttunement ? " and are attuned" : ""}.`}</p>
    </section>
  );
}

/** The spells an item holds (Ring of Spell Storing): add one cast into it, with its slot level and its caster's numbers. */
function StoredSpellsBox({ inst, def, act, spells, mine, holderPresent = true }: { inst: Inst; def: ItemDef; act: Act; spells: { id: string; name: string; level: number }[]; mine?: { dc: number; attack: number; name: string }; holderPresent?: boolean }) {
  const ss = def.storesSpells!;
  const max = ss.maxLevels;
  const top = ss.maxSpellLevel ?? max;
  const one = ss.count === 1;
  const who = ss.castBy ?? displayName(inst, def);
  const [spend, setSpend] = useState(true);
  const held = inst.storedSpells ?? [];
  const used = held.reduce((n, x) => n + x.level, 0);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<{ id: string; name: string; level: number } | null>(null);
  const [level, setLevel] = useState(1);
  const [dc, setDc] = useState(String(mine?.dc ?? 13));
  const [atk, setAtk] = useState(String(mine?.attack ?? 5));
  const [by, setBy] = useState(mine?.name ?? "");
  const name = displayName(inst, def);
  const nameOf = (id: string) => spells.find((x) => x.id === id)?.name ?? id;
  const save = (next: typeof held, label: string) => act("setItem", { instanceId: inst.id, storedSpells: next.length ? next : null }, label);
  const found = spells
    .filter((x) => x.level >= 1 && x.level <= Math.min(max, top) && x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .slice(0, 30);
  return (
    <section className="stored-box">
      <h2 className="sub-head">{one ? `Spell Storing: ${held.length ? "one spell stored" : "nothing stored"}` : `Spells it holds: ${used} of ${max} levels`}</h2>
      {one && <p className="note">One spell of level {top} or lower, cast on {who.toLowerCase().startsWith("shield") ? "the guardian" : who}: it has no effect then and is stored. {who} casts it later on your command, with your numbers and no components. Storing another loses the one stored.</p>}
      {!holderPresent && <p className="warn">{who} isn't one of your companions: add it (Play → Companions → your own, started from the {who}) for its stored spell to be castable.</p>}
      {held.length > 0 && (
        <div className="group">
          {held.map((x) => (
            <div className="row" key={x.id}>
              <div className="row-main">
                <div className="row-title">{nameOf(x.spell)}</div>
                <div className="row-sub">
                  Level {x.level}
                  {x.dc !== undefined ? ` · DC ${x.dc}, ${(x.attack ?? x.dc - 8) >= 0 ? "+" : ""}${x.attack ?? x.dc - 8} to hit` : ""}
                  {x.by ? ` · by ${x.by}` : ""}
                </div>
              </div>
              <button className="link" onClick={() => save(held.filter((y) => y.id !== x.id), `${name}: ${nameOf(x.spell)} taken out.`)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {used > max && <p className="warn">More than {max} levels: kept, beyond the rules.</p>}
      {!adding ? (
        <button className="big wide" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
          {one ? `Store a spell in the ${who.toLowerCase().startsWith("shield") ? "guardian" : "item"}` : "Store a spell in it"}
          <span className="sub">{one ? (held.length ? "replaces the one stored" : `level ${top} or lower`) : `${Math.max(0, max - used)} levels free`}</span>
        </button>
      ) : !pick ? (
        <>
          <input className="search" type="search" placeholder={`Search spells (level 1 to ${max})`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="group">
            {found.map((x) => (
              <button
                key={x.id}
                className="row"
                onClick={() => {
                  setPick(x);
                  setLevel(x.level);
                }}
              >
                <div className="row-main">
                  <div className="row-title">{x.name}</div>
                  <div className="row-sub">Level {x.level}</div>
                </div>
              </button>
            ))}
          </div>
          <button className="link" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <p className="note">
            {pick.name}: the slot level it was cast with, and its caster's spell save DC and attack bonus (yours to start with).
          </p>
          <div className="group">
            <div className="row">
              <div className="row-main row-title">Slot level</div>
              <div className="stepper">
                <button aria-label="Lower" onClick={() => setLevel(Math.max(pick.level, level - 1))}>−</button>
                <span>{level}</span>
                <button aria-label="Higher" onClick={() => setLevel(Math.min(one ? top : 9, level + 1))}>+</button>
              </div>
            </div>
            <label className="row">
              <div className="row-main row-title">Spell save DC</div>
              <input className="init-input" inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Spell save DC" />
            </label>
            <label className="row">
              <div className="row-main row-title">Spell attack bonus</div>
              <input className="init-input" inputMode="numeric" value={atk} onChange={(e) => setAtk(e.target.value.replace(/[^0-9-]/g, ""))} aria-label="Spell attack bonus" />
            </label>
            <label className="row">
              <div className="row-main row-title">Cast into it by</div>
              <input value={by} maxLength={80} onChange={(e) => setBy(e.target.value)} aria-label="Who cast it into the item" />
            </label>
          </div>
          <label className="row check" style={{ padding: "8px 0" }}>
            <input type="checkbox" checked={spend} onChange={() => setSpend(!spend)} />
            <div className="row-main">
              <div className="row-title">I cast it into it: spend my level {level} slot</div>
              <div className="row-sub">Leave it off when someone else cast it.</div>
            </div>
          </label>
          {one && held.length > 0 && <p className="warn">{nameOf(held[0]!.spell)} is stored now: it's lost when this one is stored.</p>}
          {!one && used + level > max && <p className="warn">That's {used + level} levels: more than it holds ({max}). It can still be kept, beyond the rules.</p>}
          <div className="big-actions">
            <button className="big" onClick={() => setPick(null)}>
              Back
            </button>
            <button
              className="big primary"
              onClick={() => {
                const entry = { id: crypto.randomUUID().slice(0, 8), spell: pick.id, level, ...(dc ? { dc: Number(dc) } : {}), ...(atk !== "" && atk !== "-" ? { attack: Number(atk) } : {}), ...(by.trim() ? { by: by.trim() } : {}) };
                save(one ? [entry] : [...held, entry], `${name}: ${pick.name} stored at level ${level}${one && held.length ? ` (${nameOf(held[0]!.spell)} is lost)` : ""}.`);
                if (spend) act("spendSlot", { level, pact: false }, `Level ${level} slot spent: ${pick.name} cast into ${one ? who : name}.`);
                setPick(null);
                setAdding(false);
                setQ("");
              }}
            >
              Store it
            </button>
          </div>
        </>
      )}
      <p className="note">{inst.equipped && (!def.requiresAttunement || inst.attuned) ? "Cast them from your Spells page: casting one frees its space." : `Cast them from your Spells page while you wear it${def.requiresAttunement ? " and are attuned" : ""}.`}</p>
    </section>
  );
}

/**
 * Whose numbers the spell uses. A Thinking Stone object: the Rock Gnome's proficiency bonus (DC 8 + it, + it to hit).
 * A scroll written by another wizard (Master Scrivener): their spell save DC and attack bonus; otherwise the scroll's own.
 */
function MakerNumbers({ inst, act, stored }: { inst: Inst; act: Act; stored: boolean }) {
  const sc = inst.scroll!;
  const [by, setBy] = useState(sc.by ?? "");
  const [dc, setDc] = useState(sc.dc !== undefined ? String(sc.dc) : "");
  const [atk, setAtk] = useState(sc.attack !== undefined ? String(sc.attack) : "");
  const pb = sc.dc !== undefined ? sc.dc - 8 : 4;
  const save = (next: { dc?: number; attack?: number; by?: string }, label: string) =>
    act("setItem", { instanceId: inst.id, scroll: { spell: sc.spell, ...(sc.level !== undefined ? { level: sc.level } : {}), ...(sc.stored ? { stored: true } : {}), ...next } }, label);
  if (stored)
    return (
      <div className="group" style={{ marginTop: 10 }}>
        <div className="row">
          <div className="row-main">
            <div className="row-title">The Rock Gnome's proficiency bonus</div>
            <div className="row-sub">
              DC {8 + pb}, +{pb} to hit{sc.by ? ` · stored by ${sc.by}` : ""}
            </div>
          </div>
          <div className="stepper">
            {[-1, 1].map((d) => (
              <button key={d} aria-label={d < 0 ? "Lower" : "Higher"} onClick={() => save({ dc: 8 + Math.max(2, Math.min(6, pb + d)), attack: Math.max(2, Math.min(6, pb + d)), ...(sc.by ? { by: sc.by } : {}) }, `Proficiency bonus +${Math.max(2, Math.min(6, pb + d))}.`)}>
                {d < 0 ? "−" : "+"}
              </button>
            ))}
          </div>
        </div>
        <label className="row">
          <span className="row-main">Stored by</span>
          <input className="search" style={{ maxWidth: 160 }} value={by} placeholder="the gnome's name" onChange={(e) => setBy(e.target.value)} onBlur={() => save({ dc: 8 + pb, attack: pb, ...(by.trim() ? { by: by.trim() } : {}) }, by.trim() ? `Stored by ${by.trim()}.` : "Saved.")} />
        </label>
      </div>
    );
  const other = sc.dc !== undefined;
  return (
    <div className="group" style={{ marginTop: 10 }}>
      <label className="row check">
        <input
          type="checkbox"
          checked={other}
          onChange={() => (other ? save({}, "The scroll's own DC and attack bonus.") : save({ dc: 15, attack: 7 }, "Written by another wizard: set their DC and attack bonus."))}
        />
        <div className="row-main">
          <div className="row-title">Written by another wizard (Master Scrivener)</div>
          <div className="row-sub">Cast with their spell save DC and spell attack bonus, not the scroll's.</div>
        </div>
      </label>
      {other && (
        <>
          <label className="row">
            <span className="row-main">Their spell save DC</span>
            <input className="init-input" inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => Number(dc) > 0 && save({ dc: Number(dc), ...(atk !== "" ? { attack: Number(atk) } : {}), ...(sc.by ? { by: sc.by } : {}) }, `DC ${dc}.`)} aria-label="Their spell save DC" />
          </label>
          <label className="row">
            <span className="row-main">Their spell attack bonus</span>
            <input className="init-input" inputMode="numeric" value={atk} onChange={(e) => setAtk(e.target.value.replace(/[^0-9-]/g, ""))} onBlur={() => atk !== "" && save({ dc: sc.dc!, attack: Number(atk), ...(sc.by ? { by: sc.by } : {}) }, `+${atk} to hit.`)} aria-label="Their spell attack bonus" />
          </label>
          <label className="row">
            <span className="row-main">Written by</span>
            <input className="search" style={{ maxWidth: 160 }} value={by} placeholder="the wizard's name" onChange={(e) => setBy(e.target.value)} onBlur={() => save({ dc: sc.dc!, ...(sc.attack !== undefined ? { attack: sc.attack } : {}), ...(by.trim() ? { by: by.trim() } : {}) }, by.trim() ? `Written by ${by.trim()}.` : "Saved.")} />
          </label>
        </>
      )}
    </div>
  );
}

/** Equip, attune, change quantity, or remove one item. Changes apply at once and can be undone. */
export function ItemPanel({
  inst,
  def,
  act,
  close,
  spells = [],
  onRead,
  onCopy,
  onCustomSpell,
  custom,
  onEditCustom,
  onUse,
  bases = [],
  mine,
  resources = [],
  holderPresent = true,
}: {
  /** The companion an item's stored spell needs (Master's Amulet: your shield guardian) is there. */
  holderPresent?: boolean;
  /** Your resources, for the uses an item's parts have left (a prayer bead used until dawn). */
  resources?: { id: string; used: number; max: number }[];
  /** Your own spell save DC, attack bonus and name: the starting numbers for a spell you store in an item. */
  mine?: { dc: number; attack: number; name: string };
  inst: Inst;
  def: ItemDef;
  /** The weapons or armors it can be (Frost Brand: any sword), to pick which one this is. */
  bases?: { id: string; name: string }[];
  /** Something to use up (a potion): drink it or give it, its roll and who it goes to. */
  onUse?: () => void;
  /** One of your own items: what it says and what the sheet applies, and a way to change it. */
  custom?: CustomItem;
  onEditCustom?: () => void;
  act: Act;
  close: () => void;
  /** Spells a scroll can hold (the app's and your own). */
  spells?: { id: string; name: string; level: number }[];
  /** Opens the scroll's spell, to cast it from the scroll. */
  onRead?: () => void;
  /** A wizard copying the scroll's spell into the spellbook. */
  onCopy?: () => void;
  onCustomSpell?: () => void;
}) {
  const name = displayName(inst, def);
  const canEquip = !!custom || ["weapon", "armor", "shield", "wondrous", "focus"].includes(def.category);
  const applied = custom ? describeChanges(custom.modifiers) : [];
  const live = custom && inst.equipped && (!custom.requiresAttunement || inst.attuned);
  // An artifact that does something when you attune (psychic damage, a madness): shown right after.
  const [attuning, setAttuning] = useState(false);
  return (
    <>
      {custom && (
        <>
          <p className="row-sub">
            {[ITEM_TYPES.find((x) => x[0] === custom.category)?.[1], custom.weight !== undefined ? `${custom.weight} lb.` : "", custom.value ? `${custom.value.amount} ${custom.value.unit}` : "", custom.source || "Your own item"].filter(Boolean).join(" · ")}
          </p>
          {custom.description ? <Markdown text={custom.description} className="story-view" /> : <p className="note">No description.</p>}
          <section className="item-applied">
            <h2 className="sub-head">What the sheet applies</h2>
            {applied.length ? (
              <>
                <ul>
                  {applied.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className={`note${live ? " gold-text" : ""}`}>
                  {live ? "Applied now." : `Not applied now: only while equipped${custom.requiresAttunement ? " and attuned" : ""}.`}
                </p>
              </>
            ) : (
              <p className="note">Nothing: the description is only shown. To change your numbers, add a change the sheet applies.</p>
            )}
          </section>
          {onEditCustom && (
            <button className="big wide" onClick={onEditCustom}>
              Edit this item
            </button>
          )}
        </>
      )}
      {def.summary && <p>{def.summary}</p>}
      {!custom && def.text && def.text.length > 0 && (
        <details className="book-text" open={!def.summary}>
          <summary>Full text</summary>
          <TextBlocks text={def.text} />
        </details>
      )}
      {inst.name && inst.name !== def.name && <p className="row-sub">{def.name}</p>}
      {def.use && onUse && (
        <button className="big primary wide" style={{ marginBottom: 10 }} disabled={inst.quantity < 1} onClick={onUse}>
          {def.use.heal ? `Drink or give: ${def.use.heal.dice}${def.use.heal.bonus ? ` + ${def.use.heal.bonus}` : ""} hit points` : def.use.effect || def.use.damage ? "Drink or give" : "Drink it"}
          {def.use.note && <span className="sub">{def.use.note}</span>}
        </button>
      )}
      {def.curse && <CurseBox inst={inst} def={def} act={act} />}
      {def.charges && <ChargesBox inst={inst} def={def} act={act} />}
      {bases.length > 0 && (
        <label className="row">
          <div className="row-main">
            <div className="row-title">Which {def.weapon ? "weapon" : "armor"} it is</div>
            <div className="row-sub">Its damage, properties or AC come from this one.</div>
          </div>
          <select
            value={inst.base ?? ""}
            aria-label={`Which ${def.weapon ? "weapon" : "armor"} it is`}
            onChange={(e) => act("setItem", { instanceId: inst.id, base: e.target.value || null }, e.target.value ? `${def.name}: a ${bases.find((b) => b.id === e.target.value)?.name ?? e.target.value}.` : `${def.name}: back to its own.`)}
          >
            <option value="">{def.weapon ? "As listed" : "As listed"}</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {def.picks && <PicksBox inst={inst} def={def} act={act} uses={Object.fromEntries(resources.map((r) => [r.id, { used: r.used, max: r.max }]))} />}
      {def.storesSpells && <StoredSpellsBox inst={inst} def={def} act={act} spells={spells} {...(mine ? { mine } : {})} holderPresent={holderPresent} />}
      {(isScroll(def) || isStoredObject(def)) && <ScrollSpell inst={inst} def={def} act={act} spells={spells} {...(onRead ? { onRead } : {})} {...(onCopy ? { onCopy } : {})} onCustom={onCustomSpell ?? (() => {})} />}
      <div className="group">
        <div className="row">
          <div className="row-main row-title">Quantity</div>
          <div className="stepper">
            <button aria-label="One fewer" onClick={() => act("setItem", { instanceId: inst.id, quantity: Math.max(0, inst.quantity - 1) }, `${name}: ${Math.max(0, inst.quantity - 1)}.`)}>
              −
            </button>
            <span>{inst.quantity}</span>
            <button aria-label="One more" onClick={() => act("setItem", { instanceId: inst.id, quantity: inst.quantity + 1 }, `${name}: ${inst.quantity + 1}.`)}>
              +
            </button>
          </div>
        </div>
        {canEquip && (
          <label className="row check">
            <input type="checkbox" checked={inst.equipped} onChange={() => act("setItem", { instanceId: inst.id, equipped: !inst.equipped }, `${name} ${inst.equipped ? "unequipped" : "equipped"}.`)} />
            <div className="row-main">
              <div className="row-title">{def.category === "armor" ? "Wearing" : def.category === "shield" ? "Holding" : "Equipped"}</div>
              {def.category === "armor" && <div className="row-sub">Wearing this takes off other armor.</div>}
              {custom && <div className="row-sub">{custom.modifiers.length ? "Its changes apply while it's equipped." : "In use or worn; it changes nothing on the sheet."}</div>}
            </div>
          </label>
        )}
        {attuning && def.onAttune && <OnAttune name={name} items={def.onAttune} act={act} done={() => setAttuning(false)} />}
      {def.requiresAttunement && (
          <label className="row check">
            <input
              type="checkbox"
              checked={inst.attuned}
              onChange={() => {
                act("setItem", { instanceId: inst.id, attuned: !inst.attuned }, `${name} ${inst.attuned ? "no longer attuned" : "attuned"}.`);
                if (!inst.attuned && def.onAttune?.length) setAttuning(true);
              }}
            />
            <div className="row-main">
              <div className="row-title">Attuned</div>
              <div className="row-sub">Its magic works only while attuned and equipped.</div>
            </div>
          </label>
        )}
      </div>
      <button
        className="big damage wide"
        style={{ marginTop: 14 }}
        onClick={() => {
          act("removeItem", { instanceId: inst.id }, `${name} removed.`);
          close();
        }}
      >
        Remove from inventory
      </button>
      {custom && <p className="note">Your item stays in “Add an item”, to add it again; Edit → Delete removes it for good.</p>}
    </>
  );
}

/** Search the pack's items and add one. */
export function AddItemPanel({ registry, act, close, onCustom }: { registry: ContentRegistry; act: Act; close: () => void; onCustom?: () => void }) {
  const [q, setQ] = useState("");
  // Your own items first.
  const all = useMemo(() => registry.list("item").sort((a, b) => Number(isCustomItemId(b.id)) - Number(isCustomItemId(a.id))), [registry]);
  const found = all.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <>
      {onCustom && (
        <button className="big wide" onClick={onCustom}>
          Make your own item
        </button>
      )}
      <input className="search" type="search" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="group">
        {found.map((d) => (
          <button
            className="row"
            key={d.id}
            onClick={() => {
              act("addItem", { instanceId: crypto.randomUUID(), item: d.id, quantity: 1 }, `${d.name} added.`);
              close();
            }}
          >
            <div className="row-main">
              <div className="row-title">{d.name}</div>
              <div className="row-sub">{[isCustomItemId(d.id) ? "your own" : "", d.category, d.magic?.rarity, d.requiresAttunement ? "attunement" : ""].filter(Boolean).join(", ")}</div>
            </div>
          </button>
        ))}
        {found.length === 0 && (
          <div className="row">
            <div className="row-main row-sub">No item called “{q}”. Make your own with the button above.</div>
          </div>
        )}
      </div>
    </>
  );
}

/** Add or spend coins by typing an amount. */
export function CoinPanel({ coin, label, have, act }: { coin: (typeof COINS)[number][0]; label: string; have: number; act: Act }) {
  const [v, setV] = useState("");
  const n = Number(v || 0);
  return (
    <>
      <p className="note">You have {have} {label.toLowerCase()}.</p>
      <input className="search" inputMode="numeric" pattern="[0-9]*" placeholder="Amount" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
      <div className="big-actions">
        <button className="big damage" disabled={!n} onClick={() => { act("adjustCurrency", { coin, delta: -n }, `Spent ${n} ${coin}.`); setV(""); }}>
          Spend
        </button>
        <button className="big heal" disabled={!n} onClick={() => { act("adjustCurrency", { coin, delta: n }, `Added ${n} ${coin}.`); setV(""); }}>
          Add
        </button>
      </div>
    </>
  );
}

/** "A pearl worth at least 100gp and an owl feather." -> "Pearl worth at least 100 gp". */
function componentName(material: string): string {
  const first = material.split(/,| and | which | that /)[0]!.replace(/^(a|an|the)\s+/i, "").replace(/(\d)gp/i, "$1 gp").replace(/\.$/, "");
  const costly = /\d[\d,]*\s*gp/i.exec(material)?.[0];
  const name = first.length > 48 ? `${first.slice(0, 46)}…` : first;
  return (costly && !name.includes(costly.replace(/gp/i, "").trim()) ? `${name} (${costly.replace(/(\d)gp/i, "$1 gp")})` : name).replace(/^./, (c) => c.toUpperCase());
}

/**
 * Wizard: gold set aside for copying spells into the spellbook (PHB p. 114:
 * 50 gp per spell level in materials and fine inks).
 */
function SpellbookFund({ gp, act }: { gp: number; act: (type: OperationType, payload: unknown, label: string) => void }) {
  const [draft, setDraft] = useState(String(gp));
  useEffect(() => setDraft(String(gp)), [gp]);
  const n = Number(draft.replace(",", "."));
  const valid = draft.trim() !== "" && Number.isFinite(n) && n >= 0;
  return (
    <section>
      <h2>Spellbook materials</h2>
      <p className="note">The gold you keep for copying spells into your spellbook: the material components you use up as you experiment with a spell to master it, and the fine inks you record it with. 50 gp per spell level; half for your own school if you have its Savant feature.</p>
      <div className="fund">
        <label>
          <span>Total value</span>
          <input type="number" min={0} step="any" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <span>gp</span>
        </label>
        <button className="big primary" disabled={!valid || n === gp} onClick={() => act("setSpellbookFunds", { gp: n }, `Spellbook materials: ${n} gp.`)}>
          Save
        </button>
      </div>
    </section>
  );
}

export function InventoryTab({
  character,
  registry,
  openItem,
  openAdd,
  openCoin,
  sheet,
  act,
}: {
  character: Character;
  registry: ContentRegistry;
  openItem: (id: string) => void;
  openAdd: () => void;
  openCoin: (coin: (typeof COINS)[number][0], label: string) => void;
  sheet: DerivedSheet;
  act: (type: OperationType, payload: unknown, label: string) => void;
}) {
  const items = character.inventory.map((inst) => ({ inst, def: itemDef(registry, inst.item) }));
  const attuned = character.inventory.filter((i) => i.attuned).length;
  const weight = items.reduce((w, i) => w + (i.def.weight ?? 0) * i.inst.quantity, 0);

  // Items by type, searchable, with a filter (equipped, carried, attuned, magic).
  const [q, setQ] = useState("");
  const [show, setShow] = useState<ItemFilter>("all");
  const query = q.trim().toLowerCase();
  const passes = ({ inst, def }: (typeof items)[number]) =>
    (show === "all" || (show === "equipped" && inst.equipped) || (show === "carried" && !inst.equipped) || (show === "attuned" && inst.attuned) || (show === "magic" && (!!def.magic || def.requiresAttunement))) &&
    (!query || [displayName(inst, def), def.name, def.category, def.magic?.rarity ?? "", inst.notes ?? ""].join(" ").toLowerCase().includes(query));
  const visible = items.filter(passes);
  // Each item in the first section that takes it (Gear takes the rest).
  const groupOf = (d: ItemDef) => ITEM_GROUPS.find((g) => g.of(d))!.key;
  const byType = ITEM_GROUPS.map((g) => ({ ...g, rows: visible.filter((i) => groupOf(i.def) === g.key) })).filter((g) => g.rows.length);
  const rowsOf = (rows: typeof items) => (
    <div className="group">
      {[...rows]
        .sort((a, b) => Number(b.inst.equipped) - Number(a.inst.equipped) || displayName(a.inst, a.def).localeCompare(displayName(b.inst, b.def)))
        .map(({ inst, def }) => (
          <button className={inst.attuned ? "row attuned" : "row"} key={inst.id} onClick={() => openItem(inst.id)}>
            <div className="row-main">
              <div className="row-title">{displayName(inst, def)}</div>
              {(inst.equipped || itemTags(inst, def).length > 0) && <div className="row-sub">{[...(inst.equipped ? [def.category === "armor" || def.category === "wondrous" ? "worn" : "equipped"] : []), ...itemTags(inst, def)].join(", ")}</div>}
            </div>
            {inst.quantity !== 1 && <span className="num">×{inst.quantity}</span>}
          </button>
        ))}
    </div>
  );

  const attunedItems = items.filter((i) => i.inst.attuned);
  const slots = Math.max(3, attunedItems.length);

  return (
    <main>
      <section aria-label="Attunement">
        <h2>
          Attuned <span className={attuned > 3 ? "danger-text" : "gold-text"}>{attuned} of 3</span>
        </h2>
        <div className="attune-slots">
          {Array.from({ length: slots }, (_, i) => {
            const it = attunedItems[i];
            return it ? (
              <button key={it.inst.id} className={`attune-slot filled${i >= 3 ? " over" : ""}`} onClick={() => openItem(it.inst.id)}>
                {displayName(it.inst, it.def)}
              </button>
            ) : (
              <div key={`free-${i}`} className="attune-slot">
                Free slot
              </div>
            );
          })}
        </div>
        {attuned > 3 && <p className="note danger-text">More than 3 attuned items: the rules allow 3.</p>}
      </section>
      <section>
        <h2>Coins</h2>
        <div className="coins">
          {COINS.map(([coin, label]) => (
            <button key={coin} className="coin" onClick={() => openCoin(coin, label)} aria-label={`${label}: ${character.currency[coin] ?? 0}. Change`}>
              <b>{character.currency[coin] ?? 0}</b>
              <small>{coin}</small>
            </button>
          ))}
        </div>
      </section>
      <section aria-label="Items">
        <h2>
          Items
          <button className="link section-tool" onClick={openAdd}>
            Add
          </button>
        </h2>
        <input className="search" type="search" placeholder="Search your items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your items" />
        <div className="segmented small item-filter" role="radiogroup" aria-label="Show">
          {ITEM_FILTERS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={show === k} onClick={() => setShow(k)}>
              {label}
              <span className="jump-count">{items.filter((i) => k === "all" || (k === "equipped" && i.inst.equipped) || (k === "carried" && !i.inst.equipped) || (k === "attuned" && i.inst.attuned) || (k === "magic" && (!!i.def.magic || i.def.requiresAttunement))).length}</span>
            </button>
          ))}
        </div>
        {!visible.length && <p className="note">{items.length ? "No item matches." : "No items yet."}</p>}
        <Sections
          storageKey="items-types"
          label="Items"
          searching={!!query || show !== "all"}
          sections={byType.map((g) => ({ key: g.key, label: g.label, count: g.rows.length, body: rowsOf(g.rows), ...(g.rows.some((r) => r.inst.attuned) ? { hint: "attuned" } : {}) }))}
        />
      </section>
      {sheet.components.length > 0 && (
        <section>
          <h2>Spell components</h2>
          <p className="note">Components with a cost, or that the spell uses up: a component pouch or focus can't replace them. How many you have; one is used up each time a spell consumes it.</p>
          <div className="group">
            {sheet.components.map((m) => (
              <NumberStep
                key={m.spell}
                label={`${componentName(m.material)} (${m.spellName})`}
                sub={`${m.material}${m.consumed ? " · used up when cast" : ""}`}
                value={m.count}
                max={999}
                onChange={(n) => act("setComponent", { spell: m.spell, count: n }, `${m.spellName}: ${n} component${n === 1 ? "" : "s"}.`)}
              />
            ))}
          </div>
        </section>
      )}
      {character.classes.some((x) => x.class === "class:wizard") && <SpellbookFund gp={character.spellbookFunds} act={act} />}
      <Encumbrance character={character} sheet={sheet} act={act} itemsWeight={weight} />
      <section>
        <h2>Ammunition</h2>
        <div className="group">
          <label className="row check">
            <input
              type="checkbox"
              checked={!!character.settings.trackAmmo}
              onChange={() => act("setField", { path: ["settings", "trackAmmo"], value: character.settings.trackAmmo ? undefined : true }, character.settings.trackAmmo ? "Ammunition not tracked." : "Ammunition tracked: the app asks after each shot.")}
            />
            <div className="row-main">
              <div className="row-title">Track my ammunition</div>
              <div className="row-sub">After each attack roll with a bow, crossbow, sling or other weapon that needs it, the app asks whether to count one shot. Unticked, it never asks.</div>
            </div>
          </label>
        </div>
        <AmmoRecover character={character} registry={registry} act={act} />
      </section>
      <button className="big wide" onClick={openAdd}>
        Add an item
      </button>
    </main>
  );
}

/**
 * Carried weight, and the encumbrance rule the player picked: the standard carrying capacity or the variant
 * (one, or neither: not tracked). Ticking one unticks the other.
 */
function Encumbrance({ character, sheet, act, itemsWeight }: { character: Character; sheet: DerivedSheet; act: (type: OperationType, payload: unknown, label: string) => void; itemsWeight: number }) {
  const e = sheet.encumbrance;
  const rule = character.settings.encumbrance;
  const pick = (r: "standard" | "variant") =>
    act("setField", { path: ["settings", "encumbrance"], value: rule === r ? undefined : r }, rule === r ? "Encumbrance not tracked." : r === "standard" ? "Encumbrance: carrying capacity." : "Encumbrance: the variant rule.");
  const state =
    e.state === "over" ? `Over your carrying capacity (${e.capacity} lb.)` : e.state === "heavy" ? `Heavily encumbered: speed −20 ft, disadvantage on Strength, Dexterity and Constitution checks, attacks and saves` : e.state === "encumbered" ? "Encumbered: speed −10 ft" : rule ? "Not encumbered" : "";
  return (
    <section>
      <h2>Carrying</h2>
      <p className="note">
        {Math.round(itemsWeight * 10) / 10} lb. of items{e.coins ? ` and ${e.coins} coins (${Math.round((e.coins / 50) * 10) / 10} lb.)` : ""}: {e.carried} lb.
      </p>
      <div className="stat-row">
        <div className="stat-box">
          <b>{e.capacity}</b>
          <span>lb. maximum carrying capacity</span>
        </div>
        <div className="stat-box">
          <b>{e.pushLift}</b>
          <span>lb. push, drag or lift</span>
        </div>
      </div>
      <p className="note">
        Strength {sheet.abilities.str.score.total} × 15{e.factor !== 1 ? ` × ${e.factor}` : ""}, as a {e.size} creature{e.factor === 0.5 ? " (Tiny: half)" : e.factor > 1 ? " (twice for each size above Medium)" : ""}.
      </p>
      <div className="group">
        <label className="row check">
          <input type="checkbox" checked={rule === "standard"} onChange={() => pick("standard")} />
          <div className="row-main">
            <div className="row-title">Carrying capacity</div>
            <div className="row-sub">Up to {e.capacity} lb.; over it you can only push, drag or lift.</div>
          </div>
        </label>
        <label className="row check">
          <input type="checkbox" checked={rule === "variant"} onChange={() => pick("variant")} />
          <div className="row-main">
            <div className="row-title">Variant: encumbrance</div>
            <div className="row-sub">
              Over {e.encumberedAt ?? sheet.abilities.str.score.total * 5 * e.factor} lb.: speed −10 ft. Over {e.heavyAt ?? sheet.abilities.str.score.total * 10 * e.factor} lb.: speed −20 ft and disadvantage on Strength, Dexterity and Constitution checks, attacks and saves.
            </div>
          </div>
        </label>
      </div>
      {state && <p className={e.state === "fine" ? "note" : "over-banner"}>{state}.</p>}
      {e.note && <p className="note">{e.note}</p>}
    </section>
  );
}

/** Ammunition shot since the last fight: half of it can be found again (PHB p. 146). Any number can be recorded. */
export function AmmoRecover({ character, registry, act, done }: { character: Character; registry: ContentRegistry; act: (type: OperationType, payload: unknown, label: string) => void; done?: () => void }) {
  const spent = Object.entries(character.ammoSpent ?? {}).flatMap(([id, n]) => {
    const inst = character.inventory.find((i) => i.id === id);
    return inst && n > 0 ? [{ id, n, name: inst.name ?? itemDef(registry, inst.item).name }] : [];
  });
  const [pick, setPick] = useState<Record<string, number>>(() => Object.fromEntries(spent.map((x) => [x.id, Math.floor(x.n / 2)])));
  if (!spent.length) return null;
  return (
    <div className="ammo-recover">
      <p className="sub-head">Shot since the last fight: pick up half</p>
      <div className="group">
        {spent.map((x) => (
          <NumberStep key={x.id} label={x.name} sub={`${x.n} shot; half is ${Math.floor(x.n / 2)}`} value={pick[x.id] ?? 0} min={0} max={x.n} onChange={(v) => setPick({ ...pick, [x.id]: v })} />
        ))}
      </div>
      <div className="big-actions">
        <button
          className="big primary"
          onClick={() => {
            act("recoverAmmo", { items: spent.map((x) => ({ instanceId: x.id, amount: pick[x.id] ?? 0 })) }, "Ammunition picked up.");
            done?.();
          }}
        >
          Pick them up
        </button>
        <button
          className="big"
          onClick={() => {
            act("recoverAmmo", { items: [] }, "None picked up.");
            done?.();
          }}
        >
          None found
        </button>
      </div>
    </div>
  );
}

/** A cursed item: the curse, whether it holds now, and Remove Curse. */
function CurseBox({ inst, def, act }: { inst: Inst; def: ItemDef; act: Act }) {
  const holds = !inst.curseLifted && (def.requiresAttunement ? inst.attuned : inst.equipped);
  const name = displayName(inst, def);
  return (
    <div className={holds ? "over-banner curse" : "note"}>
      <p>
        <strong>Curse{holds ? "" : inst.curseLifted ? " (lifted)" : def.requiresAttunement ? " (takes hold when you attune)" : " (takes hold when you equip it)"}.</strong> {def.curse!.text}
      </p>
      {holds && (
        <button className="big wide" onClick={() => act("liftCurse", { instanceId: inst.id }, `${name}: Remove Curse.`)}>
          Remove Curse (or similar magic) was cast on me
        </button>
      )}
    </div>
  );
}

/** Charges: how many are left, use one, get one back, and what comes back at dawn. */
function ChargesBox({ inst, def, act }: { inst: Inst; def: ItemDef; act: Act }) {
  const ch = def.charges!;
  const left = ch.max - (inst.chargesUsed ?? 0);
  const name = displayName(inst, def);
  const [busy, setBusy] = useState(false);
  const regain = async () => {
    if (!ch.regain) return;
    setBusy(true);
    try {
      const n = /^\d+$/.test(ch.regain) ? Number(ch.regain) : ch.regain === "all" ? ch.max : (await rollOrThrow(ch.regain, true, undefined, { source: name })).total;
      act("useCharge", { instanceId: inst.id, amount: -n }, `${name}: ${n} charge${n === 1 ? "" : "s"} back at dawn.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group">
      <div className="row">
        <div className="row-main">
          <div className="row-title">Charges</div>
          <div className="row-sub">
            {left} of {ch.max} left{ch.regain ? `; ${ch.regain === "all" ? "all" : ch.regain} back at dawn` : "; they don't come back"}
          </div>
        </div>
        <div className="stepper">
          <button aria-label="Use a charge" onClick={() => act("useCharge", { instanceId: inst.id, amount: 1 }, `${name}: a charge used.`)}>
            −
          </button>
          <span>{left}</span>
          <button aria-label="One charge back" disabled={left >= ch.max} onClick={() => act("useCharge", { instanceId: inst.id, amount: -1 }, `${name}: a charge back.`)}>
            +
          </button>
        </div>
      </div>
      {ch.regain && left < ch.max && (
        <button className="big wide" disabled={busy} onClick={() => void regain()}>
          {busy ? "Rolling…" : `Dawn: ${ch.regain === "all" ? "all back" : `roll ${ch.regain} and get them back`}`}
        </button>
      )}
    </div>
  );
}

/** What attuning does once (an artifact's psychic damage, a madness): roll and take the damage, or read the note. */
function OnAttune({ name, items, act, done }: { name: string; items: NonNullable<ItemDef["onAttune"]>; act: Act; done: () => void }) {
  const [rolled, setRolled] = useState<Record<number, number>>({});
  return (
    <div className="over-banner">
      <p>
        <strong>Attuning to {name}:</strong>
      </p>
      {items.map((x, i) =>
        x.damage ? (
          <div key={i} className="big-actions">
            {rolled[i] === undefined ? (
              <button className="big" onClick={() => void rollOrThrow(x.damage!.dice, true, undefined, { source: name }).then((r) => setRolled({ ...rolled, [i]: r.total }))}>
                Roll {x.damage.dice} {x.damage.type}
              </button>
            ) : (
              <button
                className="big damage"
                onClick={() => {
                  act("damage", { amount: rolled[i], damageType: x.damage!.type }, `${name}: ${rolled[i]} ${x.damage!.type} damage on attuning.`);
                  done();
                }}
              >
                Take {rolled[i]} {x.damage.type}
              </button>
            )}
          </div>
        ) : (
          <p key={i}>{x.note}</p>
        ),
      )}
      <button className="link" onClick={done}>
        Done
      </button>
    </div>
  );
}
