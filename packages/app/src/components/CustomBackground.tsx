import { useMemo, useState } from "react";
import { choiceOptions, LANGUAGES, TOOLS, type ContentRegistry } from "@dnd/engine";
import { SKILL_NAMES, SKILLS, type Character, type OperationType } from "@dnd/schema";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

export const CUSTOM_BG = "background:custom";

const STEPS = ["Name", "Skills", "Tools and languages", "Feature", "Gear and gold", "Personality"] as const;

/** Prompts for each personality part, in our own words. */
const PERSONALITY: { key: "traits" | "ideals" | "bonds" | "flaws"; label: string; hint: string }[] = [
  { key: "traits", label: "Personality traits", hint: "Two small things that set you apart: a habit, a way of talking, what you do when nervous." },
  { key: "ideals", label: "Ideals", hint: "What you believe in most, the principle you won't give up." },
  { key: "bonds", label: "Bonds", hint: "The people, places or things you're tied to, and why." },
  { key: "flaws", label: "Flaws", hint: "A weakness, vice or fear that others could use against you." },
];

/**
 * "You don't know me! (custom)": a background of the player's own (PHB p. 125),
 * one step at a time: a name, two skills, two tools or languages, a feature,
 * gear (another background's, or written down with coin), and personality.
 */
export function CustomBackgroundWizard({ c, reg, act, done }: { c: Character; reg: ContentRegistry; act: Act; done: () => void }) {
  const picks = c.choices[CUSTOM_BG] ?? {};
  const [step, setStep] = useState(0);
  const [name, setName] = useState(c.customBackground?.name ?? "");
  const [skills, setSkills] = useState<string[]>(picks.skills ?? []);
  const [langCount, setLangCount] = useState(c.customBackground?.languages ?? 1);
  const [langs, setLangs] = useState<string[]>(picks.languages ?? []);
  const [tools, setTools] = useState<string[]>(picks.tools ?? []);
  const [featureMode, setFeatureMode] = useState<"borrow" | "write">(c.customBackground?.featureName ? "write" : "borrow");
  const [feature, setFeature] = useState<string | undefined>(picks.feature?.[0]);
  const [featureName, setFeatureName] = useState(c.customBackground?.featureName ?? "");
  const [featureText, setFeatureText] = useState(c.customBackground?.featureText ?? "");
  const [gearMode, setGearMode] = useState<"package" | "write" | "skip">("skip");
  const [gearFrom, setGearFrom] = useState<string>();
  const [gearText, setGearText] = useState("");
  const [gold, setGold] = useState("");
  const [story, setStory] = useState({ traits: c.story.traits, ideals: c.story.ideals, bonds: c.story.bonds, flaws: c.story.flaws });
  const [q, setQ] = useState("");

  const featureOptions = useMemo(() => choiceOptions({ id: "feature", label: "", kind: "feature", count: 1, featuresOf: "background" }, reg), [reg]);
  const withGear = useMemo(() => reg.list("background").filter((b) => b.id !== CUSTOM_BG && b.equipment && (b.equipment.fixed.length || b.equipment.other?.length || b.equipment.gold)), [reg]);
  const toolCount = 2 - langCount;

  const toggle = (list: string[], set: (v: string[]) => void, v: string, max: number) => set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? [...list.slice(1), v] : [...list, v]);

  const finish = () => {
    if (c.background !== CUSTOM_BG) act("setDetails", { background: CUSTOM_BG }, "Background: your own.");
    act(
      "setCustomBackground",
      { name: name.trim(), languages: langCount, featureName: featureMode === "write" ? featureName.trim() : "", featureText: featureMode === "write" ? featureText.trim() : "" },
      `Background: ${name.trim() || "your own"}.`,
    );
    act("setChoice", { source: CUSTOM_BG, choice: "skills", values: skills }, "Skills chosen.");
    act("setChoice", { source: CUSTOM_BG, choice: "languages", values: langs.slice(0, langCount) }, "Languages chosen.");
    act("setChoice", { source: CUSTOM_BG, choice: "tools", values: tools.slice(0, toolCount) }, "Tools chosen.");
    act("setChoice", { source: CUSTOM_BG, choice: "feature", values: featureMode === "borrow" && feature ? [feature] : [] }, "Feature chosen.");
    // Gear: another background's package, or written down; coin either way.
    let coins = Number(gold || 0);
    if (gearMode === "package" && gearFrom) {
      const eq = reg.find(gearFrom, "background")?.equipment;
      for (const x of eq?.fixed ?? []) act("addItem", { instanceId: `bg-${crypto.randomUUID()}`, item: x.item, quantity: x.quantity }, `${reg.find(x.item, "item")?.name ?? x.item} added.`);
      for (const o of eq?.other ?? []) act("addItem", { instanceId: `bg-${crypto.randomUUID()}`, item: "item:other-gear", quantity: 1, name: o.replace(/^./, (x) => x.toUpperCase()) }, `${o} added.`);
      coins += Number(/\d+/.exec(eq?.gold ?? "")?.[0] ?? 0);
    }
    if (gearMode === "write")
      for (const line of gearText.split("\n").map((x) => x.trim()).filter(Boolean)) act("addItem", { instanceId: `bg-${crypto.randomUUID()}`, item: "item:other-gear", quantity: 1, name: line }, `${line} added.`);
    if (coins > 0) act("adjustCurrency", { coin: "gp", delta: coins }, `${coins} gp added.`);
    act("setStory", story, "Personality saved.");
    done();
  };

  const nav = (canNext: boolean) => (
    <div className="big-actions">
      {step > 0 && (
        <button className="big" onClick={() => setStep(step - 1)}>
          Back
        </button>
      )}
      {step < STEPS.length - 1 ? (
        <button className="big primary" onClick={() => setStep(step + 1)}>
          {canNext ? "Next" : "Skip for now"}
        </button>
      ) : (
        <button className="big primary" onClick={finish}>
          Done
        </button>
      )}
    </div>
  );

  const checkList = (options: { value: string; label: string; detail?: string }[], chosen: string[], set: (v: string[]) => void, max: number) => (
    <div className="group">
      {options.map((o) => (
        <label className="row check" key={o.value}>
          <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(chosen, set, o.value, max)} />
          <div className="row-main">
            <div className="row-title">{o.label}</div>
            {o.detail && <div className="row-sub">{o.detail}</div>}
          </div>
        </label>
      ))}
    </div>
  );

  return (
    <div className="wizard">
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <button onClick={() => setStep(i)}>{i + 1}</button>
          </li>
        ))}
      </ol>
      <h2 className="sub-head">
        {step + 1}. {STEPS[step]}
      </h2>

      {step === 0 && (
        <>
          <p className="note">What were you before the adventure? Name your background (Smuggler, Temple orphan, Bounty hunter). It shows as “{name.trim() || "You don't know me!"} (custom)”.</p>
          <input className="search" placeholder="Your background's name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Background name" />
          {nav(!!name.trim())}
        </>
      )}

      {step === 1 && (
        <>
          <p className="note">Pick any two skills. {skills.length} of 2.</p>
          {checkList(
            SKILLS.map((s) => ({ value: s, label: SKILL_NAMES[s] })),
            skills,
            setSkills,
            2,
          )}
          {nav(skills.length === 2)}
        </>
      )}

      {step === 2 && (
        <>
          <p className="note">Two in total, in any mix of tool proficiencies and languages.</p>
          <div className="segmented small three" role="radiogroup" aria-label="Mix">
            {[2, 1, 0].map((n) => (
              <button key={n} role="radio" aria-checked={langCount === n} onClick={() => setLangCount(n)}>
                {n === 2 ? "2 languages" : n === 1 ? "1 of each" : "2 tools"}
              </button>
            ))}
          </div>
          {langCount > 0 && (
            <>
              <h3 className="sub-head">
                Languages ({Math.min(langs.length, langCount)} of {langCount})
              </h3>
              {checkList(
                LANGUAGES.map((l) => ({ value: l, label: l })),
                langs,
                setLangs,
                langCount,
              )}
            </>
          )}
          {toolCount > 0 && (
            <>
              <h3 className="sub-head">
                Tools ({Math.min(tools.length, toolCount)} of {toolCount})
              </h3>
              {checkList(
                TOOLS.map((t) => ({ value: t, label: t })),
                tools,
                setTools,
                toolCount,
              )}
            </>
          )}
          {nav(langs.length >= langCount && tools.length >= toolCount)}
        </>
      )}

      {step === 3 && (
        <>
          <p className="note">Borrow the feature of another background, or write one you agreed on with your DM.</p>
          <div className="segmented small" role="radiogroup" aria-label="Feature">
            <button role="radio" aria-checked={featureMode === "borrow"} onClick={() => setFeatureMode("borrow")}>
              From a background
            </button>
            <button role="radio" aria-checked={featureMode === "write"} onClick={() => setFeatureMode("write")}>
              Write my own
            </button>
          </div>
          {featureMode === "borrow" ? (
            <>
              <input className="search" type="search" placeholder="Search features" value={q} onChange={(e) => setQ(e.target.value)} />
              {featureOptions.length === 0 && <p className="note">No background features loaded: load your backgrounds book file, or write your own.</p>}
              <div className="group">
                {featureOptions
                  .filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
                  .map((o) => (
                    <label className="row check" key={o.value}>
                      <input type="radio" name="bg-feature" checked={feature === o.value} onChange={() => setFeature(o.value)} />
                      <div className="row-main">
                        <div className="row-title">{o.label}</div>
                        {o.detail && <div className="row-sub">{o.detail}</div>}
                      </div>
                    </label>
                  ))}
              </div>
            </>
          ) : (
            <>
              <input className="search" placeholder="Feature name (Underworld Contacts)" value={featureName} maxLength={80} onChange={(e) => setFeatureName(e.target.value)} aria-label="Feature name" />
              <textarea className="story-text" rows={5} placeholder="What it lets you do" value={featureText} maxLength={2000} onChange={(e) => setFeatureText(e.target.value)} aria-label="Feature text" />
            </>
          )}
          {nav(featureMode === "borrow" ? !!feature : !!featureName.trim())}
        </>
      )}

      {step === 4 && (
        <>
          <p className="note">Take the equipment package of another background, or write down what you carry and how much coin you have.</p>
          <div className="segmented small three" role="radiogroup" aria-label="Gear">
            <button role="radio" aria-checked={gearMode === "package"} onClick={() => setGearMode("package")}>
              A package
            </button>
            <button role="radio" aria-checked={gearMode === "write"} onClick={() => setGearMode("write")}>
              Write my own
            </button>
            <button role="radio" aria-checked={gearMode === "skip"} onClick={() => setGearMode("skip")}>
              Not now
            </button>
          </div>
          {gearMode === "package" && (
            <div className="group">
              {withGear.length === 0 && <p className="note">No background equipment loaded: load your backgrounds book file, or write your own.</p>}
              {withGear.map((b) => (
                <label className="row check" key={b.id}>
                  <input type="radio" name="bg-gear" checked={gearFrom === b.id} onChange={() => setGearFrom(b.id)} />
                  <div className="row-main">
                    <div className="row-title">{b.name}</div>
                    <div className="row-sub">
                      {[...(b.equipment?.fixed ?? []).map((x) => `${x.quantity > 1 ? `${x.quantity} ` : ""}${reg.find(x.item, "item")?.name ?? x.item}`), ...(b.equipment?.other ?? []), ...(b.equipment?.gold ? [`${b.equipment.gold} gp`] : [])].join(", ")}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {gearMode === "write" && (
            <>
              <textarea className="story-text" rows={6} placeholder={"One item per line\nA set of common clothes\nA lucky coin"} value={gearText} onChange={(e) => setGearText(e.target.value)} aria-label="Gear" />
              <p className="note">Your DM decides what fits; the usual is gear worth about as much as another background's.</p>
            </>
          )}
          {gearMode !== "skip" && (
            <div className="row">
              <div className="row-main row-title">{gearMode === "package" ? "Extra gold" : "Gold"}</div>
              <input className="search" inputMode="numeric" placeholder="gp" value={gold} onChange={(e) => setGold(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Gold" style={{ maxWidth: 100 }} />
            </div>
          )}
          {nav(gearMode !== "skip")}
        </>
      )}

      {step === 5 && (
        <>
          <p className="note">Who you are, in your own words. You can change these any time on the Backstory page.</p>
          {PERSONALITY.map((p) => (
            <label className="story-field" key={p.key}>
              <span className="row-title">{p.label}</span>
              <span className="row-sub">{p.hint}</span>
              <textarea className="story-text" rows={3} value={story[p.key]} onChange={(e) => setStory({ ...story, [p.key]: e.target.value })} />
            </label>
          ))}
          {nav(true)}
        </>
      )}
    </div>
  );
}
