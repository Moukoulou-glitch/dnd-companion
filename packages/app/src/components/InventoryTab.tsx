import { RichText } from "./Conditions";
import { useMemo, useState } from "react";
import type { ContentRegistry } from "@dnd/engine";
import type { Character, ItemDef, OperationType } from "@dnd/schema";

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

function itemTags(inst: Inst, def: ItemDef): string[] {
  const tags: string[] = [];
  if (def.requiresAttunement) tags.push(inst.attuned ? "attuned" : "needs attunement");
  if (def.magic?.rarity) tags.push(def.magic.rarity);
  return tags;
}

/** Equip, attune, change quantity, or remove one item. Changes apply at once and can be undone. */
export function ItemPanel({ inst, def, act, close }: { inst: Inst; def: ItemDef; act: Act; close: () => void }) {
  const name = displayName(inst, def);
  const canEquip = ["weapon", "armor", "shield", "wondrous", "focus"].includes(def.category);
  return (
    <>
      {def.summary && <p>{def.summary}</p>}
      {def.text && def.text.length > 0 && (
        <details className="book-text" open={!def.summary}>
          <summary>Full text</summary>
          {def.text.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
        </details>
      )}
      {inst.name && inst.name !== def.name && <p className="row-sub">{def.name}</p>}
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
    </>
  );
}

/** Search the pack's items and add one. */
export function AddItemPanel({ registry, act, close }: { registry: ContentRegistry; act: Act; close: () => void }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => registry.list("item"), [registry]);
  const found = all.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <>
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
              <div className="row-sub">{[d.category, d.magic?.rarity, d.requiresAttunement ? "attunement" : ""].filter(Boolean).join(", ")}</div>
            </div>
          </button>
        ))}
        {found.length === 0 && (
          <div className="row">
            <div className="row-main row-sub">No item called "{q}" yet. New items come from the content pack.</div>
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

export function InventoryTab({
  character,
  registry,
  openItem,
  openAdd,
  openCoin,
}: {
  character: Character;
  registry: ContentRegistry;
  openItem: (id: string) => void;
  openAdd: () => void;
  openCoin: (coin: (typeof COINS)[number][0], label: string) => void;
}) {
  const items = character.inventory.map((inst) => ({ inst, def: registry.get(inst.item, "item") }));
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
      <p className={`note${attuned > 3 ? " danger-text" : ""}`}>
        Carrying {Math.round(weight * 10) / 10} lb.
      </p>
      <button className="big wide" onClick={openAdd}>
        Add an item
      </button>
    </main>
  );
}
