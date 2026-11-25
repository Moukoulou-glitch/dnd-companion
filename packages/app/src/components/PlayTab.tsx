import { useState, type ReactNode } from "react";
import { NumberStep } from "./Adjust";
import { HitDiceRow } from "./HitDice";
import { KnotToken, ResourceToken, tokenLook, type TokenLook } from "./Tokens";
import { ShapeCard } from "./Shapes";
import { SummonsCard } from "./Summons";
import type { ContentRegistry, DerivedSheet, ResourceResult, ShapeKind } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Ability, type Character, type OperationType, type Skill } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { CombatCard, type EconomyKind, CompanionCard } from "./Combat";
import { registry } from "../content";
import { topSkills } from "../glance";

const ALIGNMENTS: Record<string, string> = {
  LG: "Lawful good",
  NG: "Neutral good",
  CG: "Chaotic good",
  LN: "Lawful neutral",
  N: "Neutral",
  TN: "Neutral",
  CN: "Chaotic neutral",
  LE: "Lawful evil",
  NE: "Neutral evil",
  CE: "Chaotic evil",
};

/** Race, background, alignment, and size and creature type, in one line; background, alignment and creature can be changed. */
function Identity({ c, size: now, onBackground, onIdentity, children }: { c: Character; size?: DerivedSheet["size"]; onBackground: () => void; onIdentity: () => void; children?: ReactNode }) {
  const race = registry.find(c.race, "race");
  const bg = c.background ? registry.find(c.background, "background") : undefined;
  const cap = (s: string) => s.replace(/^./, (x) => x.toUpperCase());
  const size = c.size ?? race?.size ?? "medium";
  const type = c.creatureType ?? race?.creatureType ?? "humanoid";
  const parts: [string, string, (() => void) | undefined][] = [
    ["Race", race?.name ?? c.race, undefined],
    ["Background", c.background === "background:custom" ? `${c.customBackground?.name || "You don't know me!"} (custom)` : bg?.name ?? "none", onBackground],
    ["Alignment", c.alignment ? ALIGNMENTS[c.alignment.toUpperCase()] ?? c.alignment : "not set", onIdentity],
    // Your size now when something changed it (Giant's Might, Enlarge): "Large humanoid (Giant's Might; normally Medium)".
    ["Creature", now && now.now !== size ? `${cap(now.now)} ${type} (${now.why.map((w) => w.split(":")[0]).join(", ")}; normally ${cap(size)})` : `${cap(size)} ${type}`, onIdentity],
  ];
  return (
    <section className="identity" aria-label="Who you are">
      {parts.map(([k, v, on]) =>
        on ? (
          <button key={k} className="identity-edit" onClick={on} aria-label={`${k}: ${v}. Change it`}>
            <span className="identity-label">{k} ✎</span>
            <span className="identity-value">{v}</span>
          </button>
        ) : (
          <div key={k}>
            <span className="identity-label">{k}</span>
            <span className="identity-value">{v}</span>
          </div>
        ),
      )}
      {children}
    </section>
  );
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const SHORT: Record<Ability, string> = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

/**
 * At a glance on Play, under who you are: classes and levels, your DCs, the three passive senses, the six saves
 * and three skills to roll (the ones you picked, or the ones you roll most).
 */
function Glance({ c, sheet, rolls, act, onSave, onSkill }: { c: Character; sheet: DerivedSheet; rolls: RollRecord[]; act: Act; onSave: (ab: Ability) => void; onSkill: (sk: Skill) => void }) {
  const [picking, setPicking] = useState(false);
  const classes = c.classes
    .map((cl) => {
      const name = registry.find(cl.class, "class")?.name ?? cl.class;
      const sub = cl.subclass ? registry.find(cl.subclass, "subclass")?.name : undefined;
      return `${name} ${cl.level}${sub ? ` (${sub})` : ""}`;
    })
    .join(" · ");
  const dcs = [
    ...sheet.spellcasting.map((sc) => ({ key: `sc-${sc.id}`, name: sc.label, text: `DC ${sc.saveDc.total} · attack ${sign(sc.attack.total)}` })),
    ...[...new Map(sheet.actions.filter((a) => a.dc).map((a) => [`${a.dc!.name}|${a.dc!.value}|${a.dc!.save}`, a] as const)).values()].map((a) => ({
      key: `a-${a.id}`,
      name: a.dc!.name || a.name,
      text: `DC ${a.dc!.value} ${a.dc!.save.slice(0, 3).replace(/^./, (x) => x.toUpperCase())}`,
    })),
  ];
  const picked = c.settings.playSkills;
  const skills = picked?.length ? picked : topSkills(sheet, rolls);
  const toggle = (sk: Skill) => {
    const now = picked?.length ? picked : [];
    const next = now.includes(sk) ? now.filter((x) => x !== sk) : now.length >= 3 ? now : [...now, sk];
    act("setField", { path: ["settings", "playSkills"], value: next }, next.length ? `Skills on Play: ${next.map((x) => SKILL_NAMES[x]).join(", ")}.` : "Skills on Play: the ones you roll most.");
  };
  return (
    <div className="glance" aria-label="At a glance" role="group">
      {classes && (
        <div className="glance-row">
          <span className="identity-label">Classes</span>
          <span className="identity-value">{classes}</span>
        </div>
      )}
      {dcs.length > 0 && (
        <div className="glance-row">
          <span className="identity-label">DCs</span>
          <div className="glance-chips">
            {dcs.map((d) => (
              <span key={d.key} className="glance-chip">
                <b>{d.text}</b> {d.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="glance-row">
        <span className="identity-label">Passive</span>
        <div className="glance-passives">
          {(["perception", "investigation", "insight"] as const).map((k) => (
            <span key={k} className="glance-passive">
              <b>{sheet.passives[k].total}</b>
              {SKILL_NAMES[k]}
            </span>
          ))}
        </div>
      </div>
      <div className="glance-row">
        <span className="identity-label">Saving throws</span>
        <div className="glance-buttons">
          {ABILITIES.map((ab) => (
            <button key={ab} className={`glance-roll${sheet.saves[ab].proficient ? " prof" : ""}`} onClick={() => onSave(ab)} aria-label={`Roll a ${ABILITY_NAMES[ab]} saving throw, ${sign(sheet.saves[ab].total)}`}>
              <small>{SHORT[ab]}</small>
              <b>{sign(sheet.saves[ab].total)}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="glance-row">
        <span className="identity-label">
          Skills{" "}
          <button className="link glance-pick" onClick={() => setPicking(!picking)} aria-label="Choose the skills shown here">
            {picking ? "done" : "✎"}
          </button>
        </span>
        {picking ? (
          <div className="glance-chips">
            <p className="note" style={{ margin: "0 0 6px", width: "100%" }}>
              Pick up to 3.{" "}
              {picked?.length ? (
                <button className="link" onClick={() => act("setField", { path: ["settings", "playSkills"], value: [] }, "Skills on Play: the ones you roll most.")}>
                  Show the ones I roll most
                </button>
              ) : (
                "Until you pick, the ones you roll most are shown."
              )}
            </p>
            {SKILLS.map((sk) => (
              <button key={sk} className="chip" aria-pressed={!!picked?.includes(sk)} onClick={() => toggle(sk)}>
                {SKILL_NAMES[sk]} {sign(sheet.skills[sk].total)}
              </button>
            ))}
          </div>
        ) : (
          <div className="glance-buttons">
            {skills.map((sk) => (
              <button key={sk} className={`glance-roll wide${sheet.skills[sk].proficiency ? " prof" : ""}`} onClick={() => onSkill(sk)} aria-label={`Roll ${SKILL_NAMES[sk]}, ${sign(sheet.skills[sk].total)}`}>
                <small>{SKILL_NAMES[sk]}</small>
                <b>{sign(sheet.skills[sk].total)}</b>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;
const TYPES = ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"];

/** Alignment, size and creature type: the race's unless changed here. */
export function IdentityPanel({ c, act }: { c: Character; act: (type: OperationType, payload: unknown, label: string) => unknown }) {
  const race = registry.find(c.race, "race");
  const cap = (s: string) => s.replace(/^./, (x) => x.toUpperCase());
  return (
    <>
      <h2 className="sub-head">Alignment</h2>
      <div className="types wrap" role="radiogroup" aria-label="Alignment">
        {Object.entries(ALIGNMENTS).filter(([k]) => k !== "TN").map(([k, v]) => (
          <button key={k} className="switch" role="radio" aria-checked={c.alignment?.toUpperCase() === k} aria-pressed={c.alignment?.toUpperCase() === k} onClick={() => act("setDetails", { alignment: k }, `Alignment: ${v}.`)}>
            {v}
          </button>
        ))}
        <button className="switch" aria-pressed={c.alignment === "Unaligned"} onClick={() => act("setDetails", { alignment: "Unaligned" }, "Alignment: unaligned.")}>
          Unaligned
        </button>
      </div>
      <h2 className="sub-head">Size</h2>
      <div className="types wrap" role="radiogroup" aria-label="Size">
        {SIZES.map((z) => (
          <button key={z} className="switch" aria-pressed={(c.size ?? race?.size) === z} onClick={() => act("setDetails", { size: z === race?.size ? null : z }, `Size: ${z}.`)}>
            {cap(z)}
          </button>
        ))}
      </div>
      <h2 className="sub-head">Creature type</h2>
      <div className="types wrap" role="radiogroup" aria-label="Creature type">
        {TYPES.map((t) => (
          <button key={t} className="switch" aria-pressed={(c.creatureType ?? race?.creatureType ?? "humanoid") === t} onClick={() => act("setDetails", { creatureType: t === (race?.creatureType ?? "humanoid") ? null : t }, `Creature type: ${t}.`)}>
            {t}
          </button>
        ))}
      </div>
      <p className="note">Your race gives {race?.size ?? "medium"} {race?.creatureType ?? "humanoid"}; picking that again goes back to it.</p>
    </>
  );
}

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

/** Questions the Play tab asks before spending or restoring (handled by the app shell). */
export interface PlayPrompts {
  spendResource: (r: ResourceResult) => void;
  spendSlot: (level: number, pact: boolean) => void;
  /** Restoring anything by hand asks first. */
  restore: (what: string, run: () => void) => void;
  rest: (kind: "short" | "long") => void;
  rollPool: (r: ResourceResult) => void;
  /** Type how many are left (Lay on Hands' points, Ki): set by hand. */
  setLeft: (r: ResourceResult) => void;
}

function Pips({ total, used, onSpend, onRestore, kind, name, die, level, pact, look, origin }: {
  /** Where a feature's use comes from: its token's frame (a cleric's amulet, a rogue's coin). */
  origin?: string;
  /** A spell slot's level: its knot has that many loops. */
  level?: number;
  pact?: boolean;
  /** A feature's token: its sign and colours. */
  look?: TokenLook;
  /** Each use is a die (Superiority d8, Second Wind d10): shown on the pips. */
  die?: string;
  total: number;
  used: number;
  onSpend: () => void;
  onRestore: () => void;
  kind?: "slot";
  name: string;
}) {
  // Big pools (Lay on Hands, Ki at high level) as a counter instead of a row of circles.
  if (total > 12)
    return (
      <div className="stepper pool-count">
        <button aria-label={`Spend one ${name}`} disabled={used >= total} onClick={onSpend}>
          −
        </button>
        <span>
          {total - used}
          <small>/{total}</small>
          {die && <small> {die}</small>}
        </span>
        <button aria-label={`Get back one ${name}`} disabled={used === 0} onClick={onRestore}>
          +
        </button>
      </div>
    );
  return (
    <div className={`pips${total > 5 ? " wide" : ""}`}>
      {Array.from({ length: total }, (_, i) => {
        const spent = i >= total - used;
        return (
          <button
            key={i}
            className={`pip${kind === "slot" ? (level ? " knot-pip" : " slot") : look ? " token-pip" : die ? " die" : ""}`}
            data-spent={spent}
            aria-label={spent ? `Get back one ${name}` : `Spend one ${name}${die ? ` (${die})` : ""}`}
            onClick={spent ? onRestore : onSpend}
          >
            {kind === "slot" && level ? <KnotToken level={level} spent={spent} {...(pact ? { pact } : {})} /> : look ? <ResourceToken look={look} spent={spent} {...(die ? { die } : {})} {...(origin ? { origin } : {})} /> : die}
          </button>
        );
      })}
    </div>
  );
}

export function PlayTab({
  character,
  sheet,
  act,
  openHp,
  openHitDie,
  rolls,
  openRollHistory,
  onStartCombat,
  openMove,
  openCompanion,
  openCompanionBuilder,
  onTimedDone,
  onTimedInterrupt,
  backup,
  openRangersCompanion,
  prompts,
  onInitiative,
  openDeathSave,
  openStable,
  onDeathSavesMarked,
  openBackground,
  openIdentity,
  openShape,
  openTransform,
  openLimited,
  onEconomyMenu,
  spendReaction,
  openSummonGroup,
  reg,
  openSave,
  openSkill,
}: {
  /** Roll a saving throw or a skill check (the Composer). */
  openSave: (ab: Ability) => void;
  openSkill: (sk: Skill) => void;
  openShape: () => void;
  openLimited: (actionId: string) => void;
  onEconomyMenu: (kind: EconomyKind) => void;
  spendReaction: () => void;
  openSummonGroup: (group: string) => void;
  reg: ContentRegistry;
  openTransform: (kind: ShapeKind) => void;
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  openHp: () => void;
  openHitDie: (die: string) => void;
  rolls: RollRecord[];
  openRollHistory: () => void;
  onStartCombat: () => void;
  openMove: () => void;
  openCompanion: (id: string) => void;
  /** The Companion Builder: a companion of your own. */
  openCompanionBuilder: () => void;
  /** A ritual or a long casting under way: it's done, or it was broken off. */
  onTimedDone: () => void;
  onTimedInterrupt: () => void;
  /** A full backup is due (see backup.ts): how long since the last one, and what to do. Never shown in combat. */
  backup?: { days?: number; onBackup: () => void; onLater: () => void };
  /** Beast Master (Ranger's Companion): pick the beast it bonds with. */
  openRangersCompanion: () => void;
  prompts: PlayPrompts;
  onInitiative: () => void;
  /** A death saving throw: tap the d20 or let the app roll. */
  openDeathSave: () => void;
  /** At 0 HP: tell the app you're stable (how, then the 1d4 hours). */
  openStable: (how?: string) => void;
  /** After marking death saves by hand: the third success asks for the hours. */
  onDeathSavesMarked: (prompts: unknown) => void;
  /** Choose another background. */
  openBackground: () => void;
  /** Alignment, size and creature type. */
  openIdentity: () => void;
}) {
  const down = character.hp.current === 0;
  // Stable at 0 HP: the effect counting down to 1 HP.
  const stable = down ? character.effects.find((e) => e.effect === "other:stable") : undefined;
  const slotsUsed = (level: number) => character.slotsUsed[String(level)] ?? 0;

  return (
    <main>
      <Identity c={character} size={sheet.size} onBackground={openBackground} onIdentity={openIdentity}>
        <Glance c={character} sheet={sheet} rolls={rolls} act={act} onSave={openSave} onSkill={openSkill} />
      </Identity>

      {backup && !character.combat && (
        <section className="timed-card backup-card">
          <div className="row">
            <div className="row-main">
              <div className="row-title">Back up your characters</div>
              <div className="row-sub">
                They're saved only in this browser, which can lose them (cleared data, a new phone).{" "}
                {backup.days === undefined ? "No full backup from this device yet." : `Last full backup: ${backup.days} days ago.`}
              </div>
            </div>
          </div>
          <div className="big-actions">
            <button className="big primary" onClick={backup.onBackup}>
              Back up now
              <span className="sub">one file with every character</span>
            </button>
            <button className="big" onClick={backup.onLater}>
              Later
              <span className="sub">ask again in a week</span>
            </button>
          </div>
        </section>
      )}

      {character.timed && (
        <section className="timed-card">
          <div className="row">
            <div className="row-main">
              <div className="row-title">{character.timed.name}: under way</div>
              <div className="row-sub">
                Takes {character.timed.minutes >= 60 ? `${+(character.timed.minutes / 60).toFixed(1)} hours` : `${character.timed.minutes} minutes`}
                {character.timed.cast && character.timed.cast.using !== "ritual" ? "; its slot is spent when it's done" : ""}.
              </div>
            </div>
          </div>
          <div className="big-actions">
            <button className="big primary" onClick={onTimedDone}>
              Done
              <span className="sub">the time passes, then it takes effect</span>
            </button>
            <button className="big" onClick={onTimedInterrupt}>
              Interrupted
              <span className="sub">nothing spent</span>
            </button>
          </div>
        </section>
      )}

      <CombatCard reg={reg} character={character} sheet={sheet} act={act} onStartCombat={onStartCombat} openMove={openMove} onInitiative={onInitiative} onLimited={openLimited} onMenu={onEconomyMenu} spendReaction={spendReaction} />

      <ShapeCard sheet={sheet} onOpen={openShape} onTransform={openTransform} />
      <SummonsCard character={character} reg={reg} onOpen={openSummonGroup} />

      {sheet.features.some((f) => f.id === "feature:rangers-companion") && !character.customCompanions.some((x) => x.bond === "rangers-companion") && (
        <button className="big wide" onClick={openRangersCompanion}>
          Choose your Ranger's Companion
          <span className="sub">a beast of Medium size or smaller, CR 1/4 or lower</span>
        </button>
      )}
      {sheet.companions.length > 0 ? (
        <section>
          <h2>{sheet.companions.length > 1 ? "Companions" : "Companion"}</h2>
          <div className="group">
            {sheet.companions.map((comp) => (
              <CompanionCard key={comp.id} comp={comp} onOpen={() => openCompanion(comp.id)} rangerLevel={character.classes.find((x) => x.class === "class:ranger")?.level ?? 0} />
            ))}
          </div>
          <button className="link" onClick={openCompanionBuilder}>
            + Another companion
          </button>
        </section>
      ) : (
        <button className="link" onClick={openCompanionBuilder}>
          + A companion of your own (pet, mount, hireling)
        </button>
      )}

      {!character.combat && sheet.effects.some((e) => e.rounds !== undefined) && (
        <button className="big wide" onClick={() => act("endTurn", {}, "Turn ended.")}>
          End of my turn
          <span className="sub">
            {sheet.effects
              .filter((e) => e.rounds !== undefined)
              .map((e) => `${e.name} ${e.rounds}`)
              .join(", ")}{" "}
            rounds left
          </span>
        </button>
      )}

      <section>
        <h2>Death saving throws</h2>
        <div className={`group death-saves${down ? " down" : ""}`}>
          {(["successes", "failures"] as const).map((k) => {
            const n = character.deathSaves[k];
            const set = (v: number) => {
              const prompts = act("setDeathSaves", { ...character.deathSaves, [k]: v }, `${k === "successes" ? "Successes" : "Failures"}: ${v}.`);
              if (k === "successes" && v === 3) onDeathSavesMarked(prompts);
            };
            return (
              <div className="row" key={k}>
                <div className="row-main">
                  <div className="row-title">{k === "successes" ? "Successes" : "Failures"}</div>
                </div>
                <div className="ds-marks" role="group" aria-label={k}>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      className={`ds-mark ${k}${i < n ? " on" : ""}`}
                      aria-label={i < n ? `Clear ${k === "successes" ? "success" : "failure"} ${i + 1}` : `Mark ${k === "successes" ? "success" : "failure"} ${i + 1}`}
                      onClick={() => set(i < n ? i : i + 1)}
                    >
                      {k === "successes" ? (
                        // A heart: hollow until the save is made, then it beats.
                        <svg viewBox="0 0 32 32" aria-hidden="true">
                          <path className="ds-heart" d="M16 27 C9 21 4 17 4 11.5 C4 7.6 7 5 10.4 5 C12.8 5 14.8 6.4 16 8.4 C17.2 6.4 19.2 5 21.6 5 C25 5 28 7.6 28 11.5 C28 17 23 21 16 27 Z" />
                          <path className="ds-shine" d="M9 10.5 C9.4 9 10.6 8 12 8" />
                        </svg>
                      ) : (
                        // A skull: a pale outline until the save fails, then bone with red-lit eyes.
                        <svg viewBox="0 0 32 32" aria-hidden="true">
                          <path className="ds-skull" d="M16 3.5 C9.6 3.5 5.5 8 5.5 13.6 C5.5 17.2 7.2 19.6 9.6 21 V25.5 H12.6 V23.4 H14.4 V26 H17.6 V23.4 H19.4 V25.5 H22.4 V21 C24.8 19.6 26.5 17.2 26.5 13.6 C26.5 8 22.4 3.5 16 3.5 Z" />
                          <path className="ds-eye" d="M9.8 13.8 C9.8 11.8 11.6 11 13 11.8 C14.2 12.6 14 14.8 12.6 15.8 C11.2 16.6 9.8 15.6 9.8 13.8 Z M22.2 13.8 C22.2 11.8 20.4 11 19 11.8 C17.8 12.6 18 14.8 19.4 15.8 C20.8 16.6 22.2 15.6 22.2 13.8 Z" />
                          <path className="ds-nose" d="M16 16.6 L14.8 19.2 H17.2 Z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="row">
            <div className="row-main">
              <div className="row-sub">
                {down
                  ? "At 0 HP: roll at the start of each turn. 10 or higher succeeds; a 1 counts twice; a 20 brings you back with 1 HP. Damage at 0 HP is a failure (a critical, two)."
                  : "At 0 HP you roll these at the start of each turn."}
              </div>
            </div>
          </div>
          {stable && (
            <div className="row stable-row" role="status">
              <div className="row-main">
                <div className="row-title">Stable{stable.from ? `: ${stable.from}` : ""}</div>
                <div className="row-sub">
                  {stable.minutes !== undefined
                    ? `Unconscious, no death saves. 1 HP in ${stable.minutes >= 60 ? `${Math.floor(stable.minutes / 60)} h${stable.minutes % 60 ? ` ${stable.minutes % 60} min` : ""}` : `${stable.minutes} min`} unless you're healed sooner; "Time passes" and rests count it down. Damage starts the death saves again.`
                    : "Unconscious, no death saves. Roll 1d4 for the hours until you regain 1 HP."}
                </div>
              </div>
              {stable.minutes === undefined && (
                <button className="tag" onClick={() => openStable(stable.from)}>
                  Roll 1d4
                </button>
              )}
            </div>
          )}
          <div className="big-actions" style={{ padding: "0 10px 10px" }}>
            {!stable && (
              <button className={`big${down ? " primary" : ""}`} onClick={openDeathSave}>
                Roll a death save
              </button>
            )}
            {down && !stable && (
              <button className="big" onClick={() => openStable()}>
                I'm stable
              </button>
            )}
            {(character.deathSaves.successes > 0 || character.deathSaves.failures > 0) && (
              <button className="big" onClick={() => act("setDeathSaves", { successes: 0, failures: 0 }, "Death saves cleared.")}>
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {rolls.length > 0 && (
        <section>
          <h2>Recent rolls</h2>
          <div className="group">
            {rolls.slice(0, 3).map((r) => (
              <button className="row" key={r.id} onClick={openRollHistory}>
                <div className="row-main">
                  <div className="row-title">{r.title}</div>
                  <div className="row-sub">
                    {r.crit ? "Critical. " : r.fumble ? "Natural 1. " : ""}
                    {r.physical ? "Your dice" : "App roll"}
                  </div>
                </div>
                <span className={`num${r.crit ? " crit-text" : r.fumble ? " danger-text" : ""}`}>{r.total}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sheet.resources.length > 0 && (
        <section>
          <h2>Features</h2>
          <div className="group">
            {sheet.resources.map((r) => (
              <div className="row" key={r.id}>
                <div className="row-main">
                  <div className="row-title">{r.name}</div>
                  <div className="row-sub">
                    {r.unlimited ? (
                      `${r.remaining} of ${r.max}`
                    ) : (
                      <button className="count-edit" onClick={() => prompts.setLeft(r)} aria-label={`${r.name}: type how many are left`}>
                        {r.remaining} of {r.max} ✎
                      </button>
                    )}
                    {r.die ? ` ${r.die}` : ""}
                    {r.effect ? ` · ${r.effect}` : ""} · {r.unlimited ? `unlimited (${r.unlimited})` : resetLabel(r.reset)}
                  </div>
                  {r.pool && r.remaining > 0 && (
                    <div className="pool">
                      {r.pool.values.length > 0 ? (
                        r.pool.values.map((v, i) => (
                          <span key={i} className="pool-value">
                            {v}
                          </span>
                        ))
                      ) : (
                        <button className="tag adv" onClick={() => prompts.rollPool(r)}>
                          Roll your {r.remaining} d{r.pool.sides}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <Pips
                  name={r.name}
                  look={tokenLook(r, sheet.actions)}
                  {...(r.origin ? { origin: r.origin } : {})}
                  {...(r.die && !r.pool ? { die: r.die } : {})}
                  total={r.max}
                  used={r.used}
                  onSpend={() => prompts.spendResource(r)}
                  onRestore={() => prompts.restore(r.name, () => act("restoreResource", { resource: r.id }, `${r.name} restored.`))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {(sheet.spellSlots.length > 0 || sheet.pactSlots) && (
        <section>
          <h2>Spell slots</h2>
          <div className="group">
            {sheet.spellSlots.map((s) => (
              <div className="row" key={s.level}>
                <div className="row-main">
                  <div className="row-title">Level {s.level}</div>
                  <div className="row-sub">
                    {s.total - slotsUsed(s.level)} of {s.total} left
                  </div>
                </div>
                <Pips
                  kind="slot"
                  level={s.level}
                  name={`level ${s.level} slot`}
                  total={s.total}
                  used={slotsUsed(s.level)}
                  onSpend={() => prompts.spendSlot(s.level, false)}
                  onRestore={() => prompts.restore(`a level ${s.level} spell slot`, () => act("restoreSlot", { level: s.level }, `Level ${s.level} slot restored.`))}
                />
              </div>
            ))}
            {sheet.pactSlots && (
              <div className="row">
                <div className="row-main">
                  <div className="row-title">Pact Magic, level {sheet.pactSlots.level}</div>
                  <div className="row-sub">Back on a short rest</div>
                </div>
                <Pips
                  kind="slot"
                  level={sheet.pactSlots.level}
                  pact
                  name="Pact Magic slot"
                  total={sheet.pactSlots.count}
                  used={character.pactSlotsUsed}
                  onSpend={() => prompts.spendSlot(sheet.pactSlots!.level, true)}
                  onRestore={() => prompts.restore("a Pact Magic slot", () => act("restoreSlot", { level: sheet.pactSlots!.level, pact: true }, "Pact slot restored."))}
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Inspiration</h2>
        <div className="group">
          <div className="row hit-dice-row">
            <div className="row-main">
              <div className="row-title">Inspiration</div>
              <div className="row-sub">
                {character.inspirations ?? 0} of 10 · hold one to spend it, hold a grey one when the DM gives you one
              </div>
            </div>
            <HitDiceRow
              die="d20"
              total={10}
              used={10 - (character.inspirations ?? 0)}
              tone="gold"
              what="Inspiration"
              hintText="Hold a golden die to spend it (advantage on one attack, save or check), or hold a grey one when you're given one. Rolls also offer it."
              onSpend={() => act("setInspiration", { count: Math.max(0, (character.inspirations ?? 0) - 1) }, "Inspiration spent: advantage on one attack roll, saving throw or ability check.")}
              onRestore={() => act("setInspiration", { count: Math.min(10, (character.inspirations ?? 0) + 1) }, "Inspiration gained.")}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>Rest</h2>
        <div className="group">
          {sheet.hitDice.map((h) => (
            <div className="row hit-dice-row" key={h.die}>
              <div className="row-main">
                <div className="row-title">Hit Dice {h.die}</div>
                <div className="row-sub">
                  {h.total - (character.hitDiceUsed[h.die] ?? 0)} of {h.total} left · hold one to spend it
                </div>
              </div>
              <HitDiceRow
                die={h.die}
                total={h.total}
                used={character.hitDiceUsed[h.die] ?? 0}
                onSpend={() => openHitDie(h.die)}
                onRestore={() => prompts.restore(`a ${h.die} Hit Die`, () => act("restoreHitDie", { die: h.die }, `A ${h.die} Hit Die is back.`))}
              />
            </div>
          ))}
        </div>
        <div className="big-actions" style={{ marginTop: 10 }}>
          <button className={`big${(character.shortRests ?? 0) >= 3 ? " warn" : ""}`} onClick={() => prompts.rest("short")}>
            Short rest
            <span className="sub">{character.shortRests ?? 0} of 3 since your long rest</span>
          </button>
          <button className="big" onClick={() => prompts.rest("long")}>
            Long rest
          </button>
        </div>
        <TimePasses act={act} />
      </section>
    </main>
  );
}

/** Time passing outside a rest: timers count down, and the in-world clock moves (when rests move it). Hours typed too. */
function TimePasses({ act }: { act: Act }) {
  // Other: a stepper for the hours (typed or −/+), then one clear button.
  const [other, setOther] = useState<number | null>(null);
  const pass = (minutes: number, label: string) => act("passTime", { minutes }, `${label} pass${minutes === 60 || minutes === 10 ? "es" : ""}.`);
  return (
    <>
    <div className="time-passes">
      <span>Time passes</span>
      <button className="tag" onClick={() => pass(10, "10 minutes")}>
        10 min
      </button>
      <button className="tag" onClick={() => pass(60, "An hour")}>
        1 hour
      </button>
      <button className="tag" onClick={() => pass(120, "2 hours")}>
        2 hours
      </button>
      <button className="tag" onClick={() => pass(240, "4 hours")}>
        4 hours
      </button>
      <button className="tag" onClick={() => pass(480, "8 hours")}>
        8 hours
      </button>
      <button className="tag" aria-pressed={other !== null} onClick={() => setOther(other === null ? 1 : null)}>
        Other…
      </button>
    </div>
    {other !== null && (
      <div className="time-other">
        <div className="group">
          <NumberStep label="Hours that passed" value={other} min={1} max={720} onChange={setOther} />
        </div>
        <button
          className="big primary wide"
          onClick={() => {
            pass(other * 60, `${other} hour${other === 1 ? "" : "s"}`);
            setOther(null);
          }}
        >
          Let {other} hour{other === 1 ? "" : "s"} pass
        </button>
      </div>
    )}
    </>
  );
}

function resetLabel(reset: string): string {
  return { short: "short rest", long: "long rest", dawn: "dawn", manual: "reset by hand" }[reset] ?? reset;
}
