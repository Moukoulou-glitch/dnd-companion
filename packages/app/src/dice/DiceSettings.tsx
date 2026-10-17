import { useState } from "react";
import { CLASS_DICE_COLOURS, classDiceColour, mainClass, usePickedDiceColour } from "../diceColours";
import { useDice3d, useDiceMode } from "../dice3dSetting";
import { throwDice } from "../diceBox";
import { useFeedback } from "./feedback";
import { myDieLook } from "./mine";
import { OWN_MATERIALS, setOwnMaterial, setThemesOn, useDicePrefs } from "./prefs";
import { DAMAGE_MATERIALS, DAMAGE_THEMES, lookOf } from "./themes";

/**
 * The dice settings, all in one place (this device): 3D dice on or off; your
 * own dice (follow your class or a colour of your own, and a material);
 * damage-type and feature looks; motion; sound and vibration; and two test
 * throws to see them. A few presets, sensible defaults: nothing needs setting.
 */
export function DiceSettings({ classes }: { classes: { class: string; level: number }[] }) {
  const [on, setOn] = useDice3d();
  const [picked, setPicked] = usePickedDiceColour();
  const [mode, setMode] = useDiceMode();
  const [sound, setSound] = useFeedback("sound");
  const [vibrate, setVibrate] = useFeedback("vibrate");
  const prefs = useDicePrefs();
  const [testing, setTesting] = useState<string | null>(null);
  const main = mainClass(classes);
  const cls = main ? CLASS_DICE_COLOURS[main] : undefined;
  const followColour = classDiceColour(classes);
  const test = async (what: "mine" | "damage") => {
    setTesting(null);
    try {
      if (what === "mine") await throwDice([20], [myDieLook(undefined)]);
      else await throwDice(DAMAGE_MATERIALS.map(() => 20), DAMAGE_MATERIALS.map((t) => lookOf(DAMAGE_THEMES[t]!, t)));
    } catch {
      setTesting("The 3D dice couldn't be thrown on this device just now.");
    }
  };
  return (
    <div className="group dice-settings" style={{ marginTop: 12 }}>
      <label className="row check">
        <input type="checkbox" checked={on} onChange={() => setOn(!on)} />
        <div className="row-main">
          <div className="row-title">3D dice</div>
          <div className="row-sub">When the app rolls for you, it throws 3D dice and their faces are the roll. The same switch as "3D dice" on the roll screen. This device only.</div>
        </div>
      </label>

      <div className="row">
        <div className="row-main">
          <div className="row-title">Your dice</div>
          <div className="row-sub">Your d20 and dice without a damage type or feature of their own.</div>
        </div>
        <span className="dice-swatch" style={{ background: picked ?? followColour }} aria-hidden="true" />
      </div>
      <label className="row check">
        <input type="radio" name="dice-colour" checked={!picked} onChange={() => setPicked(null)} />
        <div className="row-main">
          <div className="row-title">Follow my class</div>
          <div className="row-sub">{cls ? `${cls.name}, the class with the most levels (the first one on a tie)` : "The class with the most levels"}</div>
        </div>
        <span className="dice-swatch" style={{ background: followColour }} aria-hidden="true" />
      </label>
      <label className="row check">
        <input type="radio" name="dice-colour" checked={!!picked} onChange={() => setPicked(picked ?? followColour)} />
        <div className="row-main">
          <div className="row-title">My own colour</div>
          <div className="row-sub">Wins until you switch back to following your class.</div>
        </div>
        <input type="color" aria-label="Pick a dice colour" value={picked ?? followColour} onChange={(e) => setPicked(e.target.value)} />
      </label>
      <div className="row">
        <div className="row-main">
          <div className="row-title">Material</div>
          <div className="row-sub">The surface of your own dice; the colour stays yours.</div>
        </div>
      </div>
      <div className="types wrap" role="radiogroup" aria-label="Material of your dice" style={{ padding: "0 12px 12px" }}>
        {OWN_MATERIALS.map((m) => (
          <button key={m.id} className="switch" role="radio" aria-checked={prefs.material === m.id} aria-pressed={prefs.material === m.id} onClick={() => setOwnMaterial(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <label className="row check">
        <input type="checkbox" checked={prefs.damage} onChange={() => setThemesOn("damage", !prefs.damage)} />
        <div className="row-main">
          <div className="row-title">Damage-type looks</div>
          <div className="row-sub">Fire dice of molten cracks, cold dice frosted… Off: damage dice look like yours.</div>
        </div>
      </label>
      <label className="row check">
        <input type="checkbox" checked={prefs.feature} onChange={() => setThemesOn("feature", !prefs.feature)} />
        <div className="row-main">
          <div className="row-title">Feature looks</div>
          <div className="row-sub">Sneak Attack in shadow, maneuvers in steel, Psionic Energy, divine light, Rage…</div>
        </div>
      </label>

      <div className="row">
        <div className="row-main">
          <div className="row-title">Motion</div>
          <div className="row-sub">
            {mode === "full" ? "The whole throw and its effects." : mode === "reduced" ? "Calmer: no shadows, quieter effects." : "Heavier dice that settle in about a second."} The result is the same; you can always skip a throw.
          </div>
        </div>
      </div>
      <div className="segmented small" role="radiogroup" aria-label="3D dice motion" style={{ margin: "0 12px 12px" }}>
        {(["full", "reduced", "fast"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
            {m === "full" ? "Full" : m === "reduced" ? "Reduced" : "Fast"}
          </button>
        ))}
      </div>
      <label className="row check">
        <input type="checkbox" checked={sound} onChange={() => setSound(!sound)} />
        <div className="row-main">
          <div className="row-title">Dice sounds</div>
          <div className="row-sub">A short knock as each die lands. Off unless you turn it on.</div>
        </div>
      </label>
      <label className="row check">
        <input type="checkbox" checked={vibrate} onChange={() => setVibrate(!vibrate)} />
        <div className="row-main">
          <div className="row-title">Vibrate with dice</div>
          <div className="row-sub">A short buzz as dice land (phones that can). Off unless you turn it on.</div>
        </div>
      </label>

      {on && (
        <div className="big-actions" style={{ padding: "0 12px 12px" }}>
          <button className="big" onClick={() => void test("mine")}>
            Throw a test d20
            <span className="sub">your dice as they are now</span>
          </button>
          <button className="big" onClick={() => void test("damage")}>
            All 13 damage types
            <span className="sub">one d20 of each</span>
          </button>
        </div>
      )}
      {testing && <p className="note" style={{ padding: "0 12px" }}>{testing}</p>}
    </div>
  );
}
