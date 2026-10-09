import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { buildItems, castingEconomy, creatureSpellRoll, formatBonus, summonBlock, materialNeed, maxSpellLevel, newCharacter, spellListOf, signed, turnWarnings, type TurnIntent } from "@dnd/engine";
import { ABILITY_NAMES, SKILL_NAMES, type Character, type Skill } from "@dnd/schema";
import { roll as rollDice, type ComposerBase } from "@dnd/dice";
import { ShapePanel, TransformPanel } from "./components/Shapes";
import { SummonGroupPanel, SummonMemberPanel, SummonPicker, SummonSpellPanel, type SpellSource } from "./components/Summons";
import type { ShapeKind } from "@dnd/engine";
import type { ActionResult, EffectResult, SpellResult, WeaponAttack } from "@dnd/engine";
import { ActionsTab } from "./components/ActionsTab";
import { CompanionPanel, MovePanel } from "./components/Combat";
import { SwipeAway } from "./components/Swipe";
import { ConditionLinks, RichText } from "./components/Conditions";
import { Composer, ResultView, type OptionInfo } from "./components/Composer";
import { AddEffectPanel, EffectChips, EffectPanel } from "./components/Effects";
import { FeaturePanel } from "./components/FeaturePanel";
import { DcBig, Reminders } from "./components/DcBig";
import { DistributePanel } from "./components/Distribute";
import { RollAdjustPanel } from "./components/RollAdjust";
import { DurablePanel } from "./components/Durable";
import { BackstoryTab } from "./components/BackstoryTab";
import { CUSTOM_BG, CustomBackgroundWizard } from "./components/CustomBackground";
import { HpPad } from "./components/HpPad";
import { AbilityAdjustPanel, MaxHpPanel, SummonMaxHp } from "./components/Adjust";
import { DamageReducePanel } from "./components/Monk";
import { BackgroundPicker } from "./components/BackgroundPicker";
import { AddExtraPanel, ExtraEditor, ExtraInline, skillExtra } from "./components/Extras";
import { AddItemPanel, CoinPanel, InventoryTab, ItemPanel } from "./components/InventoryTab";
import { bookReport, registry } from "./content";
import { BookText, BooksPanel } from "./components/BookText";
import { BuildPanel, LevelUpPanel, NewCharacterPanel, type NewCharacterInput } from "./components/Builder";
import { flashEnabled, flashForFeature, flashForSpell, flashTorch, setFlashEnabled } from "./flash";
import { PlayTab, type PlayPrompts } from "./components/PlayTab";
import { Choose, Confirm, PoolRollPanel, SlotSpendPanel, SpendDiePanel } from "./components/Prompts";
import { BottomSheet, BreakdownLines } from "./components/Sheet";
import { SheetTab } from "./components/SheetTab";
import { SpellPanel, SpellsTab, spellAsAttack, type ClassList } from "./components/SpellsTab";
import { useCharacters } from "./useCharacters";
import { formatMinutes } from "./time";
import { vibrateFor, type HpState } from "./vibrate";

type Tab = "play" | "actions" | "spells" | "sheet" | "inventory" | "story";

interface GrowingArea {
  question: string;
  what: string;
  /** Creatures counted at least (you; or you and whoever started it). */
  min: number;
  /** Feet of radius per creature that used it. */
  per: number;
  /** The tag it leaves on you, with the radius as its choice. */
  effect?: string;
  detail: (total: number) => string;
}
/** Areas that grow with every creature that joins (Charm of Sunlight): how many in total, and the radius. */
const GROWING_AREAS: Record<string, GrowingArea> = {
  "charm-of-sunlight": {
    question: "How many creatures used their Charm in total, you included? Allies within 60 ft who earned it with you can join with their reaction.",
    what: "Sphere of sunlight",
    min: 1,
    per: 10,
    effect: "other:charm-of-sunlight",
    detail: (n) => (n > 1 ? `Each of the ${n - 1} who joined gets a crown of light of their own that moves with them.` : "Just your crown of light."),
  },
  "charm-of-sunlight-join": {
    question: "How many creatures used their Charm in total, the one who started it and you included?",
    what: "Sphere of sunlight",
    min: 2,
    per: 10,
    effect: "other:charm-of-sunlight",
    detail: () => "You get a crown of light of your own that moves with you.",
  },
};
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "actions", label: "Actions" },
  { id: "spells", label: "Spells" },
  { id: "sheet", label: "Sheet" },
  { id: "inventory", label: "Items" },
  { id: "story", label: "Backstory" },
];

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
}

export function App() {
  const s = useCharacters();
  // Panels opened earlier read the latest state through this ref, never a stale copy.
  const live = useRef(s);
  const growJoin = useRef(0);
  live.current = s;
  const [tab, setTab] = useState<Tab>("play");
  // A panel's body is rendered on every app render, so it always shows the current character.
  // Panels stack: a condition opened from inside another panel goes back to it when closed.
  const [panels, setPanels] = useState<{ title: string; body: ReactNode | (() => ReactNode) }[]>([]);
  const panel = panels.at(-1) ?? null;
  const open = useCallback((title: string, body: ReactNode | (() => ReactNode)) => setPanels([{ title, body }]), []);
  const push = useCallback((title: string, body: ReactNode | (() => ReactNode)) => setPanels((p) => [...p, { title, body }]), []);
  const close = useCallback(() => setPanels([]), []);
  const back = useCallback(() => setPanels((p) => p.slice(0, -1)), []);

  // The phone buzzes when the character drops below half, to 0, or dies.
  const hpState = useRef<HpState | undefined>(undefined);
  useEffect(() => {
    if (!s.character || !s.sheet) return;
    const now: HpState = { id: s.character.id, hp: s.character.hp.current, max: s.sheet.hpMax.total, failures: s.character.deathSaves.failures };
    vibrateFor(hpState.current, now);
    hpState.current = now;
  }, [s.character, s.sheet]);

  // Toasts disappear after a few seconds; undo stays reachable in the meantime.
  useEffect(() => {
    if (!s.toast) return;
    const t = setTimeout(() => s.setToast(null), 6000);
    return () => clearTimeout(t);
  }, [s.toast, s.setToast]);

  if (!s.ready) return null;
  if (s.error && !s.character) return <p style={{ padding: 16 }}>{s.error}</p>;
  if (!s.character || !s.sheet) return <Welcome create={s.create} readImport={s.readImport} deleted={s.deleted} restore={s.restore} purge={s.purge} />;

  const { character: c, sheet } = s;

  /**
   * Checks what the player is about to do against the turn's rules. With no
   * problems it goes ahead at once; otherwise it lists them and offers
   * "Use anyway". It never blocks. `back` reopens the panel the warning
   * replaced: cancelled, or after going ahead.
   */
  const guard = (intent: TurnIntent, proceed: () => void, back?: { cancelled?: () => void; done?: () => void }): boolean => {
    const cur = live.current;
    const warnings = cur.character && cur.sheet ? turnWarnings(cur.character, cur.sheet, intent) : [];
    if (!warnings.length) {
      proceed();
      return true;
    }
    open(intent.name, () => (
      <>
        <p className="sub-head">Before you do that</p>
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="big-actions">
          <button className="big" onClick={() => (back?.cancelled ? back.cancelled() : close())}>
            Cancel
          </button>
          <button
            className="big primary"
            onClick={() => {
              proceed();
              // What goes ahead opens its own next panel (the roll) or closes; only `done` reopens one.
              if (back?.done) back.done();
            }}
          >
            Use anyway
          </button>
        </div>
      </>
    ));
    return false;
  };
  const hpNow = Math.min(c.hp.current, sheet.hpMax.total);
  const openChoices = buildItems(c, registry).filter((i) => !i.done).length;
  const hpPct = Math.round((hpNow / sheet.hpMax.total) * 100);

  const openHp = () =>
    open("Hit points", () => (
      <HpPad
        onDamage={(amount, type) => {
          // Durable: offer a Hit Die to soak the damage first (a reaction, before resistances).
          const sh = live.current.sheet;
          const ch = live.current.character;
          const diceLeft = sh?.hitDice.filter((h) => h.total - h.used > 0) ?? [];
          const reactionFree = !ch?.combat || (ch.combat.reaction ?? 0) < 1;
          if (sh?.rules.durable && diceLeft.length && reactionFree && amount > 0) return openDurable(amount, type);
          takeDamage(amount, type);
        }}
        onHeal={(amount) => {
          s.act("heal", { amount }, `Healed ${amount}.`);
          close();
        }}
        onTemp={(amount) => {
          s.act("setTempHp", { amount }, amount ? `${amount} temporary HP.` : "Temporary HP removed.");
          close();
        }}
        temp={live.current.character?.hp.temp ?? 0}
        below={
          live.current.character && live.current.sheet ? <MaxHpPanel character={live.current.character} sheet={live.current.sheet} reg={registry} act={live.current.act} /> : null
        }
      />
    ));

  /** Damage to the character, then what it leads to: a concentration save, or instant death. */
  const takeDamage = (amount: number, type?: string) => {
    const prompts = live.current.act("damage", { amount, damageType: type }, `Took ${amount}${type ? ` ${type}` : ""} damage.`) as { kind: string; dc: number; reason?: string }[];
    const dead = prompts.find((p) => p.kind === "dead");
    if (dead) return openDead(dead.reason ?? "");
    const check = prompts.find((p) => p.kind === "concentration");
    if (check) openConcentrationCheck(check.dc);
    else close();
  };
  const openDead = (reason: string) =>
    open("Instant death", () => (
      <>
        <p className="over-banner" role="alert">
          <strong>Your character dies.</strong> {reason}
        </p>
        <p className="note">Only magic like Revivify, Raise Dead or a Wish brings them back. If your DM rules otherwise, undo the damage or set the death saves by hand on Play.</p>
        <button className="big wide" onClick={close}>
          Close
        </button>
      </>
    ));
  /** Durable (remastered): spend a Hit Die as a reaction to reduce damage by the die + Constitution (at least 3). */
  const openDurable = (amount: number, type?: string) =>
    open("Durable: spend a Hit Die?", () => (
      <DurablePanel
        amount={amount}
        con={live.current.sheet?.abilities.con.modifier ?? 0}
        dice={(live.current.sheet?.hitDice ?? []).filter((h) => h.total - h.used > 0).map((h) => ({ die: h.die, left: h.total - h.used }))}
        physical={live.current.character?.settings.physicalDice ?? true}
        onSkip={() => takeDamage(amount, type)}
        onSpend={(die, roll, reduce) => {
          live.current.act("spendHitDie", { die, roll, reduce: true }, `Durable: ${die} spent, ${reduce} less damage.`);
          if (live.current.character?.combat) live.current.act("useEconomy", { kind: "reaction" }, "Reaction used.");
          const left = Math.max(0, amount - reduce);
          if (left > 0) takeDamage(left, type);
          else close();
        }}
      />
    ));

  /** Another background: its proficiencies and choices follow; gear from the old one stays. */
  const openBackground = () => open("Background", () => <BackgroundPicker current={live.current.character?.background} onPick={(id) => {
    if (id === CUSTOM_BG) return openCustomBackground();
    live.current.act("setDetails", { background: id }, `Background: ${registry.find(id, "background")?.name ?? id}.`);
    close();
  }} />);
  /** "You don't know me! (custom)": a background of your own, step by step. */
  const openCustomBackground = () =>
    open("You don't know me! (custom)", () =>
      live.current.character ? <CustomBackgroundWizard c={live.current.character} reg={registry} act={live.current.act} done={close} /> : null,
    );

  /** A death saving throw: what the d20 shows decides it. */
  const openDeathSave = () => {
    const decide = (n: number) => {
      if (n === 20) s.act("deathSave", { result: "critSuccess" }, "Death save: natural 20.");
      else if (n === 1) s.act("deathSave", { result: "critFailure" }, "Death save: natural 1, two failures.");
      else if (n >= 10) s.act("deathSave", { result: "success" }, `Death save: ${n}, a success.`);
      else s.act("deathSave", { result: "failure" }, `Death save: ${n}, a failure.`);
      close();
    };
    open(
      "Death saving throw",
      <>
        <p className="note">Tap what your d20 shows, or let the app roll. 10 or higher succeeds; 1 counts as two failures; 20 brings you back with 1 HP.</p>
        <div className="keys d20" style={{ marginTop: 10 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <button key={i} className="key" onClick={() => decide(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <button className="big" style={{ width: "100%", marginTop: 10 }} onClick={() => decide(rollDie(20))}>
          Roll for me
        </button>
      </>,
    );
  };

  const openHitDie = (die: string) => {
    const sides = Number(die.slice(1));
    const spend = (roll: number) => {
      s.act("spendHitDie", { die, roll }, `Spent a ${die}.`);
      close();
    };
    open(
      `Spend a ${die}`,
      <>
        <p className="note">Tap what you rolled, or let the app roll. Constitution {formatBonus({ total: sheet.abilities.con.modifier, dice: [] })} is added.</p>
        <div className="keys" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 10 }}>
          {Array.from({ length: sides }, (_, i) => (
            <button key={i} className="key" onClick={() => spend(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <button className="big" style={{ width: "100%", marginTop: 10 }} onClick={() => spend(rollDie(sides))}>
          Roll for me
        </button>
      </>,
    );
  };

  /** Opens the roll composer for any d20 roll; attacks also get the damage step. */
  /** Portent rolls on hand, offered on every d20 roll. */
  const portentFor = () => {
    const pool = live.current.sheet?.resources.find((r) => r.pool && r.pool.values.length > 0);
    if (!pool?.pool) return undefined;
    return {
      values: pool.pool.values,
      onUse: (index: number) => live.current.act("usePool", { resource: pool.id, index }, `${pool.name}: ${pool.pool!.values[index]} used.`),
    };
  };

  /** Options ticked in the composer that are also features used on your turn (Steady Aim) get recorded. */
  const recordOptions = (labels: string[]) => {
    const cur = live.current;
    // Inspiration: one is spent.
    if (labels.includes("Inspiration") && (cur.character?.inspirations ?? 0) > 0) cur.act("setInspiration", { count: cur.character!.inspirations - 1 }, "Inspiration spent.");
    // A Bardic Inspiration die is lost once it's rolled.
    for (const e of cur.sheet?.effects ?? []) {
      if (e.usedUp && labels.includes(e.usedUp)) cur.act("removeEffect", { instanceId: e.instanceId }, `${e.name} used: it's gone.`);
    }
    const cb = cur.character?.combat;
    if (!cb) return;
    for (const label of labels) {
      const a = cur.sheet?.actions.find((x) => x.name === label && x.economy !== "free");
      if (a && !cb.usedThisTurn.includes(a.id)) cur.act("useAction", { action: a.id }, `${a.name} used.`);
    }
  };

  const openRoll = (
    title: string,
    base: ComposerBase,
    attack?: WeaponAttack,
    opts: {
      notes?: string[];
      onTotal?: (n: number) => void;
      /** Read each time the roll redraws, so a second attack sees what the first used (Hand of Harm once per turn). */
      optionInfo?: Record<string, OptionInfo> | (() => Record<string, OptionInfo>);
      onCommit?: (n: number) => void;
      repeat?: { count: number; what: string };
      onDamageOptions?: (labels: string[]) => void;
      dc?: number;
      /** Read when the panel draws, so it shows the latest (an extra's reason). */
      header?: () => ReactNode;
      damageOnly?: boolean;
      /** A way back to where the roll came from (a summoned creature's stat block). */
      back?: { label: string; to: () => void };
      /** Options turned on in the roll, for someone other than you (a summoned creature's Bardic Inspiration). */
      onOptionsUsed?: (labels: string[]) => void;
    } = {},
  ) => {
    // Each roll is a fresh composer: the next one (a strike after Hand of Healing) never inherits the last one's dice.
    const rollKey = crypto.randomUUID();
    const healing = attack?.damage.type === "healing";
    return open(title, () => (
      <>
      {opts.back && (
        <button className="link back-link" onClick={opts.back.to}>
          ‹ {opts.back.label}
        </button>
      )}
      <Composer
        key={rollKey}
        title={title}
        {...(healing
          ? {
              healing: true,
              onHealSelf: (n: number) => {
                live.current.act("heal", { amount: n }, `Healed ${n}.`);
                // In a Flurry: on to the strike that comes next.
                if (opts.back) opts.back.to();
                else close();
              },
            }
          : {})}
        {...(attack && !opts.damageOnly ? { afterRoll: afterRollFor(), onDone: opts.back ? opts.back.to : close } : {})}
        base={base}
        {...(opts.header ? { header: opts.header() } : {})}
        {...(opts.damageOnly ? { damageOnly: true } : {})}
        {...(attack ? { attack } : {})}
        {...(opts.notes ? { notes: opts.notes } : {})}
        {...(opts.optionInfo ? { optionInfo: typeof opts.optionInfo === "function" ? opts.optionInfo() : opts.optionInfo } : {})}
        {...(opts.onCommit ? { onCommit: opts.onCommit } : {})}
        {...(opts.repeat ? { repeat: opts.repeat } : {})}
        {...(opts.onDamageOptions ? { onDamageOptions: opts.onDamageOptions } : {})}
        {...(opts.dc !== undefined ? { dc: opts.dc } : {})}
        {...(portentFor() ? { portent: portentFor()! } : {})}
        onOptionsUsed={opts.onOptionsUsed ?? recordOptions}
        physical={live.current.character?.settings.physicalDice ?? true}
        onPhysicalChange={(p) =>
          live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")
        }
        onRolled={(r) => {
          live.current.addRoll(r);
          opts.onTotal?.(r.total);
        }}
      />
      {opts.back && (
        <button className="link back-link" onClick={opts.back.to}>
          ‹ {opts.back.label}
        </button>
      )}
      </>
    ));
  };

  /**
   * What can be added to an attack roll after seeing it: Focused Aim (+2 per
   * ki, up to 3), Precision Attack (a superiority die), when the character has them.
   */
  const afterRollFor = () => {
    const sh = live.current.sheet;
    const ch = live.current.character;
    if (!sh || !ch) return [];
    const out: { label: string; sub?: string; warn?: boolean; group?: string; run: () => { value: number; detail: string } | undefined }[] = [];
    if (sh.actions.some((a) => a.id === "focused-aim"))
      for (const n of [1, 2, 3])
        out.push({
          label: `Focused Aim +${2 * n}`,
          group: "Focused Aim",
          sub: (() => {
            const ki = sh.resources.find((r) => r.id === "ki")?.remaining ?? 0;
            return ki < n ? `${n} ki · only ${ki} left` : `${n} ki`;
          })(),
          warn: (sh.resources.find((r) => r.id === "ki")?.remaining ?? 0) < n,
          run: () => {
            live.current.act("useAction", { action: "focused-aim", amount: n }, `Focused Aim: ${n} ki for +${2 * n}.`);
            return { value: 2 * n, detail: `${n} ki` };
          },
        });
    const maneuvers = Object.values(ch.choices).flatMap((c) => (c as Record<string, string[]>).maneuvers ?? []);
    const sup = sh.resources.find((r) => r.id === "superiority-dice");
    if (sup && maneuvers.includes("Precision Attack")) {
      const sides = Number(/d(\d+)/.exec(sup.die ?? "d8")?.[1] ?? 8);
      out.push({
        label: `Precision Attack +d${sides}`,
        group: "Precision Attack",
        sub: `${sup.remaining} dice left`,
        warn: sup.remaining <= 0,
        run: () => {
          const v = rollDie(sides);
          live.current.act("useAction", { action: "maneuver", choice: "Precision Attack" }, `Precision Attack: d${sides} rolled ${v}.`);
          return { value: v, detail: `d${sides} [${v}]` };
        },
      });
    }
    return out;
  };

  /** Wild Shape or Polymorph: choose the creature. */
  const openTransform = (kind: ShapeKind, via: { effectId?: string; addEffect?: string } = {}) =>
    open(kind === "wildshape" ? "Wild Shape" : kind === "truepolymorph" ? "True Polymorph" : "Polymorph", () =>
      live.current.sheet && live.current.character ? (
        <TransformPanel
          kind={kind}
          sheet={live.current.sheet}
          reg={registry}
          character={live.current.character}
          onPick={(k, d, uses) =>
            guard(
              { name: k === "wildshape" ? "Wild Shape" : "Polymorph", economy: k === "wildshape" ? (live.current.sheet?.wildShape?.bonusAction ? "bonus" : "action") : "free" },
              () => {
                // From "+ Effect": the effect goes on first, and the form is tied to it.
                let effectId = via.effectId;
                if (via.addEffect) {
                  effectId = crypto.randomUUID();
                  live.current.act("addEffect", { instanceId: effectId, effect: via.addEffect }, `${registry.find(via.addEffect, "effect")?.name ?? "Effect"} added.`);
                }
                live.current.act("transform", { kind: k, creature: d.id, uses, ...(effectId ? { effect: effectId } : {}) }, "Transformed.");
                openShape();
              },
              { cancelled: () => openTransform(k, via) },
            )
          }
        />
      ) : null,
    );

  /** Dice a creature's trait deals on its own (Heated Body: 1d10 fire). */
  const openTraitRoll = (title: string, dice: string, type?: string, extra: Parameters<typeof openRoll>[3] = {}) => {
    const empty = { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] };
    const m = /^(\d+d\d+)([+-]\d+)?$/.exec(dice);
    const a: WeaponAttack = {
      attackId: `trait:${title}`,
      name: title,
      mode: "melee",
      action: "attack",
      ability: "str",
      proficient: false,
      attack: empty,
      damage: { dice: m?.[1] ?? dice, type: type ?? "", bonus: m?.[2] ? { ...empty, total: Number(m[2]), parts: [{ label: "Bonus", value: Number(m[2]) }] } : empty, onCrit: [], critExtraDice: [] },
      properties: [],
    };
    openRoll(title, empty, a, { ...extra, damageOnly: true });
  };

  /** An area that grows with each ally who joins (Charm of Sunlight): how many joined, and the radius. */
  const openGrowingArea = (title: string, g: GrowingArea) =>
    open(title, () => {
      const n = Math.max(g.min, growJoin.current);
      const setN = (v: number) => {
        growJoin.current = Math.max(g.min, v);
        openGrowingArea(title, g);
      };
      const radius = g.per * n;
      return (
        <>
          <p className="note">{g.question}</p>
          <div className="stepper" style={{ justifyContent: "center", margin: "8px auto", width: "fit-content" }}>
            <button aria-label="One fewer" disabled={n <= g.min} onClick={() => setN(n - 1)}>
              −
            </button>
            <span>{n}</span>
            <button aria-label="One more" disabled={n >= 10} onClick={() => setN(n + 1)}>
              +
            </button>
          </div>
          <p className="formula">
            {g.what}: {radius}-foot radius
          </p>
          <p className="note">{g.detail(n)}</p>
          <button
            className="big primary wide"
            onClick={() => {
              growJoin.current = 0;
              if (g.effect) {
                // One tag, the latest radius: an older one from this charm is replaced.
                for (const e of live.current.sheet?.effects ?? []) if (e.id === g.effect) live.current.act("removeEffect", { instanceId: e.instanceId }, "");
                live.current.act("addEffect", { instanceId: crypto.randomUUID(), effect: g.effect, choice: `${radius} ft` }, `${g.what}: ${radius}-foot radius, 1 hour.`);
              } else live.current.setToast({ id: Date.now(), text: `${g.what}: ${radius}-foot radius.`, canUndo: false });
              close();
            }}
          >
            Done
          </button>
        </>
      );
    });

  /** Rolls for a summoned creature come back to its stat block, and use up its Bardic Inspiration. */
  const summonRollOpts = (id: string) => {
    const m = live.current.character?.summons.find((x) => x.id === id);
    const name = m ? m.name ?? registry.find(m.creature, "creature")?.name ?? "it" : "it";
    return {
      back: { label: `Back to ${name}`, to: () => openSummonMember(id) },
      onOptionsUsed: (labels: string[]) => {
        const cur = live.current.character?.summons.find((x) => x.id === id);
        for (const e of cur?.effects ?? []) {
          const d = registry.find(e.effect, "effect");
          if (d?.usedUp && d.modifiers.some((mod) => labels.includes(mod.label ?? d.name))) live.current.act("summonEffect", { id, effect: e.effect, instance: e.id, add: false }, `${d.name} used: it's gone.`);
        }
      },
    };
  };

  /** One summoned creature: its turn, effects, concentration, HP, attacks. */
  const openSummonMember = (id: string) =>
    open("Summoned creature", () => {
      const cur = live.current.character;
      const m = cur?.summons.find((s) => s.id === id);
      if (!cur || !m) return <p className="note">It's gone.</p>;
      return (
        <SummonMemberPanel
          member={m}
          reg={registry}
          act={live.current.act}
          inCombat={!!cur.combat}
          openHp={() => openSummonHp(id, true)}
          onTraitRoll={(title, dice, type) => openTraitRoll(title, dice, type, summonRollOpts(id))}
          onCheck={(title, base) => openRoll(title, base, undefined, summonRollOpts(id))}
          onRollInitiative={() => {
            const b = summonBlock(registry, m);
            openRoll(`${b?.name ?? "It"}: initiative`, b?.initiative ?? { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] }, undefined, {
              ...summonRollOpts(id),
              onTotal: (n) => live.current.act("summonInitiative", { group: m.group, id, value: n }, `Initiative ${n}.`),
            });
          }}
          onAddEffect={() =>
            open(`Effect on ${m.name ?? registry.find(m.creature, "creature")?.name ?? "it"}`, () => (
              <AddEffectPanel
                registry={registry}
                act={live.current.act}
                close={() => openSummonMember(id)}
                onPick={(d, choice) => {
                  live.current.act("summonEffect", { id, effect: d.id, add: true, ...(d.rounds ? { rounds: d.rounds } : d.minutes ? { rounds: d.minutes * 10 } : {}), ...(choice ? { choice } : {}) }, `${d.name} on ${m.name ?? registry.find(m.creature, "creature")?.name ?? "it"}.`);
                  openSummonMember(id);
                }}
              />
            ))
          }
          onSpell={(spell, source) => openSummonSpell(id, spell, source)}
          openAttack={(a) => {
            const kind = a.action === "bonus" ? "bonus" : "attack";
            openRoll(a.name, a.attack, a, {
              ...summonRollOpts(id),
              onCommit: () => live.current.act("summonEconomy", { id, kind, used: true }, kind === "bonus" ? "Its bonus action." : "Its attack."),
            });
          }}
          back={() => openSummonGroup(m.group)}
        />
      );
    });

  /** A spell a summoned creature casts. */
  const openSummonSpell = (id: string, spell: { name: string; id?: string }, source: SpellSource) =>
    open(spell.id ? registry.find(spell.id, "spell")?.name ?? spell.name : spell.name, () => {
      const m = live.current.character?.summons.find((x) => x.id === id);
      if (!m) return <p className="note">It's gone.</p>;
      return (
        <SummonSpellPanel
          member={m}
          reg={registry}
          spell={spell}
          source={source}
          act={live.current.act}
          back={() => openSummonMember(id)}
          onRoll={(sp, level) => {
            const d = registry.find(m.creature, "creature");
            if (!d) return openSummonMember(id);
            const a = creatureSpellRoll(d, sp, level, source.info);
            const sa = summonBlock(registry, m)?.spellAttack;
            if (sa) a.attack = { ...sa, parts: [...a.attack.parts, ...sa.parts], total: a.attack.total + sa.total };
            openRoll(`${d.name}: ${sp.name}`, a.attack, a, { ...summonRollOpts(id), ...(sp.attack ? {} : { damageOnly: true }), ...(a.saveNote ? { notes: [a.saveNote] } : {}) });
          }}
        />
      );
    });

  /** After casting a summoning spell: pick the creatures. */
  const openSummon = (summonId: string, slot: number) =>
    open(registry.find(summonId, "summon")?.name ?? "Summon", () => (
      <SummonPicker
        reg={registry}
        summon={summonId}
        slot={slot}
        onSummon={(creatures) => {
          const def = registry.find(summonId, "summon")!;
          const group = crypto.randomUUID().slice(0, 8);
          live.current.act("summon", { spell: def.spell, group, creatures, ...(def.concentration ? { concentration: true } : {}) }, `${def.name}.`);
          openSummonGroup(group);
        }}
      />
    ));

  const rollSummonInit = (group: string, id?: string) => {
    const m = live.current.character?.summons.find((s) => s.group === group && (!id || s.id === id));
    const d = m ? registry.find(m.creature, "creature") : undefined;
    const dex = d ? Math.floor(((d.abilities.dex ?? 10) - 10) / 2) : 0;
    const r = rollDice("1d20").total;
    live.current.act("summonInitiative", { group, ...(id ? { id } : {}), value: r + dex }, `Initiative ${r} ${dex >= 0 ? "+" : "−"} ${Math.abs(dex)} = ${r + dex}.`);
  };

  const openSummonHp = (id: string, fromMember = false) =>
    open("Summoned creature's hit points", () => {
      const m = live.current.character?.summons.find((s) => s.id === id);
      const max = m ? registry.find(m.creature, "creature")?.hp ?? m.hp : 0;
      const back = () => (m ? (fromMember ? openSummonMember(id) : openSummonGroup(m.group)) : close());
      return (
        <HpPad
          sourceToggles
          below={m ? <SummonMaxHp member={m} reg={registry} act={live.current.act} /> : null}
          onDamage={(amount, type, src) => {
            if (!m) return back();
            const prompts = live.current.act("summonHp", { id, damage: amount, ...(type ? { type } : {}), ...src }, `${amount}${type ? ` ${src?.magical ? "magical " : ""}${type}` : ""} damage.`);
            // Concentrating and still up: its Constitution save (DC 10 or half the damage) opens right away.
            const check = prompts.find((p) => p.kind === "concentration" && p.summon === id);
            if (check) openSummonConcCheck(id, check.dc, fromMember);
            else back();
          }}
          onHeal={(amount) => {
            if (m) live.current.act("summonHp", { id, hp: Math.min(max, m.hp + amount) }, `Healed ${amount}.`);
            back();
          }}
          onTemp={() => back()}
          temp={0}
        />
      );
    });

  /** A summoned creature's concentration save after damage; a failure ends it. */
  const openSummonConcCheck = (id: string, dc: number, fromMember: boolean) => {
    const m = live.current.character?.summons.find((x) => x.id === id);
    if (!m) return;
    const b = summonBlock(registry, m);
    const name = m.name ?? b?.name ?? "It";
    const back = () => (fromMember ? openSummonMember(id) : openSummonGroup(m.group));
    open(`${name}: concentration`, () => (
      <>
        <button className="link back-link" onClick={back}>
          ‹ Back to {name}
        </button>
        <Composer
          title={`${name}: concentration on ${m.concentrating}`}
          base={b?.saves.con ?? { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] }}
          dc={dc}
          onOptionsUsed={summonRollOpts(id).onOptionsUsed}
          physical={live.current.character?.settings.physicalDice ?? true}
          onPhysicalChange={(p) => live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")}
          onRolled={(r) => live.current.addRoll(r)}
          onCheck={(passed) => {
            if (!passed) live.current.act("summonConcentration", { id, spell: null }, `${name} loses concentration.`);
          }}
        />
      </>
    ));
  };

  const openSummonGroup = (group: string) =>
    open("Summoned", () =>
      live.current.character ? (
        <SummonGroupPanel character={live.current.character} reg={registry} group={group} act={live.current.act} openRoll={openRoll} openHp={openSummonHp} rollInitiative={rollSummonInit} openMember={openSummonMember} />
      ) : null,
    );

  /** The stat block while transformed. */
  const openShape = () =>
    open(live.current.sheet?.shape?.name ?? "Your form", () => {
      const cur = live.current;
      const s = cur.sheet?.shape;
      if (!s || !cur.sheet || !cur.character) return <p className="note">You're back in your normal form.</p>;
      return (
        <ShapePanel
          shape={s}
          sheet={cur.sheet}
          act={cur.act}
          openRoll={openRoll}
          openHp={openHp}
          openAttack={openAttack}
          onTraitRoll={openTraitRoll}
          {...(cur.character.combat ? { attacksMade: cur.character.combat.attacks } : {})}
          onUseAction={(name, economy) =>
            guard({ name, economy }, () => {
              if (live.current.character?.combat) live.current.act("useEconomy", { kind: economy, amount: 1 }, `${name}: ${economy === "bonus" ? "bonus action" : economy} used.`);
            })
          }
          normalHp={{ current: cur.character.hp.current, max: cur.sheet.hpMax.total }}
          onRevert={() =>
            guard({ name: "Change back", economy: s.kind === "wildshape" ? "bonus" : "free" }, () => {
              if (s.kind === "wildshape" && live.current.character?.combat) live.current.act("useEconomy", { kind: "bonus", amount: 1 }, "Bonus action used.");
              live.current.act("revert", {}, "Back in your normal form.");
              close();
            })
          }
          onHealSlot={(level) =>
            guard({ name: "Combat Wild Shape healing", economy: "bonus" }, () => {
              const healed = rollDice(`${level}d8`).total;
              live.current.act("spendSlot", { level }, `Level ${level} slot spent.`);
              if (live.current.character?.combat) live.current.act("useEconomy", { kind: "bonus", amount: 1 }, "Bonus action used.");
              live.current.act("heal", { amount: healed }, `Combat Wild Shape: ${level}d8 = ${healed} HP.`);
              openShape();
            })
          }
        />
      );
    });

  const monkLevel = () => live.current.character?.classes.find((x) => x.class === "class:monk")?.level ?? 0;
  /** An unarmed strike as the monk makes it (the bonus-action one for Flurry of Blows). */
  const unarmed = (bonus: boolean) => live.current.sheet?.attacks.find((x) => x.attackId === (bonus ? "martial-arts-bonus" : "martial-arts")) ?? live.current.sheet?.attacks.find((x) => x.attackId === "martial-arts");

  /** Deflect Missiles and Slow Fall: the damage taken, the reduction, and what's left. */
  const openReduce = (a: ActionResult) => {
    const sh = live.current.sheet!;
    const deflect = a.id === "deflect-missiles";
    const lvl = monkLevel();
    const dex = sh.abilities.dex.modifier;
    const use = () => live.current.act("useAction", { action: a.id }, `${a.name}: reaction used.`);
    open(a.name, () => (
      <DamageReducePanel
        what={deflect ? "Damage reduced" : "Slow Fall"}
        {...(deflect ? { die: 10 } : {})}
        flat={deflect ? dex + lvl : 5 * lvl}
        flatLabel={deflect ? `Dexterity ${signed(dex)} + monk level ${lvl}` : `5 × monk level ${lvl}`}
        physical={live.current.character?.settings.physicalDice ?? true}
        onApply={(left, reduced) => {
          use();
          if (left > 0) {
            const prompts = live.current.act("damage", { amount: left }, `${a.name} stopped ${reduced}: ${left} damage taken.`);
            const check = prompts.find((p) => p.kind === "concentration" && !p.summon);
            if (check) return openConcentrationCheck(check.dc);
          }
          close();
        }}
        {...(deflect
          ? {
              onCatch: (throwBack: boolean) => {
                use();
                if (!throwBack) return close();
                live.current.act("spendResource", { resource: "ki" }, "1 ki spent: thrown back.");
                const base = unarmed(false);
                if (!base) return close();
                // As a monk weapon: proficient, Dexterity, the Martial Arts die.
                // A ranged attack: nothing that needs a melee hit or an unarmed strike (Stunning Strike, Hand of Harm).
                const meleeOnly = (sg: { label: string; reason?: string }) => /^(Stunning Strike|Hand of Harm)$/.test(sg.label) || /\bmelee\b|unarmed strike/i.test(sg.reason ?? "");
                const thrown = {
                  ...base,
                  attackId: "deflect-missiles-throw",
                  name: "Deflected missile",
                  mode: "ranged" as const,
                  range: [20, 60] as [number, number],
                  attack: { ...base.attack, suggestions: base.attack.suggestions.filter((sg) => !meleeOnly(sg)) },
                  damage: { ...base.damage, bonus: { ...base.damage.bonus, suggestions: base.damage.bonus.suggestions.filter((sg) => !meleeOnly(sg)) } },
                };
                openRoll(thrown.name, thrown.attack, thrown);
              },
            }
          : {})}
      />
    ));
  };

  /** Flurry of Blows: two unarmed strikes; a Way of Mercy monk can swap strikes for Hand of Healing. */
  const openFlurry = () => {
    const sh = live.current.sheet;
    const strike = unarmed(true);
    const healing = sh?.actions.find((x) => x.id === "hand-of-healing");
    const both = monkLevel() >= 11 && healing;
    const strikes = (n: number) => {
      if (!strike) return close();
      openRoll(strike.name, strike.attack, strike, {
        optionInfo: () => optionInfoFor(strike),
        onDamageOptions: (labels) => {
          const once = labels.filter((l) => strike.damage.bonus.suggestions.some((sg) => sg.label === l && sg.oncePerTurn));
          if (once.length && live.current.character?.combat) live.current.act("markOnce", { labels: once }, `${once.join(", ")} used this turn.`);
          for (const l of labels) {
            const f = live.current.sheet?.actions.find((x) => x.name === l && x.cost && x.economy === "free");
            // Flurry of Healing and Harm (11th): Hand of Harm costs no ki in a Flurry.
            if (f && !(both && f.id === "hand-of-harm")) live.current.act("useAction", { action: f.id }, `${f.name}: ${f.cost!.amount} ki spent.`);
          }
        },
        ...(n > 1 ? { repeat: { count: n, what: "unarmed strikes" } } : {}),
      });
    };
    const heal = (then?: () => void) => {
      if (!healing) return;
      live.current.act("useAction", { action: healing.id, free: true }, "Hand of Healing in the Flurry: no ki spent.");
      const h = healing.heal;
      const dice = h ? `${h.dice.join("+")}${h.flat ? (h.flat > 0 ? `+${h.flat}` : String(h.flat)) : ""}` : "1d4";
      openTraitRoll("Hand of Healing", dice, "healing", then ? { back: { label: "On to the strike", to: then } } : {});
    };
    if (!healing) return strikes(2);
    open("Flurry of Blows", () => (
      <Choose
        question="Two unarmed strikes, or swap one for Hand of Healing (no ki)?"
        options={[
          { label: "Hand of Healing, then one strike", onPick: () => heal(() => strikes(1)) },
          ...(both ? [{ label: "Two Hands of Healing (no ki)", onPick: () => heal(() => heal()) }] : []),
          { label: "Two unarmed strikes", onPick: () => strikes(2) },
        ]}
      />
    ));
  };

  const openFeature = (a: ActionResult) => {
    if (a.id === "wild-shape") return openTransform("wildshape");
    if (a.id === "deflect-missiles" || a.id === "slow-fall") return openReduce(a);
    // A free cast (Haunted: Invisibility) opens the spell itself, where the free use casts it.
    const free = a.spells?.[0] && live.current.sheet?.spells.find((x) => x.id === a.spells![0]!.id && x.list.id === a.spells![0]!.list);
    if (free) return openSpell(free);
    open(a.name, () => {
      const current = live.current.sheet?.actions.find((x) => x.id === a.id) ?? a;
      const feature = live.current.sheet?.features.find((f) => f.id === current.featureId);
      return (
        <FeaturePanel
          a={current}
          physical={live.current.character?.settings.physicalDice ?? true}
          text={feature?.text}
          {...(current.check
            ? {
                checks: current.check.skills.flatMap((sk) => {
                  const r = live.current.sheet?.skills[sk as Skill];
                  return r ? [{ skill: sk, name: SKILL_NAMES[sk as Skill], bonus: signed(r.total) }] : [];
                }),
              }
            : {})}
          onUse={(rolled, free, check, choice, spend) => {
            // Readying a spell: pick it, then cast it now and hold it.
            if (choice === "Cast a Spell" && current.choose) return openReadySpell();
            if (a.id === "preserve-life") return openPreserveLife(!!free);
            const payload = {
              action: a.id,
              ...(rolled === undefined ? {} : { rolled }),
              ...(free ? { free: true } : {}),
              ...(choice ? { choice } : {}),
              ...(spend ? { amount: spend.amount, healSelf: spend.healSelf } : {}),
            };
            const label = spend
              ? `${a.name}: ${spend.amount} ${spend.healSelf ? "hit points to yourself" : "points spent"}.`
              : choice && current.untilTurnStart
              ? `${a.name}: ${choice}. Use your reaction when the trigger happens.`
              : choice
              ? `${a.name}: ${choice.replace(/ \(not enough\)$/, "")}.`
              : free ? `${a.name} switched on (nothing spent).` : current.roll && rolled !== undefined ? `${a.name}: ${rolled} ${current.roll.label}.` : `${a.name} used.`;
            if (free) {
              live.current.act("useAction", payload, label);
              return close();
            }
            const go = () =>
              guard(
                {
                  name: current.name,
                  economy: current.asAttack ? "action" : current.economy,
                  ...(current.asAttack ? { attack: true } : { actionId: current.id }),
                  ...(current.notAfterMoving ? { notAfterMoving: true } : {}),
                },
                () => {
                  live.current.act("useAction", payload, label);
                  flashForFeature(current.id);
                  const sk = check as Skill | undefined;
                  const base = sk && live.current.sheet?.skills[sk];
                  const grows = GROWING_AREAS[current.id];
                  if (grows) openGrowingArea(current.name, grows);
                  else if (current.id === "flurry-of-blows") openFlurry();
                  else if (sk && base) openRoll(`${current.name}: ${SKILL_NAMES[sk]}`, base, undefined, current.check?.dc !== undefined ? { dc: current.check.dc } : {});
                  else close();
                },
              );
            if (current.cost && current.cost.remaining < current.cost.amount)
              open(current.name, () => (
                <Confirm
                  question="Are you sure?"
                  detail={`You have no ${current.cost!.name} left.`}
                  no="No, cancel"
                  yes={`Use ${current.name} anyway`}
                  onNo={close}
                  onYes={go}
                />
              ));
            else go();
          }}
        />
      );
    });
  };

  /** Spells that can be readied: a casting time of 1 action. */
  const openReadySpell = () =>
    open("Ready a spell", () => {
      const list = (live.current.sheet?.spells ?? []).filter((sp) => castingEconomy(sp.castingTime) === "action" && sp.ready !== "not prepared");
      return (
        <>
          <p className="note">Only spells with a casting time of 1 action can be readied. It's cast now and held with your concentration.</p>
          <div className="group">
            {list.map((sp) => (
              <button className="row" key={`${sp.list.id}-${sp.id}`} onClick={() => openSpell(sp, undefined, true)}>
                <div className="row-main">
                  <div className="row-title">{sp.name}</div>
                  <div className="row-sub">
                    {sp.level === 0 ? "Cantrip" : `Level ${sp.level}`}, {sp.list.label}
                    {sp.concentration ? ", concentration" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      );
    });

  const openItem = (instanceId: string) => {
    const first = c.inventory.find((i) => i.id === instanceId);
    if (!first) return;
    open(first.name ?? registry.get(first.item, "item").name, () => {
      const inst = live.current.character?.inventory.find((i) => i.id === instanceId);
      if (!inst) return <p className="note">This item has been removed.</p>;
      return <ItemPanel inst={inst} def={registry.get(inst.item, "item")} act={live.current.act} close={close} />;
    });
  };

  /**
   * Effects that end when you attack or cast (Invisibility): ask before going
   * ahead. The roll still gets the effect's benefit (you were invisible when
   * you attacked); ending it is recorded right after.
   */
  const askEndsOn = (kind: "attack" | "cast", proceed: () => boolean | void, after?: () => void) => {
    const ending = live.current.sheet?.effects.filter((e) => e.endsOn?.includes(kind)) ?? [];
    const go = () => {
      if (proceed() !== false) after?.();
    };
    if (!ending.length) return go();
    const names = ending.map((e) => e.name).join(", ");
    open(`${names} ends?`, () => (
      <Confirm
        question={`Does ${names} end?`}
        detail={`${names} ends for a target that ${kind === "attack" ? "attacks" : "casts a spell"}. You still have it for this ${kind === "attack" ? "attack" : "spell"}.`}
        no="No, keep it"
        yes={`Yes, end ${names}`}
        onNo={go}
        onYes={() => {
          go();
          for (const e of ending) {
            live.current.act("removeEffect", { instanceId: e.instanceId }, `${e.name} ended.`);
            if (e.concentration && live.current.character?.concentration?.name === e.name) live.current.act("endConcentration", {}, `Concentration on ${e.name} ended.`);
          }
        }}
      />
    ));
  };

  /**
   * What the roll should know about each optional modifier: Steady Aim already
   * used this turn starts ticked; with no bonus action left, after moving, or
   * with a bonus-action attack it warns; a once-per-turn option already used
   * (Sneak Attack) warns.
   */
  /**
   * Smites spend a slot you pick when the damage is rolled: Divine Smite any
   * spell slot (2d8, +1d8 a level above 1st, up to 5d8; +1d8 against undead or
   * fiends), Eldritch Smite a warlock slot (1d8 + 1d8 per slot level).
   */
  const smiteSlots = (label: string): OptionInfo["slots"] | undefined => {
    const divine = /^Divine Smite/.test(label);
    const eldritch = /^Eldritch Smite/.test(label);
    if (!divine && !eldritch) return undefined;
    const sh = live.current.sheet;
    const ch = live.current.character;
    if (!sh || !ch) return undefined;
    const choices: { key: string; label: string }[] = [];
    if (divine) for (const s of sh.spellSlots) if (s.total - s.used > 0) choices.push({ key: `slot:${s.level}`, label: `Level ${s.level} (${s.total - s.used} left)` });
    if (sh.pactSlots && sh.pactSlots.count - ch.pactSlotsUsed > 0) choices.push({ key: `pact:${sh.pactSlots.level}`, label: `Pact level ${sh.pactSlots.level} (${sh.pactSlots.count - ch.pactSlotsUsed} left)` });
    return {
      choices,
      ...(divine ? { extra: "Undead or fiend (+1d8)" } : {}),
      dice: (key, extra) => {
        const lvl = Number(key.split(":")[1]);
        const n = divine ? Math.min(5, 1 + lvl) + (extra ? 1 : 0) : 1 + lvl;
        return `${n}d8`;
      },
      onSpend: (key) => {
        const [kind, lvl] = key.split(":");
        live.current.act("spendSlot", { level: Number(lvl), pact: kind === "pact" }, `${divine ? "Divine Smite" : "Eldritch Smite"}: ${kind === "pact" ? "Pact" : `level ${lvl}`} slot spent.`);
      },
    };
  };

  /** Ki save DC: 8 + proficiency + Wisdom. */
  const kiDc = () => {
    const sh = live.current.sheet;
    return sh ? 8 + sh.proficiencyBonus + sh.abilities.wis.modifier : undefined;
  };

  const optionInfoFor = (a: WeaponAttack) => {
    const cur = live.current;
    const cb = cur.character?.combat;
    const info: Record<string, OptionInfo> = {};
    const ECON = { action: "action", bonus: "bonus action", reaction: "reaction" } as const;
    for (const sg of [...a.attack.suggestions, ...a.damage.bonus.suggestions]) {
      const warnings: string[] = [];
      let preselect = false;
      const feature = cur.sheet?.actions.find((x) => x.name === sg.label && x.economy !== "free");
      if (feature && cb && feature.economy !== "free") {
        if (cb.usedThisTurn.includes(feature.id)) {
          preselect = true;
          if (feature.stopsMovement && cb.moved > 0) warnings.push(`You've moved ${cb.moved} ft this turn, but ${feature.name} sets your speed to 0: it only works if you stay put.`);
        } else {
          if (feature.notAfterMoving && cb.moved > 0) warnings.push(`You've moved ${cb.moved} ft this turn: ${feature.name} only works if you haven't moved.`);
          const used = feature.economy === "bonus" ? cb.bonus : feature.economy === "action" ? cb.action : cb.reaction;
          if (used > 0) warnings.push(`No ${ECON[feature.economy]} left this turn: you've already used it.`);
          else if (a.action === "bonus" && feature.economy === "bonus") warnings.push(`${feature.name} is a bonus action too, and ${a.name} uses your bonus action.`);
        }
      }
      if (sg.oncePerTurn && cb?.onceUsed.includes(sg.label)) warnings.push(`You've already used ${sg.label} this turn: it works once per turn.`);
      // Options that cost a resource (Stunning Strike, Hand of Harm: 1 ki).
      const costed = cur.sheet?.actions.find((x) => x.name === sg.label && x.cost);
      if (costed?.cost && costed.cost.remaining < costed.cost.amount) warnings.push(`No ${costed.cost.name} left.`);
      if (warnings.length || preselect) info[sg.label] = { ...(warnings.length ? { warning: `${warnings.join(" ")} Keep it only if your DM allows.` } : {}), ...(preselect ? { preselect } : {}) };
      const slots = smiteSlots(sg.label);
      if (slots) info[sg.label] = { ...info[sg.label], slots };
    }
    return info;
  };

  /**
   * Weapon attacks on your turn use the Attack action (Extra Attack counts);
   * off your turn they're a reaction (opportunity attack). Nothing is spent
   * until the attack is actually rolled.
   */
  const openAttack = (a: WeaponAttack) => {
    const cb = live.current.character?.combat;
    const reaction = !!cb && !cb.myTurn && a.action === "attack";
    const economy = reaction ? "reaction" : a.action === "bonus" ? "bonus" : "action";
    const melee = a.mode === "melee" || a.mode === "thrown";
    const light = a.properties.includes("light");
    const weapon: NonNullable<TurnIntent["weapon"]> = { attackId: a.attackId, light };
    if (a.itemInstanceId) weapon.itemInstanceId = a.itemInstanceId;
    if (a.offHand) weapon.offHand = true;
    if (a.requires) weapon.requires = a.requires;
    const perAction = live.current.sheet?.attacksPerAction ?? 1;
    const left = Math.max(1, perAction - (cb?.attacks ?? 0));
    const onCommit = () => {
      const now = live.current.character?.combat;
      if (!now) return;
      const kind = economy === "action" ? "attack" : economy;
      const label = kind === "attack" ? `Attack ${now.attacks + 1} of ${perAction}.` : reaction ? "Reaction used (opportunity attack)." : "Bonus action used.";
      const attackWith: Record<string, unknown> = { attackId: a.attackId, melee, light };
      if (a.itemInstanceId) attackWith.itemInstanceId = a.itemInstanceId;
      live.current.act("useEconomy", { kind, attackWith }, label);
    };
    const onDamageOptions = (labels: string[]) => {
      const once = labels.filter((l) => a.damage.bonus.suggestions.some((sg) => sg.label === l && sg.oncePerTurn));
      if (once.length && live.current.character?.combat) live.current.act("markOnce", { labels: once }, `${once.join(", ")} used this turn.`);
      // Options that cost something are spent when the damage is rolled (Stunning Strike, Hand of Harm: 1 ki).
      for (const l of labels) {
        const f = live.current.sheet?.actions.find((x) => x.name === l && x.cost && x.economy === "free");
        if (!f) continue;
        const dc = l === "Stunning Strike" ? kiDc() : undefined;
        live.current.act("useAction", { action: f.id }, `${f.name}: ${f.cost!.amount} ${f.cost!.name.toLowerCase()} spent.${dc ? ` The target makes a DC ${dc} Constitution save or is stunned until the end of your next turn.` : ""}`);
      }
    };
    askEndsOn("attack", () =>
      guard({ name: a.name, economy, attack: economy === "action", weapon }, () =>
        openRoll(a.name, a.attack, a, {
          optionInfo: () => optionInfoFor(a),
          onCommit,
          onDamageOptions,
          ...(economy === "action" && left > 1 ? { repeat: { count: left, what: "attacks" } } : {}),
        }),
      ),
    );
  };

  /** Initiative during a combat is kept on the combat card until the combat ends. */
  const rollInitiative = () =>
    openRoll("Initiative", live.current.sheet!.initiative, undefined, {
      onTotal: (n) => {
        if (live.current.character?.combat) live.current.act("setInitiative", { value: n }, `Initiative ${n}.`);
      },
    });

  const startCombat = () => {
    s.act("startCombat", {}, "Combat started.");
    rollInitiative();
  };

  const prompts: PlayPrompts = {
    spendResource: (r) => {
      if (r.pool) {
        open(r.name, () => {
          const cur = live.current.sheet?.resources.find((x) => x.id === r.id) ?? r;
          return (
            <>
              <p className="note">Pick the foretold roll you're using. Rolls you make in the roll screen offer them too.</p>
              <div className="pool">
                {(cur.pool?.values ?? []).map((v, i) => (
                  <button
                    key={i}
                    className="pool-value"
                    onClick={() => {
                      live.current.act("usePool", { resource: r.id, index: i }, `${r.name}: ${v} used.`);
                      close();
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                className="link"
                onClick={() => {
                  live.current.act("spendResource", { resource: r.id }, `${r.name} used.`);
                  close();
                }}
              >
                Just spend one
              </button>
            </>
          );
        });
        return;
      }
      if (!r.die) return void s.act("spendResource", { resource: r.id }, `${r.name} used.`);
      open(r.name, () => (
        <SpendDiePanel
          r={r}
          onRolled={(n) => {
            live.current.act("spendResource", { resource: r.id }, `${r.name}: rolled ${n}.`);
            close();
          }}
          onJustSpend={() => {
            live.current.act("spendResource", { resource: r.id }, `${r.name} used.`);
            close();
          }}
        />
      ));
    },
    spendSlot: (level, pact) =>
      open(pact ? "Pact Magic slot" : `Level ${level} slot`, () => (
        <SlotSpendPanel
          sheet={live.current.sheet!}
          level={level}
          pact={pact}
          onCast={(sp) => castFlow(sp, level, pact ? "pact" : "slot", selfByDefault(sp))}
          onJustSpend={() => {
            live.current.act("spendSlot", { level, pact }, pact ? "Pact slot spent." : `Level ${level} slot spent.`);
            close();
          }}
        />
      )),
    restore: (what, run) =>
      open("Get it back?", () => (
        <Confirm
          question="Are you trying to cheat?"
          detail={`You're restoring ${what} by hand.`}
          no="Yes, I am sorry..."
          yes="I am the master of my fate!"
          onNo={close}
          onYes={() => {
            run();
            close();
          }}
        />
      )),
    rest: (kind) =>
      open(kind === "short" ? "Short rest" : "Long rest", () => (
        <Confirm
          question="Are you still alive after the rest?"
          detail={
            kind === "short"
              ? "A short rest: short-rest features and Pact slots come back, and an hour passes."
              : "A long rest: full HP, spell slots, features and half your Hit Dice come back, and 8 hours pass."
          }
          no="Not yet, cancel"
          yes={kind === "short" ? "Yes, finish the short rest" : "Yes, finish the long rest"}
          onNo={close}
          onYes={() => {
            live.current.act("rest", { kind }, kind === "short" ? "Short rest." : "Long rest.");
            close();
          }}
        />
      )),
    rollPool: (r) =>
      open(r.name, () => (
        <PoolRollPanel
          r={r}
          onDone={(values) => {
            live.current.act("setPool", { resource: r.id, values }, `${r.name}: ${values.join(", ")}.`);
            close();
          }}
        />
      )),
  };

  const openMove = () =>
    open("Movement", () => (
      <MovePanel
        character={live.current.character!}
        sheet={live.current.sheet!}
        act={live.current.act}
        onDash={(economy) =>
          guard({ name: "Dash", economy }, () => live.current.act("useEconomy", { kind: economy, dash: true }, "Dash: your speed again."), {
            cancelled: openMove,
            done: openMove,
          })
        }
      />
    ));

  const openCompanionHp = (id: string) =>
    open("Companion's hit points", () => (
      <HpPad
        onDamage={(amount) => {
          live.current.act("damage", { amount, companion: id }, `Companion took ${amount} damage.`);
          openCompanion(id);
        }}
        onHeal={(amount) => {
          live.current.act("heal", { amount, companion: id }, `Companion healed ${amount}.`);
          openCompanion(id);
        }}
        onTemp={(amount) => {
          live.current.act("setTempHp", { amount, companion: id }, amount ? `Companion: ${amount} temporary HP.` : "Companion's temporary HP removed.");
          openCompanion(id);
        }}
        temp={live.current.sheet?.companions.find((x) => x.id === id)?.form?.hp.temp ?? 0}
      />
    ));

  const openCompanion = (id: string) =>
    open(sheet.companions.find((x) => x.id === id)?.name ?? "Companion", () => {
      const comp = live.current.sheet?.companions.find((x) => x.id === id);
      if (!comp) return <p className="note">This companion is gone.</p>;
      const command = live.current.sheet?.actions.find((a) => a.featureId && comp.source && a.economy === "bonus" && a.source === comp.source);
      return (
        <CompanionPanel
          comp={comp}
          character={live.current.character!}
          sheet={live.current.sheet!}
          act={live.current.act}
          open={open}
          openRoll={openRoll}
          openHp={() => openCompanionHp(id)}
          onCommand={() =>
            guard(
              { name: `Command ${comp.name}`, economy: "bonus" },
              () =>
                command
                  ? live.current.act("useAction", { action: command.id }, `${comp.name} commanded.`)
                  : live.current.act("useEconomy", { kind: "bonus" }, `${comp.name} commanded.`),
              { cancelled: () => openCompanion(id), done: () => openCompanion(id) },
            )
          }
          onAttackInstead={() =>
            guard(
              { name: `${comp.name} attacks`, economy: "action", attack: true },
              () => live.current.act("useEconomy", { kind: "attack" }, `${comp.name} attacks in place of one of your attacks.`),
              { cancelled: () => openCompanion(id), done: () => openCompanion(id) },
            )
          }
        />
      );
    });

  /** Preserve Life: 5 × cleric level hit points shared among up to 30 creatures, none above half its maximum. */
  const openPreserveLife = (free: boolean) => {
    const pool = 5 * (c.classes.find((x) => x.class === "class:cleric")?.level ?? 0);
    open("Preserve Life", () => {
      const ch = live.current.character;
      const sh = live.current.sheet;
      const myMax = ch && sh ? Math.max(0, Math.floor(sh.hpMax.total / 2) - ch.hp.current) : 0;
      return (
        <DistributePanel
          pool={pool}
          what="hit points"
          note="No creature above half its hit point maximum; not undead or constructs"
          myMax={myMax}
          onDone={(shares) => {
            const list = shares.map((x) => `${x.name} ${x.amount}`).join(", ");
            live.current.act("useAction", { action: "preserve-life", ...(free ? { free: true } : {}) }, `Preserve Life: ${list}.`);
            const me = shares.find((x) => x.me);
            if (me && Math.min(me.amount, myMax) > 0) live.current.act("heal", { amount: Math.min(me.amount, myMax) }, `You regain ${Math.min(me.amount, myMax)} hit points.`);
            open("Preserve Life: who got what", () => (
              <>
                <div className="group">
                  {shares.map((x, i) => (
                    <div className="row" key={i}>
                      <div className="row-main row-title">{x.name}</div>
                      <span className="num">+{x.me ? Math.min(x.amount, myMax) : x.amount}</span>
                    </div>
                  ))}
                </div>
                <p className="note">Total {shares.reduce((t, x) => t + x.amount, 0)} of {pool}. Each creature regains these hit points, up to half its maximum.</p>
              </>
            ));
          }}
        />
      );
    });
  };

  /** An always-on feature (Aura of Protection): what it does now, and why it's off if it is. */
  const openFeatureTag = (id: string) =>
    open(sheet.featureTags.find((t) => t.id === id)?.name ?? "Feature", () => {
      const t = live.current.sheet?.featureTags.find((x) => x.id === id);
      const f = live.current.sheet?.features.find((x) => x.id === id);
      if (!t) return null;
      return (
        <>
          <p className={t.active ? "pass" : "warn"}>{t.active ? "Working now." : `Off: ${t.why} It works again when that ends.`}</p>
          <Reminders items={t.reminders} />
          {f && <BookText text={f.text} summary={f.summary} source={f.source} />}
        </>
      );
    });

  /** A state chip (Rage, Flame Tongue lit): what it is, then use it properly, switch it on for free, or switch it off. */
  const openToggle = (name: string) => {
    const t = sheet.toggles.find((x) => x.name === name);
    if (!t) return;
    open(t.label, () => {
      const cur = live.current.sheet;
      const on = cur?.toggles.find((x) => x.name === name)?.on ?? false;
      const action = cur?.actions.find((a) => a.toggles.includes(name));
      const feature = cur?.features.find((f) => f.id === action?.featureId) ?? cur?.features.find((f) => f.name === t.label);
      const timer = live.current.character?.effects.find((e) => e.toggles?.includes(name));
      return (
        <>
          {timer?.rounds !== undefined && (
            <div className="row timer-row">
              <div className="row-main row-title">
                {timer.rounds} {timer.rounds === 1 ? "round" : "rounds"} left
              </div>
              <div className="stepper">
                <button
                  aria-label="One round less"
                  onClick={() =>
                    timer.rounds! <= 1
                      ? live.current.act("removeEffect", { instanceId: timer.id }, `${t.label} ended.`)
                      : live.current.act("updateEffect", { instanceId: timer.id, rounds: timer.rounds! - 1 }, `${t.label}: ${timer.rounds! - 1} rounds.`)
                  }
                >
                  −
                </button>
                <button aria-label="One round more" onClick={() => live.current.act("updateEffect", { instanceId: timer.id, rounds: timer.rounds! + 1 }, `${t.label}: ${timer.rounds! + 1} rounds.`)}>
                  +
                </button>
              </div>
            </div>
          )}
          {t.reminders && <Reminders items={live.current.sheet?.toggles.find((x) => x.name === name)?.reminders ?? t.reminders} />}
          {feature ? <BookText text={feature.text} summary={feature.summary} /> : action?.note && <p>{action.note}</p>}
          {on ? (
            <button
              className="big damage wide"
              style={{ marginTop: 12 }}
              onClick={() => {
                live.current.act("toggle", { name, on: false }, `${t.label} off.`);
                close();
              }}
            >
              Switch it off
            </button>
          ) : (
            <div className="confirm">
              {action && (
                <button className="big primary" onClick={() => openFeature(action)}>
                  Use as normal
                  <span className="sub">
                    {[action.cost ? `spends ${action.cost.name}` : "", action.economy !== "free" ? `uses your ${action.economy === "bonus" ? "bonus action" : action.economy}` : ""].filter(Boolean).join(", ") || "no cost"}
                  </span>
                </button>
              )}
              <button
                className="big"
                onClick={() => {
                  if (action) live.current.act("useAction", { action: action.id, free: true }, `${t.label} switched on (nothing spent).`);
                  else live.current.act("toggle", { name, on: true }, `${t.label} on.`);
                  close();
                }}
              >
                Just activate
                <span className="sub">forgot to switch it on: nothing is spent</span>
              </button>
            </div>
          )}
        </>
      );
    });
  };

  /** A condition's card, on top of whatever is open. */
  const showCondition = (id: string) => {
    const def = registry.find(id, "effect");
    if (!def) return;
    push(def.name, () => {
      const on = live.current.character?.effects.some((e) => e.effect === id);
      return (
        <>
          {def.summary && (
            <p>
              <RichText text={def.summary} />
            </p>
          )}
          {def.levelNotes && (
            <ol className="levels">
              {def.levelNotes.map((n) => (
                <li key={n} data-on="true">
                  {n}
                </li>
              ))}
            </ol>
          )}
          {def.reminders.length > 0 && (
            <ul className="reminders">
              {def.reminders.map((r) => (
                <li key={r}>
                  <RichText text={r} />
                </li>
              ))}
            </ul>
          )}
          {def.includes.length > 0 && (
            <p className="note">
              Also: <RichText text={def.includes.map((x) => registry.find(x, "effect")?.name ?? x).join(", ")} />
            </p>
          )}
          {!on && (
            <button
              className="big wide"
              style={{ marginTop: 12 }}
              onClick={() => {
                live.current.act("addEffect", { instanceId: crypto.randomUUID(), effect: id }, `${def.name}.`);
                back();
              }}
            >
              I'm {def.name.toLowerCase()} now
            </button>
          )}
        </>
      );
    });
  };

  const openTrait = (id: string) => {
    const f = sheet.features.find((x) => x.id === id);
    if (!f) return;
    open(f.name, () => {
      const x = live.current.sheet?.extras.find((e) => e.kind === "feat" && e.value === id);
      return (
        <>
          {x && <ExtraInline extra={x} act={live.current.act} />}
          {f.dc && <DcBig dc={f.dc} />}
          <BookText text={f.text} summary={f.summary} source={f.source} />
        </>
      );
    });
  };

  /** The casting classes, for the Spells tab's views. */
  const classLists: ClassList[] = c.classes.flatMap((cl) => {
    const def = registry.find(cl.class, "class");
    const sc = def?.spellcasting;
    if (!def || !sc || sc.progression === "none" || cl.level < (def.spellcastingFromLevel ?? 1)) return [];
    const kind: ClassList["kind"] = def.id === "class:wizard" ? "wizard" : def.spellPreparation === "prepared" ? "prepared" : "known";
    const list = spellListOf(c, registry, def.id);
    return [{ id: sc.id, className: def.name, kind, maxLevel: maxSpellLevel(def, cl.level), classes: list.classes, listName: list.name }];
  });

  /** A spell the character doesn't have: just its details. */
  const openSpellInfo = (id: string) => {
    const d = registry.find(id, "spell");
    if (!d) return;
    open(d.name, () => (
      <>
        <p className="row-sub">
          {d.level === 0 ? `${d.school} cantrip` : `Level ${d.level} ${d.school.toLowerCase()}`} · {d.castingTime} · {d.range} · {d.duration}
        </p>
        <BookText text={d.text} summary={d.summary} source={[d.source.book, d.source.page ? `p. ${d.source.page}` : ""].filter(Boolean).join(" ") || d.source.pack} />
      </>
    ));
  };

  /** Something the table gave beyond the rules. */
  const openAddExtra = () => open("Add something extra", () => (live.current.sheet ? <AddExtraPanel sheet={live.current.sheet} reg={registry} act={live.current.act} done={close} /> : null));
  const openExtra = (id: string) =>
    open("Beyond the rules", () => {
      const x = live.current.sheet?.extras.find((e) => e.id === id);
      return x ? <ExtraEditor extra={x} act={live.current.act} done={close} /> : <p className="note">It's gone.</p>;
    });
  const openSkill = (sk: Skill) =>
    openRoll(SKILL_NAMES[sk], sheet.skills[sk], undefined, {
      header: () => {
        const x = live.current.sheet && skillExtra(live.current.sheet, sk);
        return x ? <ExtraInline extra={x} act={live.current.act} /> : null;
      },
    });

  const openBooks = () => open("Book text", <BooksPanel report={bookReport} />);

  /** Everything left to choose for this character, and what's chosen. */
  const openBuild = () =>
    open("Choices", () => <BuildPanel get={() => live.current.character} reg={registry} push={push} act={live.current.act} back={back} onLevelUp={openLevelUp} onAddExtra={openAddExtra} onOpenExtra={openExtra} extras={live.current.sheet?.extras ?? []} />);

  const openLevelUp = () =>
    open("Level up", () =>
      live.current.character && live.current.sheet ? (
        <LevelUpPanel
          character={live.current.character}
          sheet={live.current.sheet}
          reg={registry}
          onLevel={(cls, hpRoll) => {
            live.current.act("levelUp", { class: cls, ...(hpRoll !== undefined ? { hpRoll } : {}) }, hpRoll !== undefined ? `Level up: rolled ${hpRoll} for hit points.` : "Level up.");
            openBuild();
          }}
          onLevelDown={(cls) => live.current.act("levelDown", { class: cls }, `${registry.find(cls, "class")?.name ?? "Class"} level removed.`)}
        />
      ) : null,
    );

  const openNewCharacter = () =>
    open(
      "New character",
      <NewCharacterPanel
        reg={registry}
        onCreate={async (input: NewCharacterInput) => {
          await s.create(newCharacter({ ...input, id: crypto.randomUUID() }, registry));
          openBuild();
        }}
      />,
    );

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const res = s.readImport(await file.text());
    if (!res.character) return open("Import", <p className="note danger-text">{res.error}</p>);
    const ch = res.character;
    if (!res.exists) {
      await s.create(ch, `${ch.name} imported.`);
      return close();
    }
    open("Import", () => (
      <Confirm
        question={`Replace ${ch.name}?`}
        detail={`${ch.name} is already on this device. The file's version replaces it, and its change history here is lost.`}
        no="No, keep this one"
        yes="Replace it"
        onNo={close}
        onYes={async () => {
          await s.create(ch, `${ch.name} replaced from the file.`);
          close();
        }}
      />
    ));
  };

  const confirmDelete = () =>
    open(`Delete ${c.name}?`, () => (
      <Confirm
        question={`Delete ${c.name}?`}
        detail="They move to Deleted characters, with everything they had, and you can restore them from there."
        no="No, keep them"
        yes={`Delete ${c.name}`}
        onNo={openRoster}
        onYes={async () => {
          await s.remove(c.id);
          close();
        }}
      />
    ));

  const openAdd = () => open("Add an item", <AddItemPanel registry={registry} act={s.act} close={close} />);

  const openCoin = (coin: "cp" | "sp" | "ep" | "gp" | "pp", label: string) =>
    open(label, () => <CoinPanel coin={coin} label={label} have={live.current.character?.currency[coin] ?? 0} act={live.current.act} />);

  const openEffect = (e: EffectResult) =>
    open(e.name, () => {
      const current = live.current.sheet?.effects.find((x) => x.instanceId === e.instanceId);
      if (!current) return <p className="note">{e.name} has ended.</p>;
      const release = current.release
        ? () =>
            guard({ name: current.name, economy: "reaction" }, () => {
              live.current.act("releaseReadied", { instanceId: current.instanceId }, current.release!.spell ? `${current.name.replace("Ready: ", "")} released.` : `${current.name}: done.`);
              const r = current.release!.spell;
              const sp = r && live.current.sheet?.spells.find((x) => x.id === r.id && x.list.id === r.list);
              if (sp) openSpell(sp, r.level);
              else close();
            })
        : undefined;
      return <EffectPanel e={current} act={live.current.act} close={close} {...(release ? { onRelease: release } : {})} />;
    });

  const openAddEffect = () =>
    open(
      "Add an effect",
      <AddEffectPanel registry={registry} act={s.act} close={close} onTransform={(d) => openTransform(d.transform === "creature" ? "truepolymorph" : "polymorph", { addEffect: d.id })} />,
    );

  /** Constitution save against a DC; a failure ends concentration (undo is one tap away). */
  const openConcentrationCheck = (dc: number) => {
    const name = live.current.character?.concentration?.name ?? "your spell";
    open(`Concentration: ${name}`, () => (
      <Composer
        title={`Concentration on ${name}`}
        base={live.current.sheet!.saves.con}
        dc={dc}
        onOptionsUsed={recordOptions}
        physical={live.current.character?.settings.physicalDice ?? true}
        onPhysicalChange={(p) => live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")}
        onRolled={(r) => live.current.addRoll(r)}
        onCheck={(passed) => {
          if (!passed) live.current.act("endConcentration", {}, "Concentration check failed.");
        }}
      />
    ));
  };

  const openConcentration = () => {
    const conc = c.concentration;
    if (!conc) return;
    open(`Concentrating on ${conc.name}`, () => {
      const cur = live.current.character?.concentration;
      const sp = live.current.sheet?.spells.find((x) => x.id === cur?.spell && (x.damage || x.heal));
      const level = cur?.level ?? sp?.level ?? 0;
      const timer = cur?.rounds !== undefined ? `${cur.rounds} ${cur.rounds === 1 ? "round" : "rounds"} left.` : cur?.minutes !== undefined ? `${formatMinutes(cur.minutes)} left.` : "";
      const step = cur?.rounds !== undefined ? 1 : cur?.minutes !== undefined && cur.minutes > 60 ? 60 : 10;
      const adjust = cur && (cur.rounds !== undefined || cur.minutes !== undefined)
        ? (dir: 1 | -1) =>
            cur.rounds !== undefined
              ? live.current.act("setConcentration", { rounds: Math.max(0, cur.rounds + dir * step) }, `${cur.name}: ${Math.max(0, cur.rounds + dir * step)} rounds.`)
              : live.current.act("setConcentration", { minutes: Math.max(0, cur.minutes! + dir * step) }, `${cur.name}: ${formatMinutes(Math.max(0, cur.minutes! + dir * step))}.`)
        : undefined;
      return (
        <ConcentrationPanel
          {...(adjust ? { adjust } : {})}
          timer={timer}
          {...(sp ? { onDamage: () => rollSpell(sp, level, true), damageLabel: `Roll ${sp.name} ${sp.heal && !sp.damage ? "healing" : "damage"}${level > sp.level ? ` (level ${level})` : ""}` } : {})}
          onCheck={openConcentrationCheck}
          onEnd={() => {
            live.current.act("endConcentration", {}, "Concentration ended.");
            close();
          }}
        />
      );
    });
  };

  /** Attack or damage for a spell at a slot level; beams and portent come along. */
  const rollSpell = (sp: SpellResult, level: number, damageOnly: boolean) => {
    const beams = sp.beams?.byLevel[sp.level === 0 ? 0 : level];
    const notes = beams && beams > 1 ? [`${beams} ${sp.beams!.what}, each its own attack: they can hit the same target or different ones. The app takes you through them one by one.`] : [];
    const portent = portentFor();
    open(sp.name, () => (
      <Composer
        title={sp.name}
        base={sp.attack ?? live.current.sheet!.saves.con}
        attack={spellAsAttack(sp, level)}
        damageOnly={damageOnly}
        notes={notes}
        typeChoices={(sp.typeChoices ?? []).flatMap((tc) => {
          const options = tc.kind === "awakened" ? tc.byLevel?.[level] ?? [] : tc.options;
          if (!options.length) return [];
          return [
            {
              label: tc.label,
              options,
              ...(tc.kind === "awakened" ? { note: "A damage type from another spell of this slot's level in your spellbook." } : {}),
              ...(tc.cost ? { onUse: () => live.current.act("spendResource", { resource: tc.cost!.resource, amount: tc.cost!.amount }, `${tc.label.split(",")[0]}: ${tc.cost!.amount} point spent.`) } : {}),
            },
          ];
        })}
        optionInfo={optionInfoFor(spellAsAttack(sp, level))}
        onOptionsUsed={recordOptions}
        {...(beams && beams > 1 ? { repeat: { count: beams, what: sp.beams!.what } } : {})}
        {...(portent && !damageOnly ? { portent } : {})}
        healing={!!sp.heal && !sp.damage}
        onHealSelf={(n) => {
          live.current.act("heal", { amount: n }, `Healed ${n}.`);
          close();
        }}
        physical={live.current.character?.settings.physicalDice ?? true}
        onPhysicalChange={(p) => live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")}
        onRolled={(r) => live.current.addRoll(r)}
      />
    ));
  };

  /**
   * Casting, from the spell sheet or from a slot on Play: effects that end on
   * casting ask first, the turn rules warn, free uses with none left ask
   * "Are you sure?", and the spell sheet comes back showing it was cast.
   */
  const castFlow = (sp: SpellResult, level: number, using: "slot" | "pact" | "free" | "ritual" | "none", selfEffect: boolean, readying = false, castingTime?: string) => {
    // Its effect asks for something first (Hex: which ability).
    const eff = selfEffect ? registry.find(sp.id.replace(/^spell:/, "effect:"), "effect") : undefined;
    const go = (choice?: string) => withComponent(sp, (consume) => castFlowAfterComponent(sp, level, using, selfEffect, readying, consume, choice, castingTime));
    if (eff?.choice && !readying)
      return open(sp.name, () => (
        <Choose
          question={eff.choice!.label}
          options={eff.choice!.options.map((o) => ({ label: ABILITY_NAMES[o as keyof typeof ABILITY_NAMES] ?? o, onPick: () => go(o) }))}
        />
      ));
    return go();
  };

  /**
   * A costly or consumed material component (PHB p. 203): a focus or pouch
   * can't stand in for it. Not ticked on the Items page: ask if they have it
   * (casting anyway is fine, the app just says so). Consumed: ask whether this
   * cast uses it up.
   */
  const withComponent = (sp: SpellResult, go: (consume: boolean) => void) => {
    const need = materialNeed(sp.material);
    if (!need) return go(false);
    const have = live.current.sheet?.components.find((x) => x.spell === sp.id)?.have ?? false;
    const askConsume = () =>
      need.consumed
        ? open(sp.name, () => (
            <Choose
              question="Use up the material component?"
              detail={`${sp.material} The spell consumes it.`}
              options={[
                { label: "Cancel", onPick: () => openSpell(sp) },
                { label: "Cast without using it up", onPick: () => go(false) },
                { label: "Use it up and cast", onPick: () => go(true) },
              ]}
            />
          ))
        : go(false);
    if (have) return askConsume();
    open(sp.name, () => (
      <Choose
        question="Do you have the material component?"
        detail={`${sp.name} needs ${(sp.material ?? "").replace(/\.$/, "")}. A component pouch or spellcasting focus can't replace a component with a cost${need.consumed ? " or one the spell consumes" : ""}.`}
        options={[
          { label: "Cancel", onPick: () => openSpell(sp) },
          { label: "No, cast it anyway", onPick: () => go(false) },
          {
            label: "Yes, I have it",
            onPick: () => {
              live.current.act("setComponent", { spell: sp.id, have: true }, `${sp.name}: material component ticked on your Items page.`);
              askConsume();
            },
          },
        ]}
      />
    ));
  };

  const castFlowAfterComponent = (
    sp: SpellResult,
    level: number,
    using: "slot" | "pact" | "free" | "ritual" | "none",
    selfEffect: boolean,
    readying: boolean,
    consume: boolean,
    choice?: string,
    castingTime?: string,
  ) => {
    const comp = consume ? { consumeComponent: true } : {};
    if (readying)
      return guard(
        { name: `Ready ${sp.name}`, economy: "action", spell: { level: sp.level, concentration: true } },
        () => {
          live.current.act("castSpell", { spell: sp.id, list: sp.list.id, level, using, readied: true, ...comp }, `${sp.name} readied.`);
          close();
        },
      );
    let transformed = false;
    const castIt = () =>
      askEndsOn(
        "cast",
        () =>
          guard(
            { name: sp.name, economy: using === "ritual" ? "free" : castingEconomy(castingTime ?? sp.castingTime), spell: { level: sp.level, concentration: sp.concentration } },
            () => {
              live.current.act(
                "castSpell",
                { spell: sp.id, list: sp.list.id, level, using, selfEffect, ...comp, ...(choice ? { choice } : {}), ...(castingTime ? { castingTime } : {}) },
                `${sp.name} cast${castingTime ? ` (${castingTime})` : ""}${choice ? `: ${ABILITY_NAMES[choice as keyof typeof ABILITY_NAMES] ?? choice}` : ""}.`,
              );
              flashForSpell(sp.id, level);
              // Polymorph or True Polymorph on yourself: which creature?
              const eff = selfEffect ? registry.find(sp.id.replace(/^spell:/, "effect:"), "effect") : undefined;
              const inst = eff?.transform ? [...(live.current.character?.effects ?? [])].reverse().find((e) => e.effect === eff.id) : undefined;
              if (eff?.transform && inst) {
                transformed = true;
                openTransform(eff.transform === "creature" ? "truepolymorph" : "polymorph", { effectId: inst.id });
              }
              // Spells that summon, create or animate creatures: which ones?
              const sum = registry.list("summon").find((x) => x.spell === sp.id);
              if (sum) {
                transformed = true;
                openSummon(sum.id, level);
              }
            },
            { cancelled: () => openSpell(sp), done: () => (transformed ? undefined : openSpell(sp, level)) },
          ),
        () => (transformed ? undefined : openSpell(sp, level)),
      );
    if (using === "free" && sp.cast.free && sp.cast.free.remaining <= 0)
      open(sp.name, () => (
        <Confirm
          question="Are you sure?"
          detail={`You have no ${sp.cast.free!.name} left.`}
          no="No, cancel"
          yes={`Cast ${sp.name} anyway`}
          onNo={() => openSpell(sp)}
          onYes={castIt}
        />
      ));
    else castIt();
  };

  /** Spells cast on yourself put their effect on you unless you say otherwise. */
  const selfByDefault = (sp: SpellResult) => {
    const eff = registry.find(sp.id.replace(/^spell:/, "effect:"), "effect");
    // Cast on yourself or what you touch (Shillelagh); the caster's side of Hex and Hunter's Mark is always tracked.
    return !!eff && (!!eff.selfOnly || /^(self|touch)/i.test(sp.range));
  };

  const openSpell = (first: SpellResult, castAt?: number, readying = false) =>
    open(first.name, () => {
      const sp = live.current.sheet?.spells.find((x) => x.id === first.id && x.list.id === first.list.id) ?? first;
      const roller = (level: number, damageOnly: boolean) => rollSpell(sp, level, damageOnly);
      const extra = live.current.sheet?.extras.find((x) => x.kind === "spell" && x.value === sp.id);
      return (
        <>
        {extra && <ExtraInline extra={extra} act={live.current.act} />}
        <SpellPanel
          sp={sp}
          sheet={live.current.sheet!}
          hasSelfEffect={registry.has(sp.id.replace(/^spell:/, "effect:"))}
          selfDefault={selfByDefault(sp)}
          casterSide={!!registry.find(sp.id.replace(/^spell:/, "effect:"), "effect")?.selfOnly}
          initialCast={castAt}
          readying={readying}
          onCast={(level, using, selfEffect, castingTime) => castFlow(sp, level, using, selfEffect, readying, castingTime)}
          onPrepare={(prepared) => live.current.act("setPrepared", { spell: sp.id, list: sp.list.id, prepared }, `${sp.name} ${prepared ? "prepared" : "unprepared"}.`)}
          onRollAttack={(level) => roller(level, false)}
          onRollDamage={(level) => roller(level, true)}
        />
        </>
      );
    });

  const openRollHistory = () =>
    open("Rolls", () => (
      <>
        {live.current.rolls.length === 0 && <p className="note">Rolls you make appear here, newest first.</p>}
        {live.current.rolls.map((r) => (
          <details className="history" key={r.id}>
            <summary>
              <span className="row-main">
                <span className="row-title">{r.title}</span>
                <span className="row-sub"> {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <b className={r.crit ? "crit-text" : r.fumble ? "danger-text" : ""}>{r.total}</b>
            </summary>
            <ResultView r={r} />
          </details>
        ))}
      </>
    ));

  const openDeleted = () => open("Deleted characters", () => <DeletedPanel list={live.current.deleted} restore={async (id) => { await live.current.restore(id); close(); }} purge={live.current.purge} />);

  const openRoster = () =>
    open(
      "Characters",
      () => <>
        <div className="group">
          {s.roster.map((r) => (
            <button
              className="row"
              key={r.id}
              aria-current={r.id === s.selectedId}
              onClick={() => {
                s.select(r.id);
                close();
              }}
            >
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">{r.summary}</div>
              </div>
              {r.id === s.selectedId && <span className="tag adv">open</span>}
            </button>
          ))}
        </div>
        <div className="big-actions" style={{ marginTop: 12 }}>
          <button className="big primary" onClick={openNewCharacter}>
            New character
          </button>
          <label className="big file-button">
            Import a file
            <input type="file" accept=".json,application/json" onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
        </div>
        <button className="big" style={{ width: "100%", marginTop: 12 }} onClick={s.exportSelected}>
          Export {c.name} as a file
        </button>
        <p className="note">Everything is saved on this device as you play. Export makes a backup you can keep or move to another device.</p>
        <button className="big" style={{ width: "100%", marginTop: 12 }} onClick={openBooks}>
          Book text{bookReport ? " (loaded)" : ""}
        </button>
        <FlashSetting />
        {live.current.deleted.length > 0 && (
          <button className="big" style={{ width: "100%", marginTop: 12 }} onClick={openDeleted}>
            Deleted characters ({live.current.deleted.length})
          </button>
        )}
        <button className="link danger-text" style={{ marginTop: 16 }} onClick={confirmDelete}>
          Delete {c.name}
        </button>
      </>,
    );

  return (
    <ConditionLinks.Provider value={showCondition}>
    <div className="app">
      <header className="strip">
        <button className="who" onClick={openRoster} aria-label={`${c.name}. Switch character`}>
          <span className="who-name">{c.name}</span>
          <span className="who-class">{s.roster.find((r) => r.id === s.selectedId)?.summary}</span>
        </button>

        <div className="vitals">
          <button className="hp" onClick={openHp} aria-label={`Hit points ${hpNow} of ${sheet.hpMax.total}${c.hp.temp ? `, ${c.hp.temp} temporary` : ""}. Change`}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hp-now">{sheet.shape ? sheet.shape.hp.current : hpNow}</span>
                <span className="hp-max">/ {sheet.shape ? sheet.shape.hp.max : sheet.hpMax.total}</span>
                {sheet.shape ? <span className="hp-temp">{sheet.shape.name}</span> : c.hp.temp > 0 && <span className="hp-temp">+{c.hp.temp} temp</span>}
              </div>
              <div className="hp-bar" aria-hidden="true">
                <span style={{ width: `${sheet.shape ? Math.round((sheet.shape.hp.current / sheet.shape.hp.max) * 100) : hpPct}%` }} />
              </div>
            </div>
          </button>
          <button className="stat" onClick={() => (sheet.shape ? openShape() : open("Armor Class", <BreakdownLines b={sheet.ac} totalLabel="AC" />))}>
            <b>{sheet.shape ? sheet.shape.ac : sheet.ac.total}</b>
            <small>AC</small>
          </button>
          <button className="stat" onClick={rollInitiative}>
            <b>{formatBonus(sheet.initiative)}</b>
            <small>{sheet.initiative.advantage.length ? "Init, adv" : "Init"}</small>
          </button>
          <button
            className="stat"
            onClick={() =>
              open("Speed", () => {
                const sh = live.current.sheet!;
                return (
                  <>
                    <h2 className="sub-head">Walking</h2>
                    <BreakdownLines b={sh.speed} totalLabel="Feet" />
                    {sh.speeds.map((x) => (
                      <div key={x.mode}>
                        <h2 className="sub-head">
                          {x.mode === "fly" ? "Flying" : x.mode === "swim" ? "Swimming" : "Climbing"}
                          {x.hover ? " (hover)" : ""}
                        </h2>
                        <BreakdownLines b={x.total} totalLabel="Feet" />
                      </div>
                    ))}
                    {sh.speeds.some((x) => x.mode === "fly" && !x.hover) && <p className="note">Flying without hover: knocked prone, speed 0 or unable to move, you fall.</p>}
                  </>
                );
              })
            }
          >
            <b>{sheet.shape ? Number(/^(\d+)/.exec(sheet.shape.speed)?.[1] ?? 0) : sheet.speed.total}</b>
            <small>{sheet.speeds.length ? sheet.speeds.map((x) => `${x.mode} ${x.total.total}`).join(" · ") : "Speed"}</small>
          </button>
        </div>

        <EffectChips onCondition={showCondition} effects={sheet.effects.filter((e) => {
          // Rage and Form of Dread show as switches instead; Dodge has no switch, so it shows here.
          const inst = c.effects.find((x) => x.id === e.instanceId);
          return !inst?.toggles?.length || inst.untilTurnStart;
        })} onOpen={openEffect} onAdd={openAddEffect} concentration={sheet.concentration} onConcentration={openConcentration} />

        {sheet.featureTags.length > 0 && (
          <div className="switches" role="group" aria-label="Always-on features">
            {sheet.featureTags.map((t) => (
              <button key={t.id} className={`switch aura${t.active ? "" : " off"}`} aria-pressed={t.active} onClick={() => openFeatureTag(t.id)}>
                {t.name}
                {t.active ? "" : " (off)"}
              </button>
            ))}
          </div>
        )}
        {sheet.toggles.length > 0 && (
          <div className="switches" role="group" aria-label="Active states">
            {sheet.toggles.map((t) => (
              <button
                key={t.name}
                className="switch"
                aria-pressed={t.on}
                onClick={() => openToggle(t.name)}
              >
                {t.label}
                {(() => {
                  const r = c.effects.find((e) => e.toggles?.includes(t.name))?.rounds;
                  return t.on && r !== undefined ? ` (${r})` : "";
                })()}
              </button>
            ))}
          </div>
        )}
      </header>

      {(tab === "sheet" || (tab === "play" && openChoices > 0)) && (
        <div className="build-bar">
          <button className={`big${openChoices ? " todo" : ""}`} onClick={openBuild}>
            {openChoices ? `${openChoices} ${openChoices === 1 ? "choice" : "choices"} to make` : "Choices"}
            <span className="sub">skills, spells, subclass, ASIs…</span>
          </button>
          {tab === "sheet" && (
            <button className="big primary" onClick={openLevelUp}>
              Level up
              <span className="sub">to level {sheet.level + 1}</span>
            </button>
          )}
        </div>
      )}

      {tab === "play" && (
        <PlayTab
          character={c}
          sheet={sheet}
          act={s.act}
          openHp={openHp}
          openHitDie={openHitDie}
          rolls={s.rolls}
          openRollHistory={openRollHistory}
          onStartCombat={startCombat}
          prompts={prompts}
          onInitiative={rollInitiative}
          openDeathSave={openDeathSave}
          openBackground={openBackground}
          openMove={openMove}
          openCompanion={openCompanion}
          openShape={openShape}
          openTransform={openTransform}
          openSummonGroup={openSummonGroup}
          reg={registry}
          openLimited={(id) => {
            const a = live.current.sheet?.actions.find((x) => x.id === id);
            if (a) openFeature(a);
          }}
        />
      )}
      {tab === "actions" && <ActionsTab sheet={sheet} open={open} openRoll={openRoll} openAttack={openAttack} openFeature={openFeature} />}
      {tab === "spells" && <SpellsTab sheet={sheet} openSpell={openSpell} classLists={classLists} reg={registry} openSpellInfo={openSpellInfo} />}
      {tab === "sheet" && <SheetTab
          sheet={sheet}
          character={c}
          openAbility={(ab) =>
            open(`${ABILITY_NAMES[ab]} score`, () =>
              live.current.character && live.current.sheet ? <AbilityAdjustPanel ab={ab} character={live.current.character} sheet={live.current.sheet} act={live.current.act} /> : null,
            )
          }
          open={open}
          openRoll={openRoll} openTrait={openTrait} openSkill={openSkill} openAddExtra={openAddExtra} openExtra={openExtra}
          openAdjust={(k) => open(k === "save" ? "Saving throws: bonus or penalty" : k === "skill" ? "Skills: bonus or penalty" : "Passive senses: bonus or penalty", () => (live.current.character ? <RollAdjustPanel kind={k} c={live.current.character} act={live.current.act} /> : null))} />}
      {tab === "story" && <BackstoryTab c={c} act={s.act} />}
      {tab === "inventory" && (
        <InventoryTab character={c} registry={registry} openItem={openItem} openAdd={openAdd} openCoin={openCoin} sheet={sheet} act={s.act} />
      )}

      <nav className="tabs" aria-label="Sections">
        <div className="tabs-inner">
          {TABS.filter((t) => t.id !== "spells" || sheet.spells.length > 0 || sheet.spellcasting.length > 0).map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {panel && (
        <BottomSheet title={panel.title} onClose={back} {...(panels.length > 1 ? { onBack: back } : {})}>
          {typeof panel.body === "function" ? panel.body() : panel.body}
        </BottomSheet>
      )}

      {s.toast && (
        <SwipeAway className="toast" key={s.toast.id} onDismiss={() => s.setToast(null)}>
          <p>{s.toast.text}</p>
          {s.toast.canUndo && s.canUndo && <button onClick={s.undo}>Undo</button>}
        </SwipeAway>
      )}
    </div>
    </ConditionLinks.Provider>
  );
}

/** What to do while concentrating: check after damage, or end it. */
function ConcentrationPanel({
  onCheck,
  onEnd,
  onDamage,
  damageLabel,
  timer,
  adjust,
}: {
  onCheck: (dc: number) => void;
  onEnd: () => void;
  onDamage?: () => void;
  damageLabel?: string;
  timer: string;
  adjust?: (dir: 1 | -1) => void;
}) {
  const [dc, setDc] = useState(10);
  return (
    <>
      {timer && (
        <div className="row timer-row">
          <div className="row-main row-title">{timer}</div>
          {adjust && (
            <div className="stepper">
              <button aria-label="Less time" onClick={() => adjust(-1)}>
                −
              </button>
              <button aria-label="More time" onClick={() => adjust(1)}>
                +
              </button>
            </div>
          )}
        </div>
      )}
      {onDamage && (
        <button className="big primary wide" style={{ marginBottom: 12 }} onClick={onDamage}>
          {damageLabel}
          <span className="sub">its ongoing damage, this turn</span>
        </button>
      )}
      <p className="note">When you take damage, make a Constitution save: DC 10 or half the damage, whichever is higher. The app asks for it on its own when you enter damage.</p>
      <div className="group">
        <div className="row">
          <div className="row-main row-title">DC</div>
          <div className="stepper">
            <button aria-label="Lower DC" onClick={() => setDc(Math.max(10, dc - 1))}>−</button>
            <span>{dc}</span>
            <button aria-label="Raise DC" onClick={() => setDc(dc + 1)}>+</button>
          </div>
        </div>
      </div>
      <button className="big wide" style={{ marginTop: 10 }} onClick={() => onCheck(dc)}>
        Concentration check
      </button>
      <button className="big damage wide" style={{ marginTop: 10 }} onClick={onEnd}>
        End concentration
      </button>
    </>
  );
}

/** The phone's flashlight for light spells: per device, off until switched on, tested when switched on. */
function FlashSetting() {
  const [on, setOn] = useState(flashEnabled());
  const [msg, setMsg] = useState("");
  return (
    <>
      <label className="row check" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={on}
          onChange={async () => {
            if (on) {
              setFlashEnabled(false);
              setOn(false);
              setMsg("");
              return;
            }
            setMsg("Testing the flashlight…");
            const works = await flashTorch(0);
            setFlashEnabled(works);
            setOn(works);
            setMsg(works ? "On: light spells blink the flashlight, once per spell level." : "This phone's browser can't control the flashlight (iPhones don't allow it; Chrome on Android does).");
          }}
        />
        <div className="row-main">
          <div className="row-title">Flash my phone's light for light spells</div>
          <div className="row-sub">Light, Create Bonfire, Daylight, Charm of Sunlight, a Flame Tongue igniting… A cantrip flashes once; other spells blink once per level.</div>
        </div>
      </label>
      {msg && <p className="note">{msg}</p>}
    </>
  );
}

/** No characters yet: make one, or bring one in from a file. */
interface DeletedEntry {
  id: string;
  name: string;
  summary: string;
  deletedAt: number;
}

/** Deleted characters, newest first: restore one as it was, or remove it for good. */
function DeletedPanel({ list, restore, purge }: { list: DeletedEntry[]; restore: (id: string) => void | Promise<void>; purge: (id: string) => void | Promise<void> }) {
  const [sure, setSure] = useState<string | null>(null);
  if (!list.length) return <p className="note">No deleted characters.</p>;
  return (
    <>
      <p className="note">Deleted characters keep everything they had: changes, rolls and history.</p>
      <div className="group">
        {list.map((d) => (
          <div className="row" key={d.id}>
            <div className="row-main">
              <div className="row-title">{d.name}</div>
              <div className="row-sub">
                {d.summary ? `${d.summary} · ` : ""}deleted {new Date(d.deletedAt).toLocaleDateString()}
              </div>
            </div>
            <button className="chip" onClick={() => void restore(d.id)}>
              Restore
            </button>
            {sure === d.id ? (
              <button className="chip danger-text" onClick={() => void purge(d.id)}>
                Sure? Delete for good
              </button>
            ) : (
              <button className="chip" aria-label={`Delete ${d.name} for good`} onClick={() => setSure(d.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Welcome({
  create,
  readImport,
  deleted,
  restore,
  purge,
}: {
  create: (c: Character, label?: string) => Promise<void>;
  readImport: (text: string) => { character?: Character; error?: string };
  deleted: DeletedEntry[];
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
}) {
  const [making, setMaking] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <main style={{ padding: 16 }}>
      <h2>Your characters</h2>
      {making ? (
        <NewCharacterPanel reg={registry} onCreate={(input) => void create(newCharacter({ ...input, id: crypto.randomUUID() }, registry))} />
      ) : (
        <>
          <p className="note">{deleted.length ? "No characters here right now." : "No characters on this device yet."}</p>
          <div className="big-actions">
            <button className="big primary" onClick={() => setMaking(true)}>
              New character
            </button>
            <label className="big file-button">
              Import a file
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const res = readImport(await f.text());
                  if (res.character) await create(res.character, `${res.character.name} imported.`);
                  else setMsg(res.error ?? "");
                }}
              />
            </label>
          </div>
          {msg && <p className="note danger-text">{msg}</p>}
          {deleted.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>Deleted characters</h3>
              <DeletedPanel list={deleted} restore={restore} purge={purge} />
            </>
          )}
        </>
      )}
    </main>
  );
}
