import { useState } from "react";

/** Who a tale can go to (from featureTargets): you, a companion, a summoned creature, or someone the app doesn't track. */
export interface TaleTarget {
  id: string;
  name: string;
  sub: string;
  warnings: string[];
}

/** What bestowing does, for the app to apply after the action is spent. */
export interface TaleBestowal {
  tale: number;
  name: string;
  target: string;
  /** The rolled total (temporary HP, healing, damage), when the tale rolls. */
  total?: number;
  /** A second creature for Beloved Friends' temporary hit points. */
  second?: string;
  /** A condition of yours the Angel ends (its effect instance). */
  endCondition?: string;
  /** The tag the tale puts on its target, with the die. */
  effect?: string;
  /** For the log. */
  said: string;
}

type Roll = { dice: number; plus: "cha" | "bard" | 0; type?: string; save?: string; half?: boolean; then?: string };

/** How each tale works (the Spirit Tales table, in our words): its dice and what it does. */
const TALES: Record<number, { name: string; kind: "effect" | "attack" | "temp" | "note" | "save" | "heal"; roll?: Roll; effect?: string; text: string; self?: boolean }> = {
  1: { name: "Clever Animal", kind: "effect", effect: "other:spirit-tale-clever-animal", text: "For 10 minutes the target adds your Bardic Inspiration die to its Intelligence, Wisdom and Charisma checks." },
  2: { name: "Renowned Duelist", kind: "attack", roll: { dice: 2, plus: "cha", type: "force" }, text: "You make a melee spell attack against the target: a hit deals force damage of two of your Bardic Inspiration dice + your Charisma modifier." },
  3: { name: "Beloved Friends", kind: "temp", roll: { dice: 1, plus: "cha" }, text: "The target and one creature of its choice within 5 ft of it gain temporary hit points: your Bardic Inspiration die + your Charisma modifier." },
  4: { name: "Runaway", kind: "note", text: "The target can use its reaction at once to teleport up to 30 ft to a space it can see; then up to your Charisma modifier of creatures it can see within 30 ft can use their reactions to do the same." },
  5: { name: "Avenger", kind: "effect", effect: "other:spirit-tale-avenger", text: "For 1 minute, any creature that hits the target with a melee attack takes force damage of one roll of your Bardic Inspiration die." },
  6: { name: "Traveler", kind: "temp", roll: { dice: 1, plus: "bard" }, effect: "other:spirit-tale-traveler", text: "The target gains temporary hit points: your Bardic Inspiration die + your bard level. While they last, +10 ft walking speed and +1 AC." },
  7: { name: "Beguiler", kind: "save", roll: { dice: 2, plus: 0, type: "psychic", save: "Wisdom", then: "and is incapacitated until the end of its next turn" }, text: "A Wisdom save, or psychic damage of two of your Bardic Inspiration dice and incapacitated until the end of its next turn." },
  8: { name: "Phantom", kind: "effect", effect: "other:spirit-tale-phantom", text: "The target turns invisible until the end of its next turn or until it hits with an attack; that hit adds necrotic damage of your Bardic Inspiration die and frightens the creature hit until the end of its next turn." },
  9: { name: "Brute", kind: "save", roll: { dice: 3, plus: 0, type: "thunder", save: "Strength", half: true, then: "and is knocked prone (a success: half, and stays standing)" }, text: "Creatures of the target's choice within 30 ft of it make a Strength save: thunder damage of three of your Bardic Inspiration dice and prone, or half and standing." },
  10: { name: "Dragon", kind: "save", roll: { dice: 4, plus: 0, type: "fire", save: "Dexterity", half: true, then: "(half on a success)" }, text: "The target breathes fire in a 30-ft cone: each creature in it makes a Dexterity save, fire damage of four of your Bardic Inspiration dice, half on a success." },
  11: { name: "Angel", kind: "heal", roll: { dice: 2, plus: "cha" }, text: "The target regains hit points: two of your Bardic Inspiration dice + your Charisma modifier; and you end one of blinded, deafened, paralyzed, petrified or poisoned on it." },
  12: { name: "Mind-Bender", kind: "save", roll: { dice: 3, plus: 0, type: "psychic", save: "Intelligence", then: "and is stunned until the end of its next turn" }, text: "An Intelligence save, or psychic damage of three of your Bardic Inspiration dice and stunned until the end of its next turn." },
};

/** The tale's number from the held tag's text ("6 · Traveler: …"). */
export function taleNumber(text: string | undefined): number | undefined {
  const n = Number(/^(\d+)\s*·/.exec(text ?? "")?.[1]);
  return n >= 1 && n <= 12 ? n : undefined;
}

/**
 * Bestowing the tale you hold: who gets it, its dice rolled, what it puts on them. `roll` rolls a formula
 * ("2d8") and returns the dice total (3D dice when on); with your own dice, you type the total instead.
 */
export function TaleBestowPanel({
  tale,
  die,
  cha,
  bardLevel,
  dc,
  attack,
  targets,
  conditionsOnMe,
  physical,
  roll,
  onBestow,
}: {
  tale: number;
  /** Your Bardic Inspiration die: "d8". */
  die: string;
  cha: number;
  bardLevel: number;
  dc: number;
  attack: number;
  targets: TaleTarget[];
  /** Your own conditions the Angel can end: {instance, name}. */
  conditionsOnMe: { instance: string; name: string }[];
  physical: boolean;
  roll: (formula: string) => Promise<number>;
  onBestow: (b: TaleBestowal) => void;
}) {
  const t = TALES[tale]!;
  const [target, setTarget] = useState(t.kind === "attack" || t.kind === "save" ? "other" : "me");
  const [second, setSecond] = useState("");
  const [rolled, setRolled] = useState<number | undefined>();
  const [typed, setTyped] = useState("");
  const [cond, setCond] = useState("");
  const [throwing, setThrowing] = useState(false);
  const r = t.roll;
  const plus = r ? (r.plus === "cha" ? cha : r.plus === "bard" ? bardLevel : 0) : 0;
  const formula = r ? `${r.dice}${die}` : "";
  const total = rolled !== undefined ? rolled + plus : undefined;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const plusText = r && r.plus ? ` ${sign(plus)} (${r.plus === "cha" ? "Charisma" : "bard level"})` : "";
  const pick = targets.find((x) => x.id === target);
  // Who it can go to: a tale for a creature (not an attack on an enemy or a save they make).
  const needsTarget = t.kind === "effect" || t.kind === "temp" || t.kind === "heal" || t.kind === "note";
  const tracked = target !== "other";

  const doRoll = async () => {
    setThrowing(true);
    try {
      setRolled(await roll(formula));
    } finally {
      setThrowing(false);
    }
  };
  const said = () => {
    const who = pick?.name ?? "someone";
    if (t.kind === "attack") return `Tale of the ${t.name}: melee spell attack ${sign(attack)}; on a hit ${total} force damage.`;
    if (t.kind === "save") return `Tale of the ${t.name}: DC ${dc} ${r!.save} save, or ${total} ${r!.type} damage ${r!.then}.`;
    if (t.kind === "temp") return `Tale of the ${t.name}: ${total} temporary HP to ${who}${second ? ` and ${targets.find((x) => x.id === second)?.name ?? "another"}` : ""}.`;
    if (t.kind === "heal") return `Tale of the ${t.name}: ${who} regains ${total} HP.`;
    return `Tale of the ${t.name} on ${who}.`;
  };
  const ready = !r || total !== undefined;

  return (
    <>
      <p className="sub-head">Tale of the {t.name}</p>
      <p className="note">{t.text}</p>
      {(t.kind === "save" || t.kind === "attack") && (
        <p className="note">
          {t.kind === "save" ? `Save DC ${dc} (your spell save DC).` : `Your spell attack: ${sign(attack)}. Roll it against the target's AC.`}
        </p>
      )}
      {needsTarget && (
        <>
          <p className="sub-head">Who gets it (within 30 ft; you too)</p>
          <div className="group" role="radiogroup">
            {targets.map((x) => (
              <label key={x.id} className="row check">
                <input type="radio" name="tale-target" checked={target === x.id} onChange={() => setTarget(x.id)} />
                <div className="row-main">
                  <div className="row-title">{x.name}</div>
                  <div className="row-sub">{x.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      {tale === 3 && (
        <>
          <p className="sub-head">And one creature of its choice within 5 ft of it</p>
          <div className="group" role="radiogroup">
            {[{ id: "", name: "Nobody, or someone else", sub: "" }, ...targets.filter((x) => x.id !== target && x.id !== "other")].map((x) => (
              <label key={x.id || "none"} className="row check">
                <input type="radio" name="tale-second" checked={second === x.id} onChange={() => setSecond(x.id)} />
                <div className="row-main">
                  <div className="row-title">{x.name}</div>
                  {x.sub && <div className="row-sub">{x.sub}</div>}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
      {tale === 11 && target === "me" && conditionsOnMe.length > 0 && (
        <>
          <p className="sub-head">The condition it ends</p>
          <div className="types wrap" role="radiogroup">
            {conditionsOnMe.map((c) => (
              <button key={c.instance} className="switch" role="radio" aria-checked={cond === c.instance} onClick={() => setCond(cond === c.instance ? "" : c.instance)}>
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      {r &&
        (total !== undefined ? (
          <p className="big-number">
            {total}
            <small>
              {" "}
              {formula} = {rolled}
              {plusText}
              {r.type ? ` ${r.type}` : t.kind === "heal" ? " HP" : " temporary HP"}
            </small>
          </p>
        ) : physical ? (
          <label className="entry">
            <span>
              Roll {formula} and type the dice total{plusText ? ` (the app adds ${plusText.trim()})` : ""}
            </span>
            <input inputMode="numeric" pattern="[0-9]*" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => typed && setRolled(Number(typed))} />
            <button className="chip" disabled={!typed} onClick={() => setRolled(Number(typed))}>
              Use it
            </button>
          </label>
        ) : (
          <button className="big wide" disabled={throwing} onClick={() => void doRoll()}>
            {throwing ? "Throwing…" : `Roll ${formula}${plusText}`}
          </button>
        ))}
      {pick && pick.warnings.length > 0 && pick.warnings.map((w) => <p key={w} className="note warn">⚠ {w}</p>)}
      {needsTarget && !tracked && t.kind !== "note" && <p className="note">Someone the app doesn't track: they note it on their own sheet.</p>}
      <button
        className="big wide primary"
        style={{ marginTop: 12 }}
        disabled={!ready}
        onClick={() =>
          onBestow({
            tale,
            name: t.name,
            target,
            ...(total !== undefined ? { total } : {}),
            ...(second ? { second } : {}),
            ...(cond ? { endCondition: cond } : {}),
            ...(t.effect ? { effect: t.effect } : {}),
            said: said(),
          })
        }
      >
        Bestow the tale (an action)
      </button>
    </>
  );
}
