import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatBonus } from "@dnd/engine";
import { ActionsTab } from "./components/ActionsTab";
import { HpPad } from "./components/HpPad";
import { PlayTab } from "./components/PlayTab";
import { BottomSheet, BreakdownLines } from "./components/Sheet";
import { SheetTab } from "./components/SheetTab";
import { useCharacters } from "./useCharacters";

type Tab = "play" | "actions" | "sheet";
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "actions", label: "Actions" },
  { id: "sheet", label: "Sheet" },
];

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
}

export function App() {
  const s = useCharacters();
  const [tab, setTab] = useState<Tab>("play");
  const [panel, setPanel] = useState<{ title: string; body: ReactNode } | null>(null);
  const open = useCallback((title: string, body: ReactNode) => setPanel({ title, body }), []);
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
  const hpPct = Math.round((c.hp.current / sheet.hpMax.total) * 100);

  const openHp = () =>
    open(
      "Hit points",
      <HpPad
        onDamage={(amount, type) => {
          s.act("damage", { amount, damageType: type }, `Took ${amount}${type ? ` ${type}` : ""} damage.`);
          close();
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
          <button className="hp" onClick={openHp} aria-label={`Hit points ${c.hp.current} of ${sheet.hpMax.total}${c.hp.temp ? `, ${c.hp.temp} temporary` : ""}. Change`}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hp-now">{c.hp.current}</span>
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
          <button className="stat" onClick={() => open("Initiative", <BreakdownLines b={sheet.initiative} totalLabel="Initiative" />)}>
            <b>{formatBonus(sheet.initiative)}</b>
            <small>{sheet.initiative.advantage.length ? "Init, adv" : "Init"}</small>
          </button>
          <button className="stat" onClick={() => open("Speed", <BreakdownLines b={sheet.speed} totalLabel="Feet" />)}>
            <b>{sheet.speed.total}</b>
            <small>Speed</small>
          </button>
        </div>

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

      {tab === "play" && <PlayTab character={c} sheet={sheet} act={s.act} openHp={openHp} openHitDie={openHitDie} />}
      {tab === "actions" && <ActionsTab sheet={sheet} open={open} />}
      {tab === "sheet" && <SheetTab sheet={sheet} open={open} />}

      <nav className="tabs" aria-label="Sections">
        <div className="tabs-inner">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {panel && (
        <BottomSheet title={panel.title} onClose={close}>
          {panel.body}
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
