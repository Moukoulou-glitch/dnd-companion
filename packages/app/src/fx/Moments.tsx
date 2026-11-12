import type { CSSProperties } from "react";

/**
 * Class moments (22i): hand-made looks for a few features the table uses all the time. Each is a handful of
 * HTML/SVG pieces moved with transform, opacity and stroke-dashoffset only, timed by --fx-ms (styles.css,
 * "Class moments"). Under reduced motion they show still, briefly. Looks only: what was used, and the numbers
 * shown, come from the recorded operation (fx/triggers.ts).
 */
export type MomentMotif = "portent-roll" | "portent-use" | "arcane-recovery" | "second-wind" | "action-surge" | "divine-sense" | "lay-on-hands" | "sunlight" | "divine-intervention" | "divine-silence" | "twilight-sanctuary" | "twilight-shroud" | "steps-of-night" | "exhaustion" | "exhaustion-eases";

export interface Moment {
  motif: MomentMotif;
  /** Portent's numbers (foretold, or the one used); Arcane Recovery's slot levels. */
  values?: number[];
}

const v = (o: Record<string, string | number>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [`--${k}`, String(x)])) as CSSProperties;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** A fixed scatter (no Math.random: the same each time, and in tests). */
const rnd = (i: number, k = 1) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A d20 seen face-on: the hexagon outline and its inner triangle. */
function D20({ n, className, style }: { n?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="-50 -50 100 100" aria-hidden="true">
      <polygon className="d20-out" points="0,-46 40,-23 40,23 0,46 -40,23 -40,-23" />
      <polygon className="d20-in" points="0,-27 24,15 -24,15" />
      <path className="d20-edge" d="M0,-46 L0,-27 M40,-23 L24,15 M40,23 L24,15 M0,46 L24,15 M0,46 L-24,15 M-40,23 L-24,15 M-40,-23 L-24,15 M-40,-23 L0,-27 M40,-23 L0,-27" />
      {n !== undefined && (
        <text className="d20-n" x="0" y="11" textAnchor="middle">
          {n}
        </text>
      )}
    </svg>
  );
}

/** The seer's eye: lids that open, an iris of star-chart rings. */
function Eye({ n }: { n?: number }) {
  return (
    <svg className="mo-eye" viewBox="-110 -60 220 120" aria-hidden="true">
      <path className="lid" d="M-100,0 Q0,-80 100,0 Q0,80 -100,0 Z" />
      <g className="iris">
        <circle r="34" className="ring a" />
        <circle r="24" className="ring b" />
        {range(12).map((i) => (
          <line key={i} x1="0" y1="-34" x2="0" y2="-28" transform={`rotate(${i * 30})`} />
        ))}
        {range(5).map((i) => (
          <circle key={`s${i}`} className="star" r="1.6" cx={Math.cos(i * 1.26) * 16} cy={Math.sin(i * 1.26) * 16} />
        ))}
        {n !== undefined ? (
          <text className="n" x="0" y="13" textAnchor="middle">
            {n}
          </text>
        ) : (
          <circle r="9" className="pupil" />
        )}
      </g>
    </svg>
  );
}

/** An open hand, fingers up (Lay on Hands). */
const HAND = "M-14,40 C-26,30 -30,10 -30,-4 L-30,-18 C-30,-24 -22,-24 -22,-18 L-22,-4 L-20,-4 L-20,-34 C-20,-40 -12,-40 -12,-34 L-12,-6 L-9,-6 L-9,-42 C-9,-48 -1,-48 -1,-42 L-1,-6 L2,-6 L2,-36 C2,-42 10,-42 10,-36 L10,-4 L13,-4 L13,-24 C13,-30 21,-30 21,-24 L21,8 C21,26 12,36 4,40 Z";

/** The crown of sunlight: a circlet with rays (also on the character's name while the Charm lasts: NameFx). */
export function SunCrown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-60 -40 120 70" aria-hidden="true">
      <g className="rays">
        {range(9).map((i) => (
          <line key={i} x1="0" y1="-14" x2="0" y2="-36" transform={`rotate(${-64 + i * 16})`} />
        ))}
      </g>
      <path className="band" d="M-44,18 L-44,0 L-30,-14 L-22,2 L-11,-22 L0,-2 L11,-22 L22,2 L30,-14 L44,0 L44,18 Z" />
      <circle className="gem" cx="0" cy="8" r="4" />
    </svg>
  );
}

export function MomentPieces({ m }: { m: Moment }) {
  switch (m.motif) {
    case "portent-roll": {
      const vals = m.values?.length ? m.values : [0, 0];
      return (
        <>
          <span className="mo-veil" />
          <Eye />
          <div className="mo-portent-row">
            {vals.map((n, i) => (
              <D20 key={i} n={n || undefined} className="mo-portent-die" style={v({ i, n: vals.length })} />
            ))}
          </div>
          {range(16).map((i) => (
            <span key={i} className="mo-star" style={v({ x: `${rnd(i) * 100}%`, y: `${rnd(i, 2) * 70}%`, d: `${Math.round(rnd(i, 3) * 900)}ms` })} />
          ))}
        </>
      );
    }
    case "portent-use":
      return (
        <>
          <span className="mo-veil" />
          <Eye n={m.values?.[0]} />
          <span className="mo-ripple a" />
          <span className="mo-ripple b" />
          {range(10).map((i) => (
            <span key={i} className="mo-shard" style={v({ a: `${i * 36 + rnd(i) * 20}deg`, d: `${80 + rnd(i, 2) * 90}px` })} />
          ))}
        </>
      );
    case "arcane-recovery": {
      const slots = m.values?.length ? m.values : [1];
      return (
        <>
          <svg className="mo-book" viewBox="-80 -50 160 100" aria-hidden="true">
            <path className="page l" d="M0,-30 C-24,-42 -56,-40 -72,-30 L-72,40 C-56,30 -24,28 0,40 Z" />
            <path className="page r" d="M0,-30 C24,-42 56,-40 72,-30 L72,40 C56,30 24,28 0,40 Z" />
            <path className="spine" d="M0,-30 L0,40" />
            {range(4).map((i) => (
              <path key={i} className="line" d={`M${-62 + (i % 2) * 2},${-18 + i * 12} L-12,${-16 + i * 12} M12,${-16 + i * 12} L${62 - (i % 2) * 2},${-18 + i * 12}`} />
            ))}
          </svg>
          {slots.map((lvl, i) => (
            <span key={i} className="mo-slot" style={v({ a: `${-150 + (300 / Math.max(1, slots.length)) * (i + 0.5)}deg`, i })}>
              <b>{lvl}</b>
            </span>
          ))}
          {range(14).map((i) => (
            <span key={`g${i}`} className="mo-glyph" style={v({ x: `${(rnd(i) - 0.5) * 220}px`, d: `${500 + rnd(i, 2) * 700}ms` })} />
          ))}
        </>
      );
    }
    case "second-wind":
      return (
        <>
          <svg className="mo-gusts" viewBox="0 0 390 300" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={1} className="g a" d="M-20,90 C80,40 160,140 250,90 S350,60 410,100" />
            <path pathLength={1} className="g b" d="M-20,160 C90,120 170,210 260,150 S360,130 410,170" />
            <path pathLength={1} className="g c" d="M-20,230 C70,200 180,260 270,215 S350,200 410,235" />
          </svg>
          <svg className="mo-pulse" viewBox="0 0 300 80" aria-hidden="true">
            <path pathLength={1} d="M0,40 L90,40 L104,40 L114,14 L126,66 L138,22 L148,48 L156,40 L300,40" />
          </svg>
          <span className="mo-bloom" />
        </>
      );
    case "action-surge":
      return (
        <>
          {range(14).map((i) => (
            <span key={i} className="mo-streak" style={v({ y: `${6 + (i * 6.6) % 90}%`, w: `${30 + rnd(i) * 50}%`, d: `${rnd(i, 2) * 220}ms` })} />
          ))}
          <svg className="mo-chevrons" viewBox="-100 -50 200 100" aria-hidden="true">
            <path className="c1" d="M-70,-36 L-26,0 L-70,36" />
            <path className="c2" d="M-10,-36 L34,0 L-10,36" />
          </svg>
          <span className="mo-flash" />
        </>
      );
    case "divine-sense":
      return (
        <>
          <span className="mo-veil gold" />
          <svg className="mo-sense-eye" viewBox="-60 -40 120 80" aria-hidden="true">
            <path className="lid" d="M-54,0 Q0,-44 54,0 Q0,44 -54,0 Z" />
            <circle r="13" className="iris" />
            {range(8).map((i) => (
              <line key={i} x1="0" y1="-24" x2="0" y2="-34" transform={`rotate(${i * 45})`} />
            ))}
          </svg>
          {range(3).map((i) => (
            <span key={i} className="mo-sense-ring" style={v({ i })} />
          ))}
          {(["celestial", "fiend", "undead"] as const).map((k, i) => (
            <span key={k} className={`mo-sensed ${k}`} style={v({ x: `${[18, 80, 30][i]}%`, y: `${[22, 40, 70][i]}%` })} />
          ))}
        </>
      );
    case "lay-on-hands":
      return (
        <>
          <span className="mo-glow" />
          <svg className="mo-hand l" viewBox="-40 -50 80 100" aria-hidden="true">
            <path d={HAND} />
          </svg>
          <svg className="mo-hand r" viewBox="-40 -50 80 100" aria-hidden="true">
            <path d={HAND} />
          </svg>
          {range(14).map((i) => (
            <span key={i} className="mo-mote" style={v({ x: `${(rnd(i) - 0.5) * 160}px`, d: `${450 + rnd(i, 2) * 700}ms`, s: `${4 + rnd(i, 3) * 5}px` })} />
          ))}
        </>
      );
    // Twilight Sanctuary: dusk sweeps over, a dome of twilight rises around you with stars inside, a crescent above.
    // With Twilight Shroud (17th): night falls whole, constellations draw themselves, veils of twilight drape the dome.
    case "twilight-sanctuary":
    case "twilight-shroud": {
      const shroud = m.motif === "twilight-shroud";
      const stars = range(shroud ? 22 : 12).map((i) => ({ x: 8 + rnd(i, 7) * 84, y: 8 + rnd(i, 8) * 44 }));
      return (
        <>
          <span className={`mo-tw-dusk${shroud ? " deep" : ""}`} />
          {shroud && (
            <svg className="mo-tw-const" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
              <path pathLength={1} d={`M${stars.slice(0, 7).map((p) => `${p.x},${p.y}`).join(" L")}`} />
              <path pathLength={1} d={`M${stars.slice(7, 13).map((p) => `${p.x},${p.y}`).join(" L")}`} />
              <path pathLength={1} d={`M${stars.slice(13, 18).map((p) => `${p.x},${p.y}`).join(" L")}`} />
            </svg>
          )}
          {stars.map((p, i) => (
            <span key={i} className="mo-tw-star" style={v({ x: `${p.x}%`, y: `${p.y}%`, d: `${200 + rnd(i, 9) * 900}ms` })} />
          ))}
          <svg className="mo-tw-moon" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M64 12A38 38 0 1 0 88 66A30 30 0 1 1 64 12Z" />
          </svg>
          <span className="mo-tw-dome" />
          <span className="mo-tw-dome inner" />
          {shroud && range(6).map((i) => <span key={`v${i}`} className="mo-tw-veil" style={v({ i, x: `${8 + i * 16}%` })} />)}
          {range(shroud ? 16 : 10).map((i) => (
            <span key={`m${i}`} className="mo-tw-mote" style={v({ x: `${(rnd(i, 3) - 0.5) * 240}px`, d: `${500 + rnd(i, 4) * 900}ms` })} />
          ))}
        </>
      );
    }
    // Steps of Night: night mist below, steps of starlight going up, and you rise on them.
    case "steps-of-night":
      return (
        <>
          <span className="mo-sn-mist" />
          {range(6).map((i) => (
            <span key={i} className="mo-sn-step" style={v({ i, x: `${16 + i * 13}%`, y: `${78 - i * 9}%` })} />
          ))}
          <svg className="mo-sn-moon" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M64 12A38 38 0 1 0 88 66A30 30 0 1 1 64 12Z" />
          </svg>
          {range(10).map((i) => (
            <span key={`s${i}`} className="mo-sn-spark" style={v({ x: `${10 + rnd(i, 2) * 80}%`, d: `${300 + rnd(i, 5) * 900}ms` })} />
          ))}
        </>
      );
    // Exhaustion, by level: 1 heavy breath and sweat; 2 a weight drags you down; 3 your sight doubles and blurs;
    // 4 your heart cracks; 5 chains close in; 6 the light goes out.
    case "exhaustion": {
      const n = Math.min(6, Math.max(1, m.values?.[0] ?? 1));
      return (
        <>
          <span className="mo-ex-dark" />
          {n === 1 && range(12).map((i) => <span key={i} className="mo-ex-drop" style={v({ x: `${6 + rnd(i, 2) * 88}%`, d: `${rnd(i, 3) * 700}ms` })} />)}
          {n === 2 && (
            <svg className="mo-ex-weight" viewBox="0 0 100 120" aria-hidden="true">
              <path className="chain" d="M50 0v40" />
              <path className="ball" d="M30 40h40l10 60H20Z" />
              <text x="50" y="86" textAnchor="middle">½</text>
            </svg>
          )}
          {n === 3 && (
            <>
              <svg className="mo-ex-eye a" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M8 50C24 26 76 26 92 50C76 74 24 74 8 50Z M50 38a12 12 0 1 0 0.1 0Z" />
              </svg>
              <svg className="mo-ex-eye b" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M8 50C24 26 76 26 92 50C76 74 24 74 8 50Z M50 38a12 12 0 1 0 0.1 0Z" />
              </svg>
            </>
          )}
          {n === 4 && (
            <svg className="mo-ex-heart" viewBox="0 0 100 100" aria-hidden="true">
              <g className="l">
                <path d="M50 86C20 64 10 46 10 32c0-12 10-20 20-20c8 0 16 6 20 14L44 40l10 12l-8 14Z" />
              </g>
              <g className="r">
                <path d="M50 86c30-22 40-40 40-54c0-12-10-20-20-20c-8 0-16 6-20 14L44 40l10 12l-8 14Z" />
              </g>
              <path className="crack" pathLength={1} d="M50 26L44 40l10 12l-8 14L50 86" />
            </svg>
          )}
          {n === 5 && (
            <>
              <svg className="mo-ex-chain l" viewBox="0 0 200 40" aria-hidden="true">
                {range(6).map((i) => <rect key={i} x={i * 32 + 2} y="8" width="34" height="24" rx="12" />)}
              </svg>
              <svg className="mo-ex-chain r" viewBox="0 0 200 40" aria-hidden="true">
                {range(6).map((i) => <rect key={i} x={i * 32 + 2} y="8" width="34" height="24" rx="12" />)}
              </svg>
            </>
          )}
          {n === 6 && (
            <>
              <span className="mo-ex-black" />
              <svg className="mo-ex-flat" viewBox="0 0 300 80" aria-hidden="true">
                <path pathLength={1} d="M0,40 L70,40 L82,14 L94,66 L104,40 L300,40" />
              </svg>
              <svg className="mo-ex-skull" viewBox="0 0 100 100" aria-hidden="true">
                <path d="M50 12c-22 0-34 14-34 34c0 12 6 20 14 24v12h40V70c8-4 14-12 14-24c0-20-12-34-34-34Z M36 48a7 7 0 1 0 0.1 0Z M64 48a7 7 0 1 0 0.1 0Z M42 82v-8 M50 82v-8 M58 82v-8" />
              </svg>
            </>
          )}
        </>
      );
    }
    // Exhaustion lifting: the dark draws back, a breath of light.
    case "exhaustion-eases":
      return (
        <>
          <span className="mo-ex-lift" />
          {range(10).map((i) => (
            <span key={i} className="mo-mote" style={v({ x: `${(rnd(i) - 0.5) * 200}px`, d: `${200 + rnd(i, 2) * 600}ms`, s: `${4 + rnd(i, 3) * 4}px` })} />
          ))}
        </>
      );
    // Divine Intervention answered: the sky goes dark, the clouds part, a pillar of light comes down through
    // turning rings of sacred geometry, a sigil bursts, a shockwave, and light rises everywhere.
    case "divine-intervention":
      return (
        <>
          <span className="mo-di-dark" />
          <span className="mo-di-cloud l" />
          <span className="mo-di-cloud r" />
          <span className="mo-di-pillar" />
          <svg className="mo-di-geo" viewBox="-120 -120 240 240" aria-hidden="true">
            <circle className="r1" r="104" pathLength={1} />
            <circle className="r2" r="88" pathLength={1} />
            <g className="ticks">
              {range(24).map((i) => (
                <line key={i} x1="0" y1="-112" x2="0" y2={i % 2 ? -104 : -98} transform={`rotate(${i * 15})`} />
              ))}
            </g>
            <polygon className="star a" pathLength={1} points={range(6).map((i) => `${Math.sin((i * Math.PI) / 3) * 80},${-Math.cos((i * Math.PI) / 3) * 80}`).filter((_, i) => i % 2 === 0).join(" ")} />
            <polygon className="star b" pathLength={1} points={range(6).map((i) => `${Math.sin((i * Math.PI) / 3) * 80},${-Math.cos((i * Math.PI) / 3) * 80}`).filter((_, i) => i % 2 === 1).join(" ")} />
            <circle className="r3" r="40" pathLength={1} />
          </svg>
          <svg className="mo-di-sigil" viewBox="-100 -100 200 200" aria-hidden="true">
            {range(16).map((i) => (
              <line key={i} x1="0" y1="-26" x2="0" y2={i % 2 ? -62 : -92} transform={`rotate(${i * 22.5})`} />
            ))}
            <circle r="22" />
          </svg>
          <span className="mo-di-wave" />
          <span className="mo-di-flash" />
          {range(26).map((i) => (
            <span key={i} className="mo-di-mote" style={v({ x: `${rnd(i) * 100}%`, d: `${900 + rnd(i, 2) * 1600}ms`, s: `${3 + rnd(i, 3) * 5}px` })} />
          ))}
          {range(8).map((i) => (
            <span key={`f${i}`} className="mo-di-feather" style={v({ x: `${10 + rnd(i, 4) * 80}%`, d: `${1300 + rnd(i, 5) * 900}ms`, r: `${-50 + rnd(i, 6) * 100}deg` })} />
          ))}
        </>
      );
    // Not answered: the clouds gather, a faint light tries and fades.
    case "divine-silence":
      return (
        <>
          <span className="mo-di-dark" />
          <span className="mo-di-cloud l shut" />
          <span className="mo-di-cloud r shut" />
          <span className="mo-di-faint" />
        </>
      );
    case "sunlight":
      return (
        <>
          <span className="mo-sunwash" />
          <span className="mo-sun" />
          <svg className="mo-sunrays" viewBox="-200 -200 400 400" aria-hidden="true">
            {range(24).map((i) => (
              <line key={i} x1="0" y1="-70" x2="0" y2={i % 2 ? -150 : -190} transform={`rotate(${i * 15})`} />
            ))}
          </svg>
          <SunCrown className="mo-crown" />
          {range(8).map((i) => (
            <span key={i} className="mo-shadow" style={v({ a: `${i * 45 + rnd(i) * 20}deg` })} />
          ))}
        </>
      );
  }
}
