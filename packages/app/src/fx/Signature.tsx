import type { CSSProperties, ReactNode } from "react";
import type { GenLook } from "./generated";

/**
 * Signature spells (12b): the hand-made piece drawn inside a generated effect
 * (GenSpell), in place of its generic shape. Each is a few HTML/SVG pieces
 * moved with transform, opacity and stroke-dashoffset only, timed by the
 * effect's --ms / --d0 / --d1 (styles.css, "Signature spells"). Pieces that
 * span the screen use an SVG sized to the window; the rest sit at the anchor.
 */

const v = (o: Record<string, string | number>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [`--${k}`, String(x)])) as CSSProperties;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const RAINBOW = ["255, 70, 70", "255, 150, 50", "255, 230, 70", "90, 220, 110", "80, 160, 255", "120, 90, 230", "200, 110, 255"];

/** A deterministic scatter (no Math.random: the same each time, and in tests). */
const rnd = (i: number, k = 1) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Pieces at the anchor (inside .gs-at) and pieces across the screen. */
export function Signature({ g, x, y }: { g: GenLook; x: number; y: number }): { at: ReactNode; screen: ReactNode } {
  const W = typeof window !== "undefined" ? window.innerWidth : 390;
  const H = typeof window !== "undefined" ? window.innerHeight : 844;
  const cast = g.phase === "cast";
  const screen = (children: ReactNode, cls = "") => (
    <svg className={`sig-svg ${cls}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {children}
    </svg>
  );
  const none = { at: null, screen: null };
  switch (g.sig) {
    // Fireball: a bright bead streaks up from your hand; its burst comes with the damage.
    case "bead":
      return cast ? { at: <span className="sig-bead"><i /></span>, screen: null } : none;
    // Lightning Bolt: arcs crackle around your hand, then the bolt cuts across.
    case "charge":
      return {
        at: (
          <>
            <svg className="sig-arcs" viewBox="-50 -50 100 100">
              {[0, 60, 120, 180, 240, 300].map((a, i) => (
                <path key={a} className={`a${i % 3}`} d="M0,-10 L5,-20 L-3,-27 L4,-36 L-2,-46" transform={`rotate(${a + 10})`} />
              ))}
            </svg>
            <span className="gs-line sig-bolt" />
          </>
        ),
        screen: null,
      };
    // Magic Missile: glowing darts curve away, one more for each slot level above 1st; on the damage, each strikes.
    case "missiles": {
      const n = g.count ?? 3;
      if (!cast)
        return {
          at: range(n).map((i) => <span key={i} className="sig-dart-hit" style={v({ a: `${(360 / n) * i}deg`, i })} />),
          screen: null,
        };
      return {
        at: null,
        screen: screen(
          range(n).map((i) => {
            const tx = W * (0.15 + (0.7 * (i + 0.5)) / n);
            const ty = H * (0.1 + 0.08 * rnd(i));
            const cx = x + (i % 2 ? 1 : -1) * W * (0.25 + 0.2 * rnd(i, 2));
            const cy = y - H * 0.15;
            return (
              <g key={i} style={v({ i })}>
                <path className="sig-dart-trail" pathLength={1} d={`M${x},${y} Q${cx},${cy} ${tx},${ty}`} />
                <path className="sig-dart" pathLength={1} d={`M${x},${y} Q${cx},${cy} ${tx},${ty}`} />
              </g>
            );
          }),
        ),
      };
    }
    // Eldritch Blast: a crackling beam of violet and green, rings racing along it; on the damage, a force crack.
    case "eldritch":
      return cast
        ? { at: <><span className="gs-ray sig-eb" />{range(3).map((i) => <span key={i} className="sig-eb-ring" style={v({ i })} />)}</>, screen: null }
        : { at: <><span className="gs-core" /><svg className="sig-crack" viewBox="-50 -50 100 100"><path d="M0,0 L12,-9 L18,-24 M0,0 L-14,5 L-28,2 M0,0 L3,15 L-4,30 M0,0 L-6,-14" /></svg></>, screen: null };
    // Healing Word: a glowing word-rune rises and breaks into warm motes.
    case "word":
      return {
        at: (
          <>
            <svg className="sig-rune" viewBox="-40 -40 80 80">
              <path pathLength={1} d="M-24,10 C-18,-14 -6,-14 -4,6 C-2,22 10,22 12,0 C14,-16 24,-16 26,-4 M-14,-22 L-14,22 M16,-24 L18,-14" />
            </svg>
            <span className="gs-core" />
            {range(8).map((i) => <span key={i} className="gs-mote" style={v({ i })} />)}
          </>
        ),
        screen: null,
      };
    // Cure Wounds: two hands of light close around the wound, motes rising.
    case "hands":
      return {
        at: (
          <>
            <svg className="sig-hands" viewBox="-60 -40 120 80">
              <path className="l" d="M-8,30 C-20,28 -34,18 -40,4 L-46,-16 C-47,-20 -42,-22 -40,-18 L-34,-6 L-38,-28 C-39,-33 -33,-34 -32,-29 L-28,-10 L-28,-32 C-28,-37 -22,-37 -22,-32 L-21,-10 L-18,-28 C-17,-33 -11,-32 -12,-27 L-14,-4 C-12,8 -10,18 -8,30 Z" />
              <path className="r" d="M8,30 C20,28 34,18 40,4 L46,-16 C47,-20 42,-22 40,-18 L34,-6 L38,-28 C39,-33 33,-34 32,-29 L28,-10 L28,-32 C28,-37 22,-37 22,-32 L21,-10 L18,-28 C17,-33 11,-32 12,-27 L14,-4 C12,8 10,18 8,30 Z" />
            </svg>
            <span className="gs-core" />
            {range(7).map((i) => <span key={i} className="gs-mote" style={v({ i })} />)}
          </>
        ),
        screen: null,
      };
    // Shield: a hexagonal plate of force snaps into place over your hit points.
    case "shield":
      return {
        at: (
          <svg className="sig-hex" viewBox="-60 -60 120 120">
            <path className="o" d="M0,-52 L45,-26 L45,26 L0,52 L-45,26 L-45,-26 Z" />
            <path className="i" d="M0,-52 L0,52 M-45,-26 L45,26 M45,-26 L-45,26 M0,-26 L22,-13 L22,13 L0,26 L-22,13 L-22,-13 Z" />
          </svg>
        ),
        screen: null,
      };
    // Counterspell: an enemy's circle forms in red, then a blue cut shatters it.
    case "counter":
      return {
        at: (
          <>
            <svg className="sig-enemy" viewBox="-60 -60 120 120">
              <circle r="54" pathLength={1} />
              <circle r="40" pathLength={1} />
              <path pathLength={1} d="M0,-40 L23,32 L-37,-12 L37,-12 L-23,32 Z" />
            </svg>
            <svg className="sig-cut" viewBox="-70 -70 140 140">
              <path pathLength={1} d="M-62,50 L60,-54" />
            </svg>
            {range(10).map((i) => <span key={i} className="sig-shard" style={v({ a: `${i * 36 + 10}deg`, d: `${50 + rnd(i) * 50}px`, i })} />)}
          </>
        ),
        screen: null,
      };
    // Misty Step: silver mist where you stand, a streak, and mist where you arrive.
    case "mist": {
      const tx = W - x < 90 ? x - 150 : x > W - x ? x - 150 : x + 150;
      const ty = Math.max(90, y - 130);
      return {
        at: range(6).map((i) => <span key={i} className="sig-puff" style={v({ i, dx: `${(rnd(i) - 0.5) * 50}px`, dy: `${(rnd(i, 3) - 0.5) * 40}px` })} />),
        screen: (
          <>
            {screen(<path className="sig-streak" pathLength={1} d={`M${x},${y} Q${(x + tx) / 2},${Math.min(y, ty) - 60} ${tx},${ty}`} />)}
            <span className="sig-arrive" style={v({ tx: `${tx}px`, ty: `${ty}px` })}>
              {range(6).map((i) => <span key={i} className="sig-puff p2" style={v({ i, dx: `${(rnd(i, 5) - 0.5) * 50}px`, dy: `${(rnd(i, 7) - 0.5) * 40}px` })} />)}
            </span>
          </>
        ),
      };
    }
    // Hold Person: three rings of runes close in and lock.
    case "bind":
      return {
        at: (
          <>
            {[0, 60, 120].map((a, i) => (
              <span key={a} className="sig-bind" style={v({ r: `${a}deg`, i })} />
            ))}
            <span className="sig-lock" />
          </>
        ),
        screen: null,
      };
    // Haste: golden speed lines race up and a clock hand spins fast.
    case "haste":
      return {
        at: (
          <>
            <svg className="sig-dial" viewBox="-50 -50 100 100">
              <circle r="40" />
              <path className="hand" d="M0,0 L0,-34" />
              {range(12).map((i) => <path key={i} d="M0,-40 L0,-35" transform={`rotate(${i * 30})`} />)}
            </svg>
            {range(9).map((i) => <span key={i} className="sig-speed" style={v({ i, dx: `${(i - 4) * 16}px` })} />)}
          </>
        ),
        screen: null,
      };
    // Fly: wings of light unfurl and lift.
    case "wings":
      return {
        at: (
          <svg className="sig-wings" viewBox="-100 -60 200 120">
            <path className="l" d="M-6,10 C-30,-30 -70,-50 -96,-40 C-80,-30 -78,-22 -86,-14 C-70,-14 -66,-6 -74,4 C-56,0 -46,8 -50,18 C-34,10 -18,14 -6,10 Z" />
            <path className="r" d="M6,10 C30,-30 70,-50 96,-40 C80,-30 78,-22 86,-14 C70,-14 66,-6 74,4 C56,0 46,8 50,18 C34,10 18,14 6,10 Z" />
          </svg>
        ),
        screen: null,
      };
    // Polymorph: shapes swirl from one into another.
    case "morph":
      return {
        at: (
          <svg className="sig-morph" viewBox="-60 -60 120 120">
            <circle className="m0" r="30" />
            <path className="m1" d="M-34,14 C-36,-6 -24,-22 -6,-22 L4,-34 L10,-20 C26,-18 36,-6 36,10 L30,30 L20,18 L-6,22 L-18,32 L-22,20 Z" />
            <path className="m2" d="M-40,0 C-20,-10 -10,-30 0,-34 C6,-20 14,-12 40,-10 C20,0 14,6 10,24 C0,14 -14,12 -40,0 Z" />
          </svg>
        ),
        screen: null,
      };
    // Banishment: a rift tears open, pulls everything in, and seals with a flash.
    case "rift":
      return {
        at: (
          <>
            <span className="sig-rift" />
            {range(12).map((i) => <span key={i} className="sig-pull" style={v({ a: `${i * 30 + 8}deg`, d: `${60 + rnd(i) * 70}px`, i: i % 6 })} />)}
          </>
        ),
        screen: null,
      };
    // Wall of Fire: tongues of flame rise across the screen and flicker.
    case "firewall":
      return {
        at: (
          <span className="sig-flames">
            {range(14).map((i) => <span key={i} style={v({ i, h: `${60 + rnd(i) * 40}%` })} />)}
          </span>
        ),
        screen: null,
      };
    // Cone of Cold: a cone of frost with ice shards flying in it.
    case "frostcone":
      return {
        at: (
          <>
            <span className="gs-cone sig-frost" />
            {range(12).map((i) => <span key={i} className="sig-ice" style={v({ a: `${-28 + rnd(i) * 56}deg`, d: `${50 + rnd(i, 2) * 90}px`, i: i % 6 })} />)}
          </>
        ),
        screen: null,
      };
    // Disintegrate: a thin green ray, then what it hit crumbles to dust.
    case "disint":
      return {
        at: (
          <>
            {cast && <span className="gs-ray sig-dray" />}
            {range(16).map((i) => <span key={i} className="sig-dust" style={v({ dx: `${(rnd(i) - 0.5) * 70}px`, i: i % 8 })} />)}
          </>
        ),
        screen: null,
      };
    // Chain Lightning: one bolt that leaps from target to target across the screen.
    case "chain": {
      const pts = [
        [x, y],
        [W * 0.22, H * 0.22],
        [W * 0.7, H * 0.16],
        [W * 0.82, H * 0.42],
        [W * 0.3, H * 0.48],
      ];
      const jag = (a: number[], b: number[], k: number) => {
        const mx = (a[0]! + b[0]!) / 2 + (rnd(k) - 0.5) * 50;
        const my = (a[1]! + b[1]!) / 2 + (rnd(k, 2) - 0.5) * 50;
        return `M${a[0]},${a[1]} L${mx},${my} L${b[0]},${b[1]}`;
      };
      return {
        at: null,
        screen: (
          <>
            {screen(range(4).map((i) => <path key={i} className="sig-chain" pathLength={1} d={jag(pts[i]!, pts[i + 1]!, i)} style={v({ i })} />))}
            {range(4).map((i) => <span key={i} className="sig-node" style={v({ nx: `${pts[i + 1]![0]}px`, ny: `${pts[i + 1]![1]}px`, i })} />)}
          </>
        ),
      };
    }
    // Finger of Death: a dark ray, and a skull of shadow that fades into tendrils.
    case "fod":
      return {
        at: (
          <>
            {cast && <span className="gs-ray sig-fray" />}
            <svg className="sig-skull" viewBox="-50 -50 100 100">
              <path d="M0,-34 C20,-34 28,-20 28,-6 C28,8 20,12 17,17 L17,28 L-17,28 L-17,17 C-20,12 -28,8 -28,-6 C-28,-20 -20,-34 0,-34 Z M-14,-8 C-14,-14 -4,-14 -4,-6 C-4,0 -14,2 -14,-8 Z M14,-8 C14,-14 4,-14 4,-6 C4,0 14,2 14,-8 Z M-2,6 L0,0 L2,6 Z" />
            </svg>
            {range(6).map((i) => <span key={i} className="sig-tendril" style={v({ a: `${i * 60 + 30}deg`, i })} />)}
          </>
        ),
        screen: null,
      };
    // Prismatic Spray: seven rays, one per colour, fanning out.
    case "pspray":
      return {
        at: RAINBOW.map((c, i) => <span key={i} className="sig-pray" style={v({ c, a: `${-36 + i * 12}deg`, i })} />),
        screen: null,
      };
    // Prismatic Wall: seven shimmering bands of colour rise across the screen.
    case "pwall":
      return {
        at: (
          <span className="sig-pwall">
            {RAINBOW.map((c, i) => <span key={i} style={v({ c, i })} />)}
          </span>
        ),
        screen: null,
      };
    // Sunburst: a sun swells, its rays turning, then floods the screen with light.
    case "sun":
      return {
        at: (
          <>
            <span className="sig-sun" />
            <svg className="sig-sunrays" viewBox="-100 -100 200 200">
              {range(16).map((i) => <path key={i} d={i % 2 ? "M0,-46 L4,-70 L0,-96 L-4,-70 Z" : "M0,-46 L3,-64 L0,-80 L-3,-64 Z"} transform={`rotate(${i * 22.5})`} />)}
            </svg>
          </>
        ),
        screen: null,
      };
    // Power Word Kill: the dark falls, one word in red, a heartbeat, and the word cracks.
    case "pwk":
      return {
        at: (
          <>
            <svg className="sig-pwk" viewBox="-60 -60 120 120">
              <path className="w" d="M0,-46 L0,46 M0,-14 L-26,-40 M0,-14 L26,-40 M0,14 L-22,36 M0,14 L22,36 M-12,-2 L12,-2" />
              <circle className="w" cy="-50" r="5" />
              <path className="crack" pathLength={1} d="M2,-58 L-6,-22 L8,-6 L-4,18 L6,58" />
            </svg>
            <span className="sig-thump" />
          </>
        ),
        screen: <span className="sig-black" />,
      };
    // Meteor Swarm: four blazing spheres streak down one after another and burst.
    case "meteors": {
      const hits = [
        [x - 70, y + 30],
        [x + 80, y - 40],
        [x - 30, y - 90],
        [x + 40, y + 70],
      ].map(([a, b]) => [Math.min(Math.max(a!, 40), W - 40), Math.min(Math.max(b!, 80), H - 80)]);
      return {
        at: null,
        screen: (
          <>
            {screen(
              hits.map(([hx, hy], i) => {
                const sx = i % 2 ? W + 40 : -40;
                return <path key={i} className="sig-meteor" pathLength={1} d={`M${sx},${-60 - i * 20} L${hx},${hy}`} style={v({ i })} />;
              }),
            )}
            {hits.map(([hx, hy], i) => (
              <span key={i} className="sig-impact" style={v({ nx: `${hx}px`, ny: `${hy}px`, i })}>
                <i />
                <b />
              </span>
            ))}
          </>
        ),
      };
    }
    // Time Stop: a great clock; its hands race, then stop dead, and the world holds still.
    case "clock":
      return {
        at: (
          <svg className="sig-clock" viewBox="-100 -100 200 200">
            <circle r="92" />
            <circle className="in" r="80" />
            {range(12).map((i) => <path key={i} d={i % 3 ? "M0,-92 L0,-84" : "M0,-92 L0,-76"} transform={`rotate(${i * 30})`} />)}
            <path className="hour" d="M0,8 L0,-46" />
            <path className="minute" d="M0,10 L0,-70" />
            <circle className="pin" r="4" />
          </svg>
        ),
        screen: <span className="sig-still" />,
      };
    // Wish: stars come from every edge and gather into one blazing star.
    case "wish":
      return {
        at: (
          <>
            {range(18).map((i) => <span key={i} className="sig-star" style={v({ a: `${i * 20 + rnd(i) * 10}deg`, d: `${Math.max(W, H) * (0.45 + rnd(i, 4) * 0.2)}px`, i: i % 6 })} />)}
            <svg className="sig-bigstar" viewBox="-50 -50 100 100">
              <path d="M0,-46 L8,-8 L46,0 L8,8 L0,46 L-8,8 L-46,0 L-8,-8 Z" />
            </svg>
          </>
        ),
        screen: null,
      };
    // True Resurrection: a pillar of light comes down, a soul rises, wings of light open.
    case "rez":
      return {
        at: (
          <>
            <span className="gs-col sig-pillar" />
            <svg className="sig-wings sig-rezwings" viewBox="-100 -60 200 120">
              <path className="l" d="M-6,10 C-30,-30 -70,-50 -96,-40 C-80,-30 -78,-22 -86,-14 C-70,-14 -66,-6 -74,4 C-56,0 -46,8 -50,18 C-34,10 -18,14 -6,10 Z" />
              <path className="r" d="M6,10 C30,-30 70,-50 96,-40 C80,-30 78,-22 86,-14 C70,-14 66,-6 74,4 C56,0 46,8 50,18 C34,10 18,14 6,10 Z" />
            </svg>
            {range(9).map((i) => <span key={i} className="gs-mote" style={v({ i })} />)}
          </>
        ),
        screen: null,
      };
    // Gate: a great ring opens from a line, a vortex turning inside it.
    case "portal":
      return {
        at: (
          <span className="sig-portal">
            <i />
            <b />
          </span>
        ),
        screen: null,
      };
    // Mass Heal: a wave of emerald and gold light rolls up the whole screen.
    case "massheal":
      return {
        at: range(9).map((i) => <span key={i} className="gs-mote" style={v({ i })} />),
        screen: (
          <>
            <span className="sig-wave" />
            {range(14).map((i) => <span key={i} className="sig-rise" style={v({ i, lx: `${(i * 7.3) % 100}%` })} />)}
          </>
        ),
      };
    // Revivify: a heartbeat line across the screen, and a heart of light beats once.
    case "heart":
      return {
        at: (
          <svg className="sig-heart" viewBox="-50 -50 100 100">
            <path d="M0,34 C-30,12 -40,-4 -40,-16 C-40,-30 -22,-38 0,-20 C22,-38 40,-30 40,-16 C40,-4 30,12 0,34 Z" />
          </svg>
        ),
        screen: screen(<path className="sig-ecg" pathLength={1} d={`M0,${y} L${x - 60},${y} L${x - 44},${y - 8} L${x - 32},${y} L${x - 18},${y + 14} L${x - 6},${y - 70} L${x + 8},${y + 40} L${x + 20},${y} L${x + 40},${y - 12} L${x + 58},${y} L${W},${y}`} />),
      };
    default:
      return g.sig?.startsWith("cls-") ? { at: <ClassPiece cls={g.sig.slice(4)} />, screen: null } : none;
  }
}

/** Class emblems (12c), viewBox -50..50: drawn in the class's second colour over a faint fill of its first. */
const EMBLEMS: Record<string, string> = {
  barbarian: "M-30,-32 Q-8,0 -26,36 M-6,-38 Q16,-4 0,38 M18,-34 Q38,0 24,36",
  bard: "M-14,30 A9,7 -20 1 1 -14,29.9 M-6,27 L-6,-30 L24,-38 L24,18 M24,18 A9,7 -20 1 1 24,17.9 M-6,-16 L24,-24",
  cleric: "M0,-40 L0,40 M-40,0 L40,0 M14,0 A14,14 0 1 1 -14,0 A14,14 0 1 1 14,0 M-22,-22 L-14,-14 M22,-22 L14,-14 M-22,22 L-14,14 M22,22 L14,14",
  druid: "M0,40 C-30,12 -26,-28 0,-42 C26,-28 30,12 0,40 Z M0,40 L0,-32 M0,12 L-14,-2 M0,-6 L14,-20 M0,24 L12,12",
  fighter: "M-34,34 L24,-24 L32,-36 L20,-28 Z M34,34 L-24,-24 L-32,-36 L-20,-28 Z M-24,16 L-14,26 M24,16 L14,26",
  monk: "M0,-36 A36,36 0 1 1 0,36 A36,36 0 1 1 0,-36 M0,-36 A18,18 0 0 1 0,0 A18,18 0 0 0 0,36 M4,-18 A4,4 0 1 1 -4,-18 A4,4 0 1 1 4,-18",
  paladin: "M0,-40 L30,-28 L28,6 C24,24 10,34 0,42 C-10,34 -24,24 -28,6 L-30,-28 Z M0,-24 L0,26 M-15,-6 L15,-6",
  ranger: "M-34,34 L30,-30 M30,-30 L12,-28 M30,-30 L28,-12 M-34,34 L-34,20 M-34,34 L-20,34 M-28,28 L-28,16 M-28,28 L-16,28 M-6,-34 A30,30 0 0 1 34,6",
  rogue: "M0,-42 L7,-8 L4,16 L-4,16 L-7,-8 Z M-16,16 L16,16 M0,16 L0,34 M-5,40 A5,5 0 1 0 5,40",
  sorcerer: "M0,38 C-26,26 -26,-6 -6,-18 C-10,-4 2,0 4,-10 C8,-22 2,-32 -2,-42 C22,-28 32,0 24,18 C18,30 8,36 0,38 Z",
  warlock: "M-38,0 C-20,-24 20,-24 38,0 C20,24 -20,24 -38,0 Z M0,-14 L6,0 L0,14 L-6,0 Z M-30,-30 L-22,-22 M30,-30 L22,-22",
  wizard: "M0,-18 C-14,-28 -30,-28 -38,-24 L-38,28 C-30,24 -14,24 0,34 C14,24 30,24 38,28 L38,-24 C30,-28 14,-28 0,-18 Z M0,-18 L0,34 M-30,-10 L-10,-6 M-30,2 L-10,6 M10,-6 L30,-10 M10,6 L30,2",
  artificer: "M0,-14 A14,14 0 1 1 0,14 A14,14 0 1 1 0,-14 M0,-36 L0,-24 M0,24 L0,36 M-36,0 L-24,0 M24,0 L36,0 M-25,-25 L-17,-17 M25,25 L17,17 M25,-25 L17,-17 M-25,25 L-17,17",
};
const STAR = "M0,-40 L8,-8 L40,0 L8,8 L0,40 L-8,8 L-40,0 L-8,-8 Z";

/** The class's emblem and its one accent: claws and a roar, notes, a halo, leaves, a shockwave, a ki ring, a pillar, an arrow, smoke, sparks, tendrils, orbiting runes. */
function ClassPiece({ cls }: { cls: string }) {
  const emblem = (
    <svg className="sig-emblem" viewBox="-50 -50 100 100">
      <path className="glow" pathLength={1} d={EMBLEMS[cls] ?? STAR} />
      <path pathLength={1} d={EMBLEMS[cls] ?? STAR} />
    </svg>
  );
  const accent = (() => {
    switch (cls) {
      case "barbarian":
      case "fighter":
        return range(2).map((i) => <span key={i} className="gs-wave sig-acc-wave" style={v({ i })} />);
      case "bard":
        return range(6).map((i) => <span key={i} className="sig-note" style={v({ i, dx: `${(i - 2.5) * 22}px` })}>{i % 2 ? "\u266B" : "\u266A"}</span>);
      case "cleric":
        return <span className="sig-halo" />;
      case "paladin":
        return (
          <>
            <span className="gs-col sig-pillar sig-acc-pillar" />
            <span className="sig-halo" />
          </>
        );
      case "druid":
      case "ranger":
        return range(8).map((i) => <span key={i} className="sig-leafc" style={v({ a: `${i * 45 + 10}deg`, i: i % 4 })} />);
      case "monk":
        return <span className="sig-kiring" />;
      case "rogue":
        return range(5).map((i) => <span key={i} className="sig-puff sig-smoke" style={v({ i, dx: `${(rnd(i) - 0.5) * 60}px`, dy: `${(rnd(i, 3) - 0.5) * 40}px` })} />);
      case "warlock":
        return range(6).map((i) => <span key={i} className="sig-tendril" style={v({ a: `${i * 60 + 30}deg`, i })} />);
      case "wizard":
      case "sorcerer":
        return (
          <span className="sig-orbit">
            {range(8).map((i) => (
              <i key={i} style={v({ a: `${i * 45}deg` })}>
                {["\u2726", "\u25C7", "\u2727", "\u25B3"][i % 4]}
              </i>
            ))}
          </span>
        );
      default:
        return <span className="gs-core" />;
    }
  })();
  return (
    <>
      {accent}
      {emblem}
    </>
  );
}

/** Signatures whose piece replaces the impact on the damage too (the rest show the generic impact there). */
export const SIG_HIT = new Set(["missiles", "eldritch", "frostcone", "disint", "chain", "fod", "pspray", "sun", "meteors", "firewall", "pwall"]);
