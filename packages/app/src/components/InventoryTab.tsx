import { NumberStep } from "./Adjust";
import { RichText, TextBlocks } from "./Conditions";
import { useEffect, useMemo, useState } from "react";
import { isCustomItemId, type ContentRegistry, type DerivedSheet } from "@dnd/engine";
import type { Character, CustomItem, ItemDef, OperationType } from "@dnd/schema";
import { describeChanges } from "./ChangesEditor";
import { ITEM_TYPES } from "./CustomForms";
import { Markdown } from "./Markdown";

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

function itemTags(inst: Inst, def: ItemDef): string[] {
  const tags: string[] = [];
  if (isCustomItemId(def.id)) tags.push("your own");
  if (def.requiresAttunement) tags.push(inst.attuned ? "attuned" : "needs attunement");
  if (def.magic?.rarity) tags.push(def.magic.rarity);
  return tags;
}

/** A spell scroll (DMG p. 200), by its id or name. */
export const isScroll = (def: ItemDef) => def.id.startsWith("item:spell-scroll") || /spell scroll/i.test(def.name);

/** The level a scroll is written at, from its name ("Spell Scroll (3rd Level)"); undefined when it doesn't say. */
const scrollLevel = (def: ItemDef) => {
  const m = /(\d)(?:st|nd|rd|th)[- ]level/i.exec(def.name);
  return m ? Number(m[1]) : /cantrip/i.test(def.name) ? 0 : undefined;
};

/** Which spell is written on a scroll: pick one of the app's spells or your own, then read it from here. */
function ScrollSpell({ inst, def, act, spells, onRead, onCopy, onCustom }: { inst: Inst; def: ItemDef; act: Act; spells: { id: string; name: string; level: number }[]; onRead?: () => void; onCopy?: () => void; onCustom: () => void }) {
  const [picking, setPicking] = useState(!inst.scroll);
  const [q, setQ] = useState("");
  const lvl = scrollLevel(def);
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
              <div className="row-sub">{written ? (written.level === 0 ? "Cantrip" : `Level ${written.level} spell`) : "Spell not found"}{lvl !== undefined && written && lvl > written.level ? `, written at level ${lvl}` : ""}</div>
            </div>
            <button className="link" onClick={() => setPicking(true)}>
              Change
            </button>
          </div>
        </div>
      )}
      {inst.scroll && !picking && onRead && (
        <button className="big primary wide" style={{ marginTop: 10 }} onClick={onRead}>
          Read the scroll
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
                  act("setItem", { instanceId: inst.id, scroll: { spell: x.id } }, `${displayName(inst, def)}: ${x.name}.`);
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
          <button className="big wide" style={{ marginTop: 10 }} onClick={onCustom}>
            Write your own spell
          </button>
          <p className="note">Your own spell joins your spells too; once saved, pick it here.</p>
        </>
      )}
    </section>
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
}: {
  inst: Inst;
  def: ItemDef;
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
      {isScroll(def) && <ScrollSpell inst={inst} def={def} act={act} spells={spells} {...(onRead ? { onRead } : {})} {...(onCopy ? { onCopy } : {})} onCustom={onCustomSpell ?? (() => {})} />}
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
        {def.requiresAttunement && (
          <label className="row check">
            <input type="checkbox" checked={inst.attuned} onChange={() => act("setItem", { instanceId: inst.id, attuned: !inst.attuned }, `${name} ${inst.attuned ? "no longer attuned" : "attuned"}.`)} />
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
  const equipped = items.filter((i) => i.inst.equipped);
  const carried = items.filter((i) => !i.inst.equipped);
  const attuned = character.inventory.filter((i) => i.attuned).length;
  const weight = items.reduce((w, i) => w + (i.def.weight ?? 0) * i.inst.quantity, 0);

  const list = (title: string, rows: typeof items) =>
    rows.length > 0 && (
      <section>
        <h2>{title}</h2>
        <div className="group">
          {rows.map(({ inst, def }) => (
            <button className={inst.attuned ? "row attuned" : "row"} key={inst.id} onClick={() => openItem(inst.id)}>
              <div className="row-main">
                <div className="row-title">{displayName(inst, def)}</div>
                {itemTags(inst, def).length > 0 && <div className="row-sub">{itemTags(inst, def).join(", ")}</div>}
              </div>
              {inst.quantity !== 1 && <span className="num">×{inst.quantity}</span>}
            </button>
          ))}
        </div>
      </section>
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
      {list("Equipped", equipped)}
      {list("Carried", carried)}
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
      <div className="group">
        <label className="row check">
          <input type="checkbox" checked={rule === "standard"} onChange={() => pick("standard")} />
          <div className="row-main">
            <div className="row-title">Carrying capacity</div>
            <div className="row-sub">Up to {e.capacity} lb. (Strength × 15).</div>
          </div>
        </label>
        <label className="row check">
          <input type="checkbox" checked={rule === "variant"} onChange={() => pick("variant")} />
          <div className="row-main">
            <div className="row-title">Variant: encumbrance</div>
            <div className="row-sub">
              Over {e.encumberedAt ?? sheet.abilities.str.score.total * 5} lb.: speed −10 ft. Over {e.heavyAt ?? sheet.abilities.str.score.total * 10} lb.: speed −20 ft and disadvantage on Strength, Dexterity and Constitution checks, attacks and saves.
            </div>
          </div>
        </label>
      </div>
      {state && <p className={e.state === "fine" ? "note" : "over-banner"}>{state}.</p>}
      {e.note && <p className="note">{e.note}</p>}
    </section>
  );
}
