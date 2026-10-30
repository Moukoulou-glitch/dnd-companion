import { RichText, TextBlocks } from "./Conditions";
import { spellMatches } from "../spellSearch";
import { useMemo, useState, type ReactNode } from "react";
import { ABILITY_NAMES } from "@dnd/schema";
import { signed, type ContentRegistry, type DerivedSheet, type SpellResult, type WeaponAttack } from "@dnd/engine";

/** Where objects holding a spell sort, after 9th level. */
const STORED_LEVEL = 100;
const LEVEL_NAME = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

export const ordinal = (n: number) => ["", "1st", "2nd", "3rd"][n] ?? `${n}th`;

/** A spell's further damage parts (Ice Storm's 4d6 cold) as dice of their own type, after its own bonus dice. */
function withParts<T extends { dice: { label: string; dice: string; damageType?: string }[] }>(sp: SpellResult, key: number, bonus: T): T {
  const parts = (sp.damage?.also ?? []).flatMap((p) => {
    const dice = p.byLevel[key];
    return dice ? [{ label: `${sp.name} (${p.type})`, dice, damageType: p.type }] : [];
  });
  return parts.length ? { ...bonus, dice: [...bonus.dice, ...parts] } : bonus;
}

/** Healing added to each creature at this slot level (Disciple of Life: 2 + the spell's level), as fixed parts of the roll. */
function withHealBonus<T extends { total: number; parts: { label: string; value: number }[]; dice: { label: string; dice: string }[] }>(sp: SpellResult, key: number, bonus: T): T {
  const extra = sp.damage ? undefined : sp.heal?.bonus?.[key];
  if (!extra?.length) return bonus;
  // Dice of its own (Moon Sickle: 1d4) roll with the spell's; numbers are fixed parts.
  const flat = extra.filter((x) => x.value).map((x) => ({ label: x.label, value: x.value }));
  const dice = extra.flatMap((x) => (x.dice ? [{ label: x.label, dice: x.dice }] : []));
  return { ...bonus, parts: [...bonus.parts, ...flat], dice: [...bonus.dice, ...dice], total: bonus.total + flat.reduce((n, x) => n + x.value, 0) };
}

/** Options worked out by the slot level (Zenith: 1d10 per level of the spell): the dice for this one. */
function bySlot<T extends { suggestions: { apply: { dice: string[]; diceBySlot?: Record<number, string[]> } }[] }>(bonus: T, key: number): T {
  if (!bonus.suggestions.some((x) => x.apply.diceBySlot)) return bonus;
  return { ...bonus, suggestions: bonus.suggestions.map((x) => (x.apply.diceBySlot?.[key] ? { ...x, apply: { ...x.apply, dice: x.apply.diceBySlot[key]! } } : x)) };
}

/** A spell shaped like a weapon attack, so the roll composer can roll its attack and damage. */
export function spellAsAttack(sp: SpellResult, level: number, alt = false): WeaponAttack & { saveNote?: string } {
  const key = sp.level === 0 ? 0 : level;
  // Magic Missile: one dart's dice, rolled once for all of them.
  const dice = (sp.darts ? sp.darts.dice : undefined) ?? (alt ? sp.damage?.alt?.byLevel[key] : undefined) ?? sp.damage?.byLevel[key] ?? sp.heal?.byLevel[key] ?? "0";
  const emptyRoll = { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] };
  const a: WeaponAttack & { saveNote?: string } = {
    attackId: sp.id,
    name: sp.name,
    mode: "ranged",
    action: "attack",
    ability: "int",
    proficient: true,
    attack: sp.attack ?? emptyRoll,
    damage: { dice, type: sp.damage?.type ?? (sp.heal ? "healing" : ""), bonus: withHealBonus(sp, key, withParts(sp, key, bySlot(sp.damageBonus ?? emptyRoll, key))), onCrit: [], critExtraDice: [] },
    properties: [],
  };
  if (sp.save) {
    a.saveNote = `Targets make a DC ${sp.save.dc} ${ABILITY_NAMES[sp.save.ability]} saving throw${
      sp.save.onSuccess === "half" ? ": half damage on a success." : sp.save.onSuccess === "none" ? ": no damage on a success." : "."
    }`;
  }
  return a;
}

function tags(sp: SpellResult): string {
  const t: string[] = [sp.castingTime];
  if (sp.concentration) t.push("concentration");
  if (sp.ritual) t.push("ritual");
  if (sp.cast.free && sp.cast.free.remaining > 0) t.push(sp.cast.free.noConcentration && sp.concentration ? "free use without concentration" : "free use");
  return t.join(", ");
}

/** A casting class's list, for the "<Class> spell list" view. */
export interface ClassList {
  /** Spellcasting id, also the class list name ("wizard"). */
  id: string;
  className: string;
  kind: "wizard" | "prepared" | "known";
  maxLevel: number;
  /** Class lists it draws on (Divine Soul: sorcerer and cleric) and its name. */
  classes: string[];
  listName: string;
  /** Spells joining the list from Tasha's expanded list (Additional Druid Spells), while that's on. */
  extra?: string[];
}

type ListRow = { sp: SpellResult; info?: undefined; stored?: boolean } | { sp?: undefined; stored?: undefined; info: { id: string; name: string; level: number; school: string; castingTime: string; ritual: boolean; concentration: boolean } };

export function SpellsTab({
  sheet,
  openSpell,
  classLists,
  reg,
  openSpellInfo,
  customSpells = [],
  openCustomSpell,
  backup,
}: {
  sheet: DerivedSheet;
  openSpell: (sp: SpellResult) => void;
  classLists: ClassList[];
  reg: ContentRegistry;
  openSpellInfo: (id: string, list?: string) => void;
  /** The whole spellbook view: what a backup copy costs, and paying for it. */
  backup?: ReactNode;
  /** Spells the player wrote, to change or delete. */
  customSpells?: { id: string; name: string }[];
  openCustomSpell?: (id?: string) => void;
}) {
  const [view, setView] = useState<string>("ready");
  const [q, setQ] = useState("");
  const wizard = classLists.find((l) => l.kind === "wizard");
  const anyPrepared = classLists.some((l) => l.kind !== "known");
  // Wizard: Prepared today, Whole spellbook, Wizard spell list. Prepared casters: Prepared today, <Class> spell list. Known casters: Known spells, <Class> spell list.
  const views: { id: string; label: string }[] = [
    { id: "ready", label: anyPrepared ? "Prepared today" : "Known spells" },
    ...(wizard ? [{ id: "book", label: "Whole spellbook" }] : []),
    ...classLists.map((l) => ({ id: `list:${l.id}`, label: l.listName })),
    // A feature's spells with a list of their own (Thinking Stone spells).
    ...sheet.spellcasting.filter((sc) => sc.tab && sheet.spells.some((s) => s.list.id === sc.id)).map((sc) => ({ id: `own:${sc.id}`, label: sc.tab! })),
  ];
  const ownTabs = new Set(sheet.spellcasting.filter((sc) => sc.tab).map((sc) => sc.id));
  // Objects holding a spell (Thinking Stone): on the Thinking Stone tab when you have it, not with your prepared spells.
  const stoneTab = sheet.spellcasting.some((sc) => sc.id === "thinking-stone" && sc.tab) && sheet.spells.some((s) => s.list.id === "thinking-stone");
  const isStored = (s: SpellResult) => !!s.cast.scroll?.stored;
  const current = views.some((v) => v.id === view) ? view : "ready";
  const listOf = current.startsWith("list:") ? classLists.find((l) => `list:${l.id}` === current) : undefined;

  const rows: ListRow[] = useMemo(() => {
    if (current === "ready") return sheet.spells.filter((s) => s.ready !== "not prepared" && !ownTabs.has(s.list.id) && !(stoneTab && isStored(s))).map((sp) => ({ sp }));
    if (current.startsWith("own:"))
      return [
        ...sheet.spells.filter((s) => s.list.id === current.slice(4)).map((sp) => ({ sp })),
        ...(current === "own:thinking-stone" ? sheet.spells.filter(isStored).map((sp) => ({ sp, stored: true })) : []),
      ];
    if (current === "book") return sheet.spells.filter((s) => s.list.id === wizard?.id && !s.notInBook).map((sp) => ({ sp }));
    if (!listOf) return [];
    const mine = new Map(sheet.spells.filter((s) => s.list.id === listOf.id).map((s) => [s.id, s]));
    // A prepared caster's whole list is already on the sheet; known casters and wizards see the rest for reference.
    if (listOf.kind === "prepared") return [...mine.values()].map((sp) => ({ sp }));
    return reg
      .list("spell")
      .filter((d) => (d.classes.some((x) => listOf.classes.includes(x)) || !!listOf.extra?.includes(d.id)) && d.level <= listOf.maxLevel)
      .map((d) => {
        const sp = mine.get(d.id);
        return sp ? { sp } : { info: { id: d.id, name: d.name, level: d.level, school: d.school, castingTime: d.castingTime, ritual: d.ritual, concentration: d.concentration } };
      });
  }, [current, sheet, reg, listOf, wizard]);

  // Objects come last, under their own heading.
  const levelOf = (r: ListRow) => (r.stored ? STORED_LEVEL : r.sp ? r.sp.level : r.info!.level);
  // Search by name, school, or words like "ritual" and "concentration".
  const needle = q.trim().toLowerCase();
  const shownRows = needle
    ? rows.filter((r) => {
        if (!r.sp) return spellMatches(needle, r.info!);
        return spellMatches(needle, { name: r.sp.name, level: r.sp.level, school: r.sp.school, ritual: r.sp.ritual, concentration: r.sp.concentration }) || tags(r.sp).toLowerCase().includes(needle);
      })
    : rows;
  const levels = [...new Set(shownRows.map(levelOf))].sort((a, b) => a - b);
  const slotsLeft = (lvl: number) => {
    const s = sheet.spellSlots.find((x) => x.level === lvl);
    return s ? s.total - s.used : 0;
  };
  // Lists drawing on several classes (Divine Soul) tag each spell with its class.
  const multi = !!listOf && listOf.classes.length > 1;
  const classTags = (id: string) =>
    (reg.find(id, "spell")?.classes ?? [])
      .filter((x) => listOf?.classes.includes(x))
      .map((x) => (
        <span className={`tag class-tag ${x}`} key={x}>
          {x.replace(/^./, (ch) => ch.toUpperCase())}
        </span>
      ));
  const missingTag = listOf?.kind === "wizard" ? "not in your spellbook" : "not known";

  return (
    <main>
      <section>
        <div className="group">
          {sheet.spellcasting.map((sc) => (
            <div className="row" key={sc.id}>
              <div className="row-main">
                <div className="row-title">{sc.label}</div>
                <div className="row-sub">
                  {sc.noAbility ? "No spellcasting ability" : ABILITY_NAMES[sc.ability]}
                  {sc.prepared ? `, ${sc.prepared.count} of ${sc.prepared.max} prepared` : ""}
                </div>
              </div>
              <span className="row-sub">DC</span>
              <span className="num" style={{ minWidth: "1.6em" }}>
                {sc.saveDc.total}
              </span>
              <span className="num">{signed(sc.attack.total)}</span>
            </div>
          ))}
        </div>
      </section>

      {views.length > 1 && (
        <div className={`segmented small${views.length > 2 ? " three" : ""}`} role="radiogroup" aria-label="Show">
          {views.map((v) => (
            <button key={v.id} role="radio" aria-checked={current === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <input className="search" type="search" placeholder="Search by name, level or school" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" />
      )}
      {needle && !shownRows.length && <p className="note">No spell matches “{q.trim()}”.</p>}
      {current === "book" && backup}
      {listOf && listOf.kind !== "prepared" && (
        <p className="note">
          Every {multi ? listOf.classes.join(" and ") : listOf.className.toLowerCase()} spell up to level {listOf.maxLevel}, for reference. Yours are bright.
        </p>
      )}

      {levels.map((lvl) => (
        <section key={lvl}>
          <h2>
            {lvl === STORED_LEVEL ? "Stored in objects" : LEVEL_NAME[lvl]}
            {lvl > 0 && lvl !== STORED_LEVEL && sheet.spellSlots.some((x) => x.level === lvl) ? `, ${slotsLeft(lvl)} slots left` : ""}
          </h2>
          <div className="group">
            {shownRows
              .filter((r) => levelOf(r) === lvl)
              .map((r) =>
                r.sp ? (
                  <button className={`row${r.sp.ready === "not prepared" ? " dim" : ""}`} key={`${r.sp.list.id}-${r.sp.id}-${r.sp.cast.scroll?.instanceId ?? ""}`} onClick={() => openSpell(r.sp!)}>
                    <div className="row-main">
                      <div className="row-title">{r.sp.name}</div>
                      <div className="row-sub">{tags(r.sp)}</div>
                    </div>
                    <span className="row-tags">
                      {multi && classTags(r.sp.id)}
                      {listOf?.extra?.includes(r.sp.id) && !(reg.find(r.sp.id, "spell")?.classes ?? []).some((x) => listOf.classes.includes(x)) && <span className="tag">Tasha's</span>}
                      {sheet.concentration?.spell === r.sp.id && <span className="tag conc">concentrating</span>}
                      {r.sp.ready === "prepared" && <span className="tag adv">prepared</span>}
                      {r.sp.notInBook && <span className="tag dis">not in your spellbook</span>}
                      {r.sp.fromFeature && <span className="tag">{r.sp.fromFeature}</span>}
                      {r.sp.cast.extra &&
                        (r.sp.cast.extra.perLong !== undefined ? (
                          <span className={`tag ${r.sp.cast.extra.sinceLong >= r.sp.cast.extra.perLong ? "fail" : "adv"}`}>
                            {Math.max(0, r.sp.cast.extra.perLong - r.sp.cast.extra.sinceLong)} of {r.sp.cast.extra.perLong} left
                          </span>
                        ) : (
                          <span className="tag" title="Cast without a slot since your last short rest and since your last long rest">
                            {r.sp.cast.extra.sinceShort} short · {r.sp.cast.extra.sinceLong} long
                          </span>
                        ))}
                    </span>
                    <span className="num spell-num">{r.sp.attack ? signed(r.sp.attack.total) : r.sp.save ? `DC ${r.sp.save.dc} ${r.sp.save.ability.toUpperCase()}` : ""}</span>
                  </button>
                ) : (
                  <button className="row dim" key={`info-${r.info!.id}`} onClick={() => openSpellInfo(r.info!.id, listOf?.kind === "wizard" ? listOf.id : undefined)}>
                    <div className="row-main">
                      <div className="row-title">{r.info!.name}</div>
                      <div className="row-sub">
                        {[r.info!.castingTime, r.info!.concentration ? "concentration" : "", r.info!.ritual ? "ritual" : ""].filter(Boolean).join(", ")}
                      </div>
                    </div>
                    <span className="row-tags">
                      {multi && classTags(r.info!.id)}
                      {listOf?.extra?.includes(r.info!.id) && <span className="tag">Tasha's</span>}
                      <span className="tag">{missingTag}</span>
                    </span>
                  </button>
                ),
              )}
          </div>
        </section>
      ))}
      {sheet.spells.length === 0 && <p className="note">No spells on this character.</p>}
      {openCustomSpell && (
        <section>
          <h2>Your own spells</h2>
          {customSpells.length > 0 && (
            <div className="group">
              {customSpells.map((x) => (
                <button className="row" key={x.id} onClick={() => openCustomSpell(x.id)}>
                  <div className="row-main">
                    <div className="row-title">{x.name}</div>
                    <div className="row-sub">Tap to change</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button className="big wide" onClick={() => openCustomSpell()}>
            Add your own spell
          </button>
        </section>
      )}
      <p className="note attribution">Spell text from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed CC-BY-4.0.</p>
    </main>
  );
}

/** Everything about one spell, and how to cast it. */
export function SpellPanel({
  sp,
  sheet,
  hasSelfEffect,
  selfDefault,
  casterSide,
  casterDamage,
  onCast,
  companions,
  initialCast,
  onPrepare,
  onRollAttack,
  onRollDamage,
  readying,
  bookChecks,
  concentrating,
}: {
  /** The spell your concentration is on now (a free cast without concentration leaves it as it was). */
  concentrating?: string | undefined;
  /** A wizard's spell: "Copy into the spellbook" and "Prepared today", in place of the plain tick-box. */
  bookChecks?: ReactNode;
  /** Casting it with the Ready action: held, released later with the reaction. */
  readying?: boolean;
  sp: SpellResult;
  sheet: DerivedSheet;
  hasSelfEffect: boolean;
  /** Its effect goes on you unless you say otherwise (Shillelagh, self spells). */
  selfDefault?: boolean;
  /** The caster's side of the spell (Hex, Hunter's Mark: your extra damage and its tag): always tracked, no question. */
  casterSide?: boolean;
  /** That tag adds damage to your attacks (Hex), so the note can say so. */
  casterDamage?: boolean;
  onCast: (level: number, using: "slot" | "pact" | "free" | "ritual" | "fast-ritual" | "none" | "extra" | "scroll" | "points" | "charges", selfEffect: boolean, castingTime?: string, onCompanions?: string[]) => void;
  /** Your companions here now: its effect can go on them too (Bless on your wolf). */
  companions?: { id: string; name: string; warnings?: string[]; already?: boolean }[];
  /** Opens already cast at this level (after a turn warning was confirmed). */
  initialCast?: number | undefined;
  onPrepare: (prepared: boolean) => void;
  onRollAttack: (level: number) => void;
  /** alt: the spell's other dice (Toll the Dead on a hurt target). */
  onRollDamage: (level: number, alt?: boolean) => void;
}) {
  const [cast, setCast] = useState<number | null>(initialCast ?? null);
  const [onMe, setOnMe] = useState(selfDefault ?? (hasSelfEffect && /self/i.test(sp.range)));
  const [onComps, setOnComps] = useState<string[]>([]);
  // "1 action or 8 hours" (Plant Growth): which one.
  // Another casting time a feature gives (Untamed Flame: "1 bonus action (Untamed Flame)").
  const times = [...sp.castingTime.split(/\s+or\s+/i).filter(Boolean), ...(sp.altCasts ?? []).map((x) => `${x.time} (${x.label})`)];
  const [time, setTime] = useState(times[0]!);
  const altNow = (sp.altCasts ?? []).find((x) => time === `${x.time} (${x.label})`);
  const slotsLeft = (lvl: number) => {
    const s = sheet.spellSlots.find((x) => x.level === lvl);
    return s ? s.total - s.used : 0;
  };

  const meta: [string, string][] = [
    ["Casting time", sp.castingTime],
    ["Range", sp.range],
    ["Components", sp.components.join(", ") + (sp.material ? ` (${sp.material})` : "")],
    ["Duration", sp.duration],
    ["School", sp.school],
    ["Cast with", sp.list.label],
    ...(sp.fromFeature ? [["From", sp.fromFeature] as [string, string]] : []),
    ...(sp.beams
      ? [
          [
            sp.beams.what === "beams" ? "Beams" : "Rays",
            sp.level === 0
              ? `${sp.beams.byLevel[0]} at your level, each its own attack roll`
              : `${sp.beams.byLevel[sp.level]} at level ${sp.level}, +1 per slot level above`,
          ] as [string, string],
        ]
      : []),
  ];

  const doCast = (level: number, using: "slot" | "pact" | "free" | "ritual" | "fast-ritual" | "none" | "extra" | "scroll" | "points" | "charges") => {
    // Stored in an object (Thinking Stone): no effect on anyone now.
    onCast(level, using, sp.stores ? false : casterSide ? true : onMe, times.length > 1 ? time : undefined, casterSide || sp.stores ? [] : onComps);
    setCast(level);
  };

  return (
    <>
      <p className="row-sub">
        {sp.level === 0 ? `${sp.school} cantrip` : `${ordinal(sp.level)}-level ${sp.school.toLowerCase()}`}
        {sp.concentration ? ", concentration" : ""}
        {sp.ritual ? ", ritual" : ""}
      </p>
      <ul className="lines meta">
        {meta.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </li>
        ))}
      </ul>

      {(sp.attack || sp.save) && (
        <p className="note">
          {sp.attack ? `Spell attack ${signed(sp.attack.total)}.` : ""} {sp.save ? `DC ${sp.save.dc} ${ABILITY_NAMES[sp.save.ability]} save.` : ""}
        </p>
      )}

      {cast === null ? (
        <>
          {sp.ready === "not prepared" && <p className="warn">Not prepared today. You can still cast it if your DM allows.</p>}
          {readying && (
            <p className="note reminder">
              Readying {sp.name}: it's cast now (the slot is spent) and held with your concentration. Release it with your reaction when the trigger happens, before your next turn starts.
            </p>
          )}
          {times.length > 1 && (
            <div className="segmented small" role="tablist" aria-label="Casting time">
              {times.map((t) => (
                <button key={t} role="tab" aria-selected={time === t} onClick={() => setTime(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {altNow && (
            <p className={altNow.maxLevel !== undefined && (cast ?? sp.level) > altNow.maxLevel ? "warn" : "note"}>
              {altNow.label}: {altNow.maxLevel !== undefined ? `the spell and the slot of level ${altNow.maxLevel} or lower` : "as a bonus action"}
              {altNow.keepSlotOn ? `; then a d10, and on a ${altNow.keepSlotOn} the slot isn't spent` : ""}.
            </p>
          )}
          {sp.stores && <p className="note">Casting it stores it in an object (Thinking Stone). Nothing takes effect now: the effect and any dice come when someone uses the object.</p>}
          {casterSide && !readying && !sp.stores && <p className="note">Its tag goes on you to track it{casterDamage ? ": the extra damage is offered on your attacks" : ""}.</p>}
          {hasSelfEffect && !casterSide && !readying && !sp.stores && (
            <label className="row check" style={{ padding: "8px 0" }}>
              <input type="checkbox" checked={onMe} onChange={() => setOnMe(!onMe)} />
              <div className="row-main">
                <div className="row-title">Put its effect on me</div>
                <div className="row-sub">For spells you cast on yourself</div>
              </div>
            </label>
          )}
          {hasSelfEffect && !casterSide && !readying && !sp.stores && (companions?.length ?? 0) > 0 && (
            <div className="switches" aria-label="Put its effect on a companion" style={{ padding: "4px 0 8px" }}>
              <span className="row-sub" style={{ marginRight: 6 }}>
                On a companion too:
              </span>
              {companions!.map((cp) => {
                const on = onComps.includes(cp.id);
                // Already under this spell: a second casting adds nothing on it.
                if (cp.already)
                  return (
                    <button key={cp.id} className="chip" disabled title={`${cp.name} is already under ${sp.name}`}>
                      {cp.name} (already)
                    </button>
                  );
                return (
                  <button key={cp.id} className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => setOnComps(on ? onComps.filter((x) => x !== cp.id) : [...onComps, cp.id])}>
                    {cp.name}
                  </button>
                );
              })}
              {companions!
                .filter((cp) => onComps.includes(cp.id))
                .flatMap((cp) => cp.warnings ?? [])
                .map((w) => (
                  <p className="warn" role="alert" key={w} style={{ margin: "6px 0 0", width: "100%" }}>
                    {w}
                  </p>
                ))}
            </div>
          )}
          <div className="cast-options">
            {sp.level === 0 && (
              <button className="big primary" onClick={() => doCast(0, "none")}>
                Cast
              </button>
            )}
            {sp.level > 0 && sp.cast.atWill && (
              <button className="big primary" onClick={() => doCast(sp.level, "none")}>
                Cast at will
                <span className="sub">no slot needed</span>
              </button>
            )}
            {sp.cast.slotLevels.map((l) => (
              <button key={l} className={`big${l === sp.level ? " primary" : ""}`} onClick={() => doCast(l, "slot")}>
                {ordinal(l)} slot
                <span className="sub">{slotsLeft(l)} left</span>
              </button>
            ))}
            {sp.cast.pact && (
              <button className={`big${sp.cast.slotLevels.includes(sp.level) ? "" : " primary"}`} onClick={() => doCast(sp.cast.pact!.level, "pact")}>
                Pact slot
                <span className="sub">
                  {ordinal(sp.cast.pact.level)} level, {sp.cast.pact.remaining} left
                </span>
              </button>
            )}
            {sp.cast.charges?.options.map((o) => (
              <button key={`ch${o.level}`} className={sp.cast.charges!.remaining >= o.cost ? "big" : "big damage"} onClick={() => doCast(o.level, "charges")}>
                {ordinal(o.level)} level · {o.cost} {o.cost === 1 ? "charge" : "charges"}
                <span className="sub">
                  {sp.cast.charges!.item}: {sp.cast.charges!.remaining} left
                </span>
              </button>
            ))}
            {sp.cast.points && (
              <button className={sp.cast.points.remaining >= sp.cast.points.amount ? "big" : "big damage"} onClick={() => doCast(sp.level, "points")}>
                {sp.cast.points.amount} {sp.cast.points.name.toLowerCase()}
                <span className="sub">{sp.cast.points.remaining} left</span>
              </button>
            )}
            {sp.cast.free && (
              <button className={sp.cast.free.remaining > 0 ? "big" : "big damage"} onClick={() => doCast(sp.cast.free!.level ?? sp.level, "free")}>
                Free use
                <span className="sub">
                  {sp.cast.free.remaining} left{sp.cast.free.noConcentration && sp.concentration ? ", no concentration" : ""}
                </span>
              </button>
            )}
            {sp.cast.extra && (
              <button
                className={`big${sp.cast.extra.perLong !== undefined && sp.cast.extra.sinceLong >= sp.cast.extra.perLong ? " damage" : sp.cast.slotLevels.length ? "" : " primary"}`}
                onClick={() => doCast(sp.level, "extra")}
              >
                Without a slot
                <span className="sub">
                  {sp.cast.extra.perLong !== undefined ? `${Math.max(0, sp.cast.extra.perLong - sp.cast.extra.sinceLong)} of ${sp.cast.extra.perLong} left this long rest` : sp.cast.extra.tag}
                </span>
              </button>
            )}
            {sp.cast.scroll && (
              <button className="big primary" onClick={() => doCast(Math.max(sp.level, sp.cast.scroll!.level), "scroll")}>
                {sp.cast.scroll.stored ? "Use the object" : "Read the scroll"}
                <span className="sub">
                  {sp.cast.scroll.check ? `${ABILITY_NAMES[sp.cast.scroll.check.ability]} check DC ${sp.cast.scroll.check.dc} first · ` : ""}used up
                </span>
              </button>
            )}
            {sp.ritual && (
              <button className="big" onClick={() => doCast(sp.level, "ritual")}>
                As a ritual
                <span className="sub">+10 minutes, no slot</span>
              </button>
            )}
            {sp.ritual && sp.cast.fastRitual && (
              <button className={sp.cast.fastRitual.remaining > 0 ? "big" : "big damage"} onClick={() => doCast(sp.level, "fast-ritual")}>
                As a ritual, at its normal time
                <span className="sub">
                  {sp.cast.fastRitual.name} · {sp.cast.fastRitual.remaining > 0 ? "once per long rest" : "used: your DM's call"}
                </span>
              </button>
            )}
          </div>
          {sp.cast.extra && sp.cast.extra.perLong === undefined && (
            <p className="note">
              Cast without a slot {sp.cast.extra.sinceShort} {sp.cast.extra.sinceShort === 1 ? "time" : "times"} since your last short rest, {sp.cast.extra.sinceLong} since your last long rest.
              {sp.cast.slotLevels.length ? " Or spend a slot: your call." : ""}
            </p>
          )}
          {sp.cast.scroll && (
            <p className={`note${sp.cast.scroll.onList ? "" : " danger-text"}`}>
              {sp.cast.scroll.stored
                ? `Stored in an object${sp.cast.scroll.by ? ` by ${sp.cast.scroll.by}` : ""} (Thinking Stone): save DC ${sp.cast.scroll.dc}, attack +${sp.cast.scroll.attack}; anyone shown how can use it. It's used up.`
                : `From a spell scroll${sp.cast.scroll.by ? ` written by ${sp.cast.scroll.by}` : ""}: save DC ${sp.cast.scroll.dc}, attack +${sp.cast.scroll.attack}, no material components; it crumbles once read.`}
              {sp.cast.scroll.onList ? "" : " It isn't on your class's spell list: the scroll is unintelligible to you unless your DM says otherwise."}
            </p>
          )}
          {sp.level > 0 && sp.cast.slotLevels.length === 0 && !sp.cast.pact && !sp.cast.free && !sp.cast.points && !sp.cast.charges && !sp.ritual && !sp.cast.extra && !sp.cast.scroll && (
            <p className="note">No slots of this level. Use your feature or ask your DM.</p>
          )}
        </>
      ) : sp.stores ? (
        <>
          <p className="pass">{sp.name} is stored in an object.</p>
          <p className="note">Its effect comes when someone uses the object: it's in Items, and under "Stored in objects" on the Thinking Stone spells tab. Whoever holds it can use it once you've shown them how (1 minute).</p>
          <button className="link" onClick={() => setCast(null)}>
            Store it again
          </button>
        </>
      ) : (
        <>
          <p className="pass">
            Cast{sp.level > 0 ? ` at ${ordinal(cast || sp.level)} level` : ""}.{sp.concentration && (concentrating === undefined || concentrating === sp.id) ? " You're concentrating on it." : sp.concentration ? " No concentration this time." : ""}
          </p>
          <div className="big-actions">
            {sp.attack && (
              <button className="big primary" onClick={() => onRollAttack(cast)}>
                Roll attack
              </button>
            )}
            {(sp.damage || sp.heal) && !sp.attack && !sp.damage?.alt && (
              <button className="big primary" onClick={() => onRollDamage(cast)}>
                {sp.heal ? "Roll healing" : "Roll damage"}
                {sp.darts && <span className="sub">{sp.darts.dice} once, for all {sp.darts.byLevel[cast || sp.level]} {sp.darts.what}</span>}
              </button>
            )}
            {sp.damage?.alt && !sp.attack && (
              <>
                <button className="big primary" onClick={() => onRollDamage(cast)}>
                  Roll {sp.damage.byLevel[sp.level === 0 ? 0 : cast]}
                  <span className="sub">{sp.damage.label ?? "Damage"}</span>
                </button>
                <button className="big primary" onClick={() => onRollDamage(cast, true)}>
                  Roll {sp.damage.alt.byLevel[sp.level === 0 ? 0 : cast]}
                  <span className="sub">{sp.damage.alt.label}</span>
                </button>
              </>
            )}
          </div>
          <button className="link" onClick={() => setCast(null)}>
            Cast it again
          </button>
        </>
      )}

      {bookChecks ?? (sp.ready !== "always" && (
        <label className="row check" style={{ padding: "8px 0" }}>
          <input type="checkbox" checked={sp.ready === "prepared"} onChange={() => onPrepare(sp.ready !== "prepared")} />
          <div className="row-main">
            <div className="row-title">Prepared today</div>
          </div>
        </label>
      ))}

      <div className="spell-text">
        {sp.placeholder ? (
          <p className="note">
            {sp.summary} Full text: {sp.source}. Load your book files (Characters → Book text) to read it here.
          </p>
        ) : (
          <TextBlocks text={sp.text} />
        )}
        {sp.higherLevels.map((p, i) => (
          <p key={`h${i}`}>
            <b>At higher levels.</b> <RichText text={p} />
          </p>
        ))}
      </div>
    </>
  );
}
