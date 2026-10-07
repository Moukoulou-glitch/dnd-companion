import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { castingEconomy, formatBonus, turnWarnings, type TurnIntent } from "@dnd/engine";
import type { ComposerBase } from "@dnd/dice";
import type { ActionResult, EffectResult, SpellResult, WeaponAttack } from "@dnd/engine";
import { ActionsTab } from "./components/ActionsTab";
import { CompanionPanel, MovePanel } from "./components/Combat";
import { Composer, ResultView } from "./components/Composer";
import { AddEffectPanel, EffectChips, EffectPanel } from "./components/Effects";
import { FeaturePanel } from "./components/FeaturePanel";
import { HpPad } from "./components/HpPad";
import { AddItemPanel, CoinPanel, InventoryTab, ItemPanel } from "./components/InventoryTab";
import { bookReport, registry } from "./content";
import { BookText, BooksPanel } from "./components/BookText";
import { PlayTab } from "./components/PlayTab";
import { BottomSheet, BreakdownLines } from "./components/Sheet";
import { SheetTab } from "./components/SheetTab";
import { SpellPanel, SpellsTab, spellAsAttack } from "./components/SpellsTab";
import { useCharacters } from "./useCharacters";

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
  const [panel, setPanel] = useState<{ title: string; body: ReactNode | (() => ReactNode) } | null>(null);
  const open = useCallback((title: string, body: ReactNode | (() => ReactNode)) => setPanel({ title, body }), []);
  const close = useCallback(() => setPanel(null), []);

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
  const guard = (intent: TurnIntent, proceed: () => void, back?: { cancelled?: () => void; done?: () => void }) => {
    const cur = live.current;
    const warnings = cur.character && cur.sheet ? turnWarnings(cur.character, cur.sheet, intent) : [];
    if (!warnings.length) return proceed();
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
              if (back?.done) back.done();
              else close();
            }}
          >
            Use anyway
          </button>
        </div>
      </>
    ));
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
          s.act("setTempHp", { amount }, `${amount} temporary HP.`);
          close();
        }}
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
  const openRoll = (title: string, base: ComposerBase, attack?: WeaponAttack) =>
    open(title, () => (
      <Composer
        title={title}
        base={base}
        {...(attack ? { attack } : {})}
        physical={live.current.character?.settings.physicalDice ?? true}
        onPhysicalChange={(p) =>
          live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")
        }
        onRolled={(r) => live.current.addRoll(r)}
      />
    ));

  const openFeature = (a: ActionResult) =>
    open(a.name, () => {
      const current = live.current.sheet?.actions.find((x) => x.id === a.id) ?? a;
      const feature = live.current.sheet?.features.find((f) => f.id === current.featureId);
      return (
        <FeaturePanel
          a={current}
          text={feature?.text}
          physical={live.current.character?.settings.physicalDice ?? true}
          onUse={(rolled) =>
            guard({ name: current.name, economy: current.economy }, () => {
              live.current.act("useAction", rolled === undefined ? { action: a.id } : { action: a.id, rolled }, `${a.name} used.`);
              close();
            })
          }
        />
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

  /** Weapon attacks on your turn use the Attack action (Extra Attack counts); off your turn they're a reaction (opportunity attack). */
  const openAttack = (a: WeaponAttack) => {
    const cb = live.current.character?.combat;
    const reaction = !!cb && !cb.myTurn && a.action === "attack";
    const economy = reaction ? "reaction" : a.action === "bonus" ? "bonus" : "action";
    guard({ name: a.name, economy, attack: economy === "action" }, () => {
      if (cb) {
        const kind = economy === "action" ? "attack" : economy;
        const label = kind === "attack" ? `Attack ${cb.attacks + 1} of ${live.current.sheet?.attacksPerAction ?? 1}.` : reaction ? "Reaction used (opportunity attack)." : "Bonus action used.";
        live.current.act("useEconomy", { kind }, label);
      }
      openRoll(a.name, a.attack, a);
    });
  };

  const startCombat = () => {
    s.act("startCombat", {}, "Combat started.");
    openRoll("Initiative", sheet.initiative);
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
          live.current.act("setTempHp", { amount, companion: id }, `Companion: ${amount} temporary HP.`);
          openCompanion(id);
        }}
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
      return <EffectPanel e={current} act={live.current.act} close={close} />;
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
    open(`Concentrating on ${conc.name}`, () => <ConcentrationPanel onCheck={openConcentrationCheck} onEnd={() => { live.current.act("endConcentration", {}, "Concentration ended."); close(); }} />);
  };

  const openSpell = (first: SpellResult, castAt?: number) =>
    open(first.name, () => {
      const sp = live.current.sheet?.spells.find((x) => x.id === first.id && x.list.id === first.list.id) ?? first;
      const roller = (level: number, damageOnly: boolean) =>
        open(sp.name, () => (
          <Composer
            title={sp.name}
            base={sp.attack ?? live.current.sheet!.saves.con}
            attack={spellAsAttack(sp, level)}
            damageOnly={damageOnly}
            healing={!!sp.heal && !sp.damage}
            onHealSelf={(n) => { live.current.act("heal", { amount: n }, `Healed ${n}.`); close(); }}
            physical={live.current.character?.settings.physicalDice ?? true}
            onPhysicalChange={(p) => live.current.act("setField", { path: ["settings", "physicalDice"], value: p }, p ? "Rolling your own dice." : "The app rolls for you.")}
            onRolled={(r) => live.current.addRoll(r)}
          />
        ));
      return (
        <SpellPanel
          sp={sp}
          sheet={live.current.sheet!}
          hasSelfEffect={registry.has(sp.id.replace(/^spell:/, "effect:"))}
          initialCast={castAt}
          onCast={(level, using, selfEffect) =>
            guard(
              { name: sp.name, economy: using === "ritual" ? "free" : castingEconomy(sp.castingTime), spell: { level: sp.level, concentration: sp.concentration } },
              () => live.current.act("castSpell", { spell: sp.id, list: sp.list.id, level, using, selfEffect }, `${sp.name} cast.`),
              { cancelled: () => openSpell(sp), done: () => openSpell(sp, level) },
            )
          }
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
      </>,
    );

  return (
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
          <button className="stat" onClick={() => openRoll("Initiative", sheet.initiative)}>
            <b>{formatBonus(sheet.initiative)}</b>
            <small>{sheet.initiative.advantage.length ? "Init, adv" : "Init"}</small>
          </button>
          <button className="stat" onClick={() => open("Speed", <BreakdownLines b={sheet.speed} totalLabel="Feet" />)}>
            <b>{sheet.speed.total}</b>
            <small>Speed</small>
          </button>
        </div>

        <EffectChips effects={sheet.effects} onOpen={openEffect} onAdd={openAddEffect} concentration={sheet.concentration} onConcentration={openConcentration} />

        {sheet.toggles.length > 0 && (
          <div className="switches" role="group" aria-label="Active states">
            {sheet.toggles.map((t) => (
              <button
                key={t.name}
                className="switch"
                aria-pressed={t.on}
                onClick={() => s.act("toggle", { name: t.name, on: !t.on }, `${t.label} ${t.on ? "off" : "on"}.`)}
              >
                {t.label}
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
        <BottomSheet title={panel.title} onClose={close}>
          {typeof panel.body === "function" ? panel.body() : panel.body}
        </BottomSheet>
      )}

      {s.toast && (
        <div className="toast" role="status" key={s.toast.id}>
          <p>{s.toast.text}</p>
          {s.toast.canUndo && s.canUndo && <button onClick={s.undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

/** What to do while concentrating: check after damage, or end it. */
function ConcentrationPanel({ onCheck, onEnd }: { onCheck: (dc: number) => void; onEnd: () => void }) {
  const [dc, setDc] = useState(10);
  return (
    <>
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
      <button className="big primary wide" style={{ marginTop: 10 }} onClick={() => onCheck(dc)}>
        Concentration check
      </button>
      <button className="big damage wide" style={{ marginTop: 10 }} onClick={onEnd}>
        End concentration
      </button>
    </>
  );
}
