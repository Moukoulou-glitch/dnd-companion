import { useState } from "react";

/**
 * Drinking a potion, or giving it: who takes it (you, a companion, a summoned
 * creature, someone the app doesn't track), and what's picked when it's used
 * (Resistance: the damage type).
 */
export function ItemUsePanel({
  summary,
  targets,
  options,
  onUse,
}: {
  summary?: string | undefined;
  targets: { id: string; name: string; sub?: string; warnings: string[] }[];
  options?: { label: string; values: string[] } | undefined;
  onUse: (target: string, option?: string) => void;
}) {
  const [target, setTarget] = useState("me");
  const [option, setOption] = useState<string | undefined>(undefined);
  const name = targets.find((t) => t.id === target)?.name ?? "them";
  return (
    <>
      {summary && <p>{summary}</p>}
      <p className="sub-head">Who drinks it?</p>
      <div className="group">
        {targets.map((t) => (
          <label className="row check" key={t.id}>
            <input type="radio" name="item-target" checked={target === t.id} onChange={() => setTarget(t.id)} />
            <div className="row-main">
              <div className="row-title">{t.id === "me" ? `Me (${t.name})` : t.name}</div>
              {t.sub && <div className="row-sub">{t.sub}</div>}
              {t.warnings.map((w) => (
                <div className="row-sub danger-text" key={w}>
                  {w}
                </div>
              ))}
            </div>
          </label>
        ))}
      </div>
      {options && (
        <>
          <p className="sub-head">{options.label}</p>
          <div className="choice-grid">
            {options.values.map((v) => (
              <button key={v} className="tag" aria-pressed={option === v} onClick={() => setOption(v)}>
                {v}
              </button>
            ))}
          </div>
        </>
      )}
      <button className="big primary wide" style={{ marginTop: 12 }} disabled={!!options && !option} onClick={() => onUse(target, option)}>
        {target === "me" ? "Drink it" : `Give it to ${name}`}
      </button>
    </>
  );
}
