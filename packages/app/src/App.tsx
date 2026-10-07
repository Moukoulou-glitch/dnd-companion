import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { castingEconomy, formatBonus, signed, turnWarnings, type TurnIntent } from "@dnd/engine";
import { SKILL_NAMES, type Skill } from "@dnd/schema";
import type { ComposerBase } from "@dnd/dice";
import type { ActionResult, EffectResult, SpellResult, WeaponAttack } from "@dnd/engine";
import { ActionsTab } from "./components/ActionsTab";
import { CompanionPanel, MovePanel } from "./components/Combat";
import { SwipeAway } from "./components/Swipe";
import { ConditionLinks, RichText } from "./components/Conditions";
import { Composer, ResultView } from "./components/Composer";
import { AddEffectPanel, EffectChips, EffectPanel } from "./components/Effects";
import { FeaturePanel } from "./components/FeaturePanel";
import { HpPad } from "./components/HpPad";
import { AddItemPanel, CoinPanel, InventoryTab, ItemPanel } from "./components/InventoryTab";
import { bookReport, registry } from "./content";
import { BookText, BooksPanel } from "./components/BookText";
import { flashEnabled, flashForFeature, flashForSpell, flashTorch, setFlashEnabled } from "./flash";
import { PlayTab, type PlayPrompts } from "./components/PlayTab";
import { Confirm, PoolRollPanel, SlotSpendPanel, SpendDiePanel } from "./components/Prompts";
import { BottomSheet, BreakdownLines } from "./components/Sheet";
import { SheetTab } from "./components/SheetTab";
import { SpellPanel, SpellsTab, spellAsAttack } from "./components/SpellsTab";
import { useCharacters } from "./useCharacters";
import { formatMinutes } from "./time";

type Tab = "play" | "actions" | "spells" | "sheet" | "inventory";
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "actions", label: "Actions" },
  { id: "spells", label: "Spells" },
  { id: "sheet", label: "Sheet" },
  { id: "inventory", label: "Items" },
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

  // Toasts disappear after a few seconds; undo stays reachable in the meantime.
  useEffect(() => {
    if (!s.toast) return;
    const t = setTimeout(() => s.setToast(null), 6000);
    return () => clearTimeout(t);
  }, [s.toast, s.setToast]);

  if (!s.ready) return null;
  if (s.error && !s.character) return <p style={{ padding: 16 }}>{s.error}</p>;
  if (!s.character || !s.sheet) return <p style={{ padding: 16 }}>No characters on this device yet.</p>;

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
  const hpPct = Math.round((hpNow / sheet.hpMax.total) * 100);

  const openHp = () =>
    open(
      "Hit points",
      <HpPad
        onDamage={(amount, type) => {
          const prompts = s.act("damage", { amount, damageType: type }, `Took ${amount}${type ? ` ${type}` : ""} damage.`);
          const check = prompts.find((p) => p.kind === "concentration");
          if (check) openConcentrationCheck(check.dc);
          else close();
        }}
        onHeal={(amount) => {
          s.act("heal", { amount }, `Healed ${amount}.`);
          close();
        }}
        onTemp={(amount) => {
          s.act("setTempHp", { amount }, amount ? `${amount} temporary HP.` : "Temporary HP removed.");
          close();
        }}
        temp={c.hp.temp}
      />,
    );

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
      optionInfo?: Record<string, { warning?: string; preselect?: boolean }>;
      onCommit?: (n: number) => void;
      repeat?: { count: number; what: string };
      onDamageOptions?: (labels: string[]) => void;
      dc?: number;
    } = {},
  ) =>
    open(title, () => (
      <Composer
        title={title}
        base={base}
        {...(attack ? { attack } : {})}
        {...(opts.notes ? { notes: opts.notes } : {})}
        {...(opts.optionInfo ? { optionInfo: opts.optionInfo } : {})}
        {...(opts.onCommit ? { onCommit: opts.onCommit } : {})}
        {...(opts.repeat ? { repeat: opts.repeat } : {})}
        {...(opts.onDamageOptions ? { onDamageOptions: opts.onDamageOptions } : {})}
        {...(opts.dc !== undefined ? { dc: opts.dc } : {})}
        {...(portentFor() ? { portent: portentFor()! } : {})}
        onOptionsUsed={recordOptions}
        physical={live.current.character?.settings.physicalDice ?? true}
        onPhysicalChange={(p) =>
          live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")
        }
        onRolled={(r) => {
          live.current.addRoll(r);
          opts.onTotal?.(r.total);
        }}
      />
    ));

  const openFeature = (a: ActionResult) => {
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
          onUse={(rolled, free, check, choice) => {
            // Readying a spell: pick it, then cast it now and hold it.
            if (choice === "Cast a Spell" && current.choose) return openReadySpell();
            const payload = { action: a.id, ...(rolled === undefined ? {} : { rolled }), ...(free ? { free: true } : {}), ...(choice ? { choice } : {}) };
            const label = choice
              ? `${a.name}: ${choice}. Use your reaction when the trigger happens.`
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
                  if (sk && base) openRoll(`${current.name}: ${SKILL_NAMES[sk]}`, base, undefined, current.check?.dc !== undefined ? { dc: current.check.dc } : {});
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
  const optionInfoFor = (a: WeaponAttack) => {
    const cur = live.current;
    const cb = cur.character?.combat;
    const info: Record<string, { warning?: string; preselect?: boolean }> = {};
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
      if (warnings.length || preselect) info[sg.label] = { ...(warnings.length ? { warning: `${warnings.join(" ")} Keep it only if your DM allows.` } : {}), ...(preselect ? { preselect } : {}) };
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
    };
    askEndsOn("attack", () =>
      guard({ name: a.name, economy, attack: economy === "action", weapon }, () =>
        openRoll(a.name, a.attack, a, {
          optionInfo: optionInfoFor(a),
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
    open(f.name, <BookText text={f.text} summary={f.summary} source={f.source} />);
  };

  const openBooks = () => open("Book text", <BooksPanel report={bookReport} />);

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

  const openAddEffect = () => open("Add an effect", <AddEffectPanel registry={registry} act={s.act} close={close} />);

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
  const castFlow = (sp: SpellResult, level: number, using: "slot" | "pact" | "free" | "ritual" | "none", selfEffect: boolean, readying = false) => {
    if (readying)
      return guard(
        { name: `Ready ${sp.name}`, economy: "action", spell: { level: sp.level, concentration: true } },
        () => {
          live.current.act("castSpell", { spell: sp.id, list: sp.list.id, level, using, readied: true }, `${sp.name} readied.`);
          close();
        },
      );
    const castIt = () =>
      askEndsOn(
        "cast",
        () =>
          guard(
            { name: sp.name, economy: using === "ritual" ? "free" : castingEconomy(sp.castingTime), spell: { level: sp.level, concentration: sp.concentration } },
            () => {
              live.current.act("castSpell", { spell: sp.id, list: sp.list.id, level, using, selfEffect }, `${sp.name} cast.`);
              flashForSpell(sp.id, level);
            },
            { cancelled: () => openSpell(sp), done: () => openSpell(sp, level) },
          ),
        () => openSpell(sp, level),
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
  const selfByDefault = (sp: SpellResult) => registry.has(sp.id.replace(/^spell:/, "effect:")) && /self/i.test(sp.range);

  const openSpell = (first: SpellResult, castAt?: number, readying = false) =>
    open(first.name, () => {
      const sp = live.current.sheet?.spells.find((x) => x.id === first.id && x.list.id === first.list.id) ?? first;
      const roller = (level: number, damageOnly: boolean) => rollSpell(sp, level, damageOnly);
      return (
        <SpellPanel
          sp={sp}
          sheet={live.current.sheet!}
          hasSelfEffect={registry.has(sp.id.replace(/^spell:/, "effect:"))}
          initialCast={castAt}
          readying={readying}
          onCast={(level, using, selfEffect) => castFlow(sp, level, using, selfEffect, readying)}
          onPrepare={(prepared) => live.current.act("setPrepared", { spell: sp.id, list: sp.list.id, prepared }, `${sp.name} ${prepared ? "prepared" : "unprepared"}.`)}
          onRollAttack={(level) => roller(level, false)}
          onRollDamage={(level) => roller(level, true)}
        />
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

  const openRoster = () =>
    open(
      "Characters",
      <>
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
        <button className="big" style={{ width: "100%", marginTop: 12 }} onClick={s.exportSelected}>
          Export {c.name} as a file
        </button>
        <p className="note">Everything is saved on this device as you play. Export makes a backup you can keep or move to another device.</p>
        <button className="big" style={{ width: "100%", marginTop: 12 }} onClick={openBooks}>
          Book text{bookReport ? " (loaded)" : ""}
        </button>
        <FlashSetting />
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
                <span className="hp-now">{hpNow}</span>
                <span className="hp-max">/ {sheet.hpMax.total}</span>
                {c.hp.temp > 0 && <span className="hp-temp">+{c.hp.temp} temp</span>}
              </div>
              <div className="hp-bar" aria-hidden="true">
                <span style={{ width: `${hpPct}%` }} />
              </div>
            </div>
          </button>
          <button className="stat" onClick={() => open("Armor Class", <BreakdownLines b={sheet.ac} totalLabel="AC" />)}>
            <b>{sheet.ac.total}</b>
            <small>AC</small>
          </button>
          <button className="stat" onClick={rollInitiative}>
            <b>{formatBonus(sheet.initiative)}</b>
            <small>{sheet.initiative.advantage.length ? "Init, adv" : "Init"}</small>
          </button>
          <button className="stat" onClick={() => open("Speed", <BreakdownLines b={sheet.speed} totalLabel="Feet" />)}>
            <b>{sheet.speed.total}</b>
            <small>Speed</small>
          </button>
        </div>

        <EffectChips onCondition={showCondition} effects={sheet.effects.filter((e) => {
          // Rage and Form of Dread show as switches instead; Dodge has no switch, so it shows here.
          const inst = c.effects.find((x) => x.id === e.instanceId);
          return !inst?.toggles?.length || inst.untilTurnStart;
        })} onOpen={openEffect} onAdd={openAddEffect} concentration={sheet.concentration} onConcentration={openConcentration} />

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
          openMove={openMove}
          openCompanion={openCompanion}
        />
      )}
      {tab === "actions" && <ActionsTab sheet={sheet} open={open} openRoll={openRoll} openAttack={openAttack} openFeature={openFeature} />}
      {tab === "spells" && <SpellsTab sheet={sheet} openSpell={openSpell} />}
      {tab === "sheet" && <SheetTab sheet={sheet} open={open} openRoll={openRoll} openTrait={openTrait} />}
      {tab === "inventory" && (
        <InventoryTab character={c} registry={registry} openItem={openItem} openAdd={openAdd} openCoin={openCoin} />
      )}

      <nav className="tabs" aria-label="Sections">
        <div className="tabs-inner">
          {TABS.filter((t) => t.id !== "spells" || sheet.spells.length > 0).map((t) => (
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
          <div className="row-sub">Light, Daylight, Charm of Sunlight… A cantrip flashes once; other spells blink once per level.</div>
        </div>
      </label>
      {msg && <p className="note">{msg}</p>}
    </>
  );
}
