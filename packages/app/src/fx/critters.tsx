import type { CreatureDef } from "@dnd/schema";
import type { ReactNode } from "react";

/**
 * Tiny animated creatures that sit on a summoning's row on Play: an imp perched on Find Familiar's card,
 * a warhorse on Find Steed's. Each is drawn from a body plan with its own colours and features, and keeps
 * busy: it blinks, looks around, and now and then does its own thing (the cat licks a paw, the owl turns
 * its head, the imp juggles a flame, the spider drops on a thread). Familiars, steeds and the Summon
 * spirits are tuned by hand; any other creature gets a look worked out from its type, size and speed.
 */

export type Plan =
  | "quad"
  | "bird"
  | "bat"
  | "snake"
  | "fish"
  | "crab"
  | "octopus"
  | "frog"
  | "bug"
  | "imp"
  | "drake"
  | "sprite"
  | "undead"
  | "blob"
  | "construct"
  | "angel"
  | "fiend"
  | "flame"
  | "humanoid";

export interface CritterSpec {
  plan: Plan;
  /** Main colour, second colour, eye colour. */
  c1: string;
  c2: string;
  eye?: string;
  /** Extra parts and habits: "ears", "longtail", "mane", "horn", "antlers", "hump", "stripes", "wings", "horns",
   * "tufts", "beak", "bow", "halo", "bones", "wraps", "arms", "stinger", "legs8", "legs100", "glow", "cube",
   * "rock", "swirl", "drop", "eyestalks", "star", "big", "huge", "small", "tiny", "smoke". */
  f?: string[];
  /** Its own trick, played now and then: "lick", "turn", "juggle", "drop", "ink", "tongue", "snap", "peck",
   * "flutter", "stomp", "rattle", "sway", "flicker", "loop", "hop", "spin". */
  trick?: string;
}

const s = (plan: Plan, c1: string, c2: string, f: string[] = [], trick?: string, eye?: string): CritterSpec => ({ plan, c1, c2, f, ...(trick ? { trick } : {}), ...(eye ? { eye } : {}) });

/** Hand-tuned: familiars (and pact familiars), steeds, and the Summon spirits by variant. */
export const CRITTERS: Record<string, CritterSpec> = {
  // Find Familiar
  "creature:bat": s("bat", "#3d3346", "#6b5a7a", ["ears"], "flutter", "#ffd27a"),
  "creature:cat": s("quad", "#e09a4f", "#fff1dc", ["ears", "longtail", "small"], "lick", "#9be36a"),
  "creature:crab": s("crab", "#d9583c", "#f2a07a", ["eyestalks"], "snap"),
  "creature:frog": s("frog", "#5fa84a", "#c9e88a", [], "tongue", "#ffe066"),
  "creature:hawk": s("bird", "#8a5a32", "#e8d2a8", ["beak"], "peck", "#ffcc33"),
  "creature:lizard": s("quad", "#7aa84a", "#d6e8a0", ["longtail", "small", "flat"], "tongue", "#ffcc33"),
  "creature:octopus": s("octopus", "#c45a8a", "#f2a6c8", [], "ink"),
  "creature:owl": s("bird", "#9c7a54", "#efe2c4", ["tufts", "beak", "bigeyes"], "turn", "#ffb020"),
  "creature:poisonous-snake": s("snake", "#5e8a3a", "#c2d86a", [], "tongue", "#ff5a3a"),
  "creature:quipper": s("fish", "#6a8aa8", "#d84a4a", ["teeth"], "spin"),
  "creature:rat": s("quad", "#7a7068", "#c9b8b0", ["ears", "longtail", "tiny"], "lick", "#ff4a4a"),
  "creature:raven": s("bird", "#22222e", "#48485e", ["beak"], "peck", "#c8d0ff"),
  "creature:sea-horse": s("fish", "#e8a83a", "#ffd88a", ["seahorse"], "spin"),
  "creature:spider": s("bug", "#2e2a30", "#7a3a3a", ["legs8"], "drop", "#ff3a3a"),
  "creature:weasel": s("quad", "#a8743e", "#f4e2c4", ["ears", "longtail", "small", "flat"], "hop"),
  "creature:imp": s("imp", "#c8323a", "#7a141c", ["horns", "wings", "spadetail"], "juggle", "#ffe066"),
  "creature:pseudodragon": s("drake", "#c86a3a", "#f2b46a", ["wings", "horns"], "flutter", "#7affd2"),
  "creature:quasit": s("imp", "#4a8a3a", "#1e4a1a", ["horns", "spadetail", "claws"], "hop", "#ffdd33"),
  "creature:sprite": s("sprite", "#8ad6a8", "#e8fff0", ["wings", "bow"], "loop", "#3a7aff"),
  // Find Steed, Find Greater Steed
  "creature:warhorse": s("quad", "#6a4a32", "#2e2018", ["mane", "big", "horse"], "stomp"),
  "creature:pony": s("quad", "#c8a07a", "#f2e2c8", ["mane", "horse"], "stomp"),
  "creature:camel": s("quad", "#d2a868", "#f2dcae", ["hump", "big", "horse"], "stomp"),
  "creature:elk": s("quad", "#8a5e3a", "#e8d6b8", ["antlers", "big", "horse"], "stomp"),
  "creature:mastiff": s("quad", "#a8784a", "#3a2a1e", ["ears", "dog"], "hop"),
  "creature:griffon": s("quad", "#c8a050", "#f4f0e0", ["wings", "beak", "big"], "flutter"),
  "creature:pegasus": s("quad", "#f2f2f8", "#c8d8ff", ["wings", "mane", "big", "horse"], "flutter"),
  "creature:dire-wolf": s("quad", "#6a6a74", "#c8c8d0", ["ears", "dog", "big"], "turn", "#ffcc33"),
  "creature:rhinoceros": s("quad", "#8a8a8e", "#b8b8bc", ["horn", "big"], "stomp"),
  "creature:saber-toothed-tiger": s("quad", "#e09040", "#2e1e12", ["ears", "stripes", "fangs", "big"], "lick", "#9be36a"),
  "creature:peryton": s("quad", "#3a5aa0", "#8ab8e8", ["wings", "antlers", "beak"], "flutter", "#ff4a4a"),
  // Animate Dead, Create Undead
  "creature:skeleton": s("undead", "#e8e2d2", "#a8a294", ["bones"], "rattle", "#5affd2"),
  "creature:zombie": s("undead", "#7a9a6a", "#4a5a3a", ["arms"], "sway", "#ffe066"),
  "creature:ghoul": s("undead", "#9aa08a", "#5a5e4a", ["claws", "arms"], "sway", "#ff5a3a"),
  "creature:ghast": s("undead", "#8a8e70", "#4a4e3a", ["claws", "arms", "smoke"], "sway", "#ffcc33"),
  "creature:wight": s("undead", "#5a6070", "#2a2e3a", ["glow"], "turn", "#7ac8ff"),
  "creature:mummy": s("undead", "#d8c8a0", "#9a8a68", ["wraps", "arms"], "sway", "#5aff7a"),
  // Giant Insect
  "creature:giant-centipede": s("bug", "#a8503a", "#e8a07a", ["legs100"], "sway"),
  "creature:giant-spider": s("bug", "#3a2e3e", "#8a2a3a", ["legs8", "big"], "drop", "#ff3a3a"),
  "creature:giant-wasp": s("bug", "#e8c03a", "#2a2a2a", ["wasp", "wings"], "flutter"),
  "creature:giant-scorpion": s("bug", "#a8682a", "#5a3412", ["stinger", "claws", "legs8"], "snap"),
  // Heammer Wisps (Theros)
  "creature:heammer-wisp": s("flame", "#ffb24a", "#fff2c8", ["wisp"], "flicker", "#fff"),
  // Animate Objects
  "creature:animated-object-tiny": s("construct", "#a87a4a", "#e8c89a", ["cube", "tiny"], "hop", "#5affd2"),
  "creature:animated-object-small": s("construct", "#8a8aa0", "#c8c8d8", ["cube", "small"], "hop", "#5affd2"),
  "creature:animated-object-medium": s("construct", "#7a5a3a", "#c89a6a", ["cube"], "hop", "#5affd2"),
  "creature:animated-object-large": s("construct", "#6a6a74", "#b8b8c4", ["cube", "big"], "stomp", "#5affd2"),
  "creature:animated-object-huge": s("construct", "#5a4a3a", "#a8946a", ["cube", "huge"], "stomp", "#5affd2"),
};

/** The Summon spirits, by spell and variant. */
export const SPIRIT_CRITTERS: Record<string, CritterSpec> = {
  "summon-beast/air": s("bird", "#5a8ac8", "#d8ecff", ["beak", "glow"], "flutter", "#fff"),
  "summon-beast/land": s("quad", "#7a6a4a", "#d8c89a", ["ears", "dog", "glow"], "hop", "#fff"),
  "summon-beast/water": s("fish", "#3a8aa8", "#a8e8f0", ["glow"], "spin", "#fff"),
  "summon-fey/fuming": s("sprite", "#5a3a5a", "#c88ab8", ["wings", "smoke"], "loop", "#ff8a3a"),
  "summon-fey/mirthful": s("sprite", "#e88ab8", "#fff0f8", ["wings"], "loop", "#3aaa7a"),
  "summon-fey/tricksy": s("sprite", "#3a6a5a", "#a8e8c8", ["wings", "horns"], "loop", "#ffcc33"),
  "summon-shadowspawn/fury": s("blob", "#1e1428", "#7a2a3a", ["smoke", "claws"], "flicker", "#ff3a3a"),
  "summon-shadowspawn/despair": s("blob", "#14182a", "#3a4a7a", ["smoke"], "sway", "#7aa8ff"),
  "summon-shadowspawn/fear": s("blob", "#120e18", "#4a2a5a", ["smoke", "bigeyes"], "flicker", "#ffcc33"),
  "summon-undead/ghostly": s("blob", "#c8e0f0", "#7aa0c0", ["ghost"], "loop", "#2a3a5a"),
  "summon-undead/putrid": s("undead", "#7a8a4a", "#4a5a2a", ["arms", "smoke"], "sway", "#ffe066"),
  "summon-undead/skeletal": s("undead", "#e8e2d2", "#a8a294", ["bones"], "rattle", "#c85aff"),
  "summon-aberration/beholderkin": s("blob", "#a83a6a", "#f2a0c8", ["eyestalks", "bigeye"], "turn", "#fff"),
  "summon-aberration/slaad": s("frog", "#3a8a7a", "#a8d8a0", ["claws"], "hop", "#ff5a3a"),
  "summon-aberration/star-spawn": s("blob", "#3a2a6a", "#a88aff", ["star"], "spin", "#fff"),
  "summon-construct/clay": s("construct", "#a8683a", "#d8a07a", ["round"], "stomp", "#ffcc33"),
  "summon-construct/metal": s("construct", "#8a96a8", "#d8e0ec", ["rivets"], "stomp", "#ff5a3a"),
  "summon-construct/stone": s("construct", "#7a7468", "#b8b0a0", ["rock"], "stomp", "#5affd2"),
  "summon-elemental/air": s("flame", "#c8e0ff", "#ffffff", ["swirl"], "spin", "#3a6aa8"),
  "summon-elemental/earth": s("construct", "#7a5a3a", "#a8946a", ["rock", "round"], "stomp", "#ffcc33"),
  "summon-elemental/fire": s("flame", "#ff6a2a", "#ffe06a", [], "flicker", "#fff"),
  "summon-elemental/water": s("flame", "#3a8ad8", "#a8e0ff", ["drop"], "sway", "#fff"),
  "summon-celestial/avenger": s("angel", "#f2e8c8", "#ffd86a", ["wings", "halo", "bow"], "flutter", "#7ac8ff"),
  "summon-celestial/defender": s("angel", "#f2f2f8", "#ffd86a", ["wings", "halo", "shield"], "flutter", "#7ac8ff"),
  "summon-fiend/demon": s("fiend", "#8a2a3a", "#3a0a14", ["horns", "claws"], "stomp", "#ffcc33"),
  "summon-fiend/devil": s("fiend", "#c83a2a", "#5a1410", ["horns", "wings", "spadetail"], "juggle", "#ffe066"),
  "summon-fiend/yugoloth": s("fiend", "#4a3a6a", "#a88ac8", ["horns", "claws"], "turn", "#7affd2"),
  "summon-draconic-spirit/chromatic": s("drake", "#c83a3a", "#ff9a6a", ["wings", "horns", "big"], "flutter", "#ffe066"),
  "summon-draconic-spirit/gem": s("drake", "#6a3ac8", "#c8a8ff", ["wings", "horns", "big", "glow"], "flutter", "#fff"),
  "summon-draconic-spirit/metallic": s("drake", "#c8a03a", "#fff0b8", ["wings", "horns", "big"], "flutter", "#3a3a3a"),
};

/** A look worked out from the stat block, for creatures nobody tuned (Conjure Animals' beasts, demons, devils). */
export function generatedCritter(d: Pick<CreatureDef, "name" | "type" | "size" | "speed">): CritterSpec {
  const type = d.type.toLowerCase();
  const name = d.name.toLowerCase();
  const fly = (d.speed.fly ?? 0) > 0;
  const swim = (d.speed.swim ?? 0) > 0 && (d.speed.walk ?? 0) <= 10;
  const sz = d.size.toLowerCase();
  const size = sz.startsWith("tiny") ? ["tiny"] : sz.startsWith("small") ? ["small"] : sz.startsWith("large") ? ["big"] : sz.startsWith("huge") || sz.startsWith("garg") ? ["huge"] : [];
  // A colour from the name, so two different wolves of the same plan still differ a little.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const hue = (base: number, spread = 40) => `hsl(${(base + (h % spread) - spread / 2 + 360) % 360} 42% 46%)`;
  const light = (base: number) => `hsl(${(base + 360) % 360} 50% 78%)`;
  if (/spider|scorpion|centipede|insect|beetle|wasp|\bbees?\b|\bants?\b/.test(name) || type.startsWith("swarm")) return s("bug", hue(20), light(20), [...size, /scorpion/.test(name) ? "stinger" : "legs8"], "drop");
  if (/snake|serpent|constrictor|python/.test(name)) return s("snake", hue(110), light(90), size, "tongue");
  if (/crab|lobster/.test(name)) return s("crab", hue(10), light(15), ["eyestalks", ...size], "snap");
  if (/octopus|squid/.test(name)) return s("octopus", hue(320), light(320), size, "ink");
  if (/frog|toad/.test(name)) return s("frog", hue(110), light(90), size, "tongue");
  if (/bat\b|bats/.test(name)) return s("bat", hue(270), light(270), ["ears", ...size], "flutter");
  if (type.startsWith("beast") && swim) return s("fish", hue(200), light(190), size, "spin");
  if (type.startsWith("beast") && fly) return s("bird", hue(30), light(40), ["beak", ...size], "peck");
  if (type.startsWith("beast")) return s("quad", hue(30), light(40), [...size, /wolf|dog|hyena|jackal|mastiff/.test(name) ? "dog" : "ears", /horse|elk|deer|camel|mule|pony/.test(name) ? "horse" : "longtail"], /cat|lion|tiger|panther/.test(name) ? "lick" : "hop");
  if (type.startsWith("dragon")) return s("drake", hue(0, 360), light(h), ["wings", "horns", ...size], "flutter");
  if (type.startsWith("fiend")) return s(size.includes("tiny") || size.includes("small") ? "imp" : "fiend", hue(355), "#3a0a14", ["horns", fly ? "wings" : "claws", ...size], "stomp", "#ffcc33");
  if (type.startsWith("undead")) return s(fly ? "blob" : "undead", fly ? "#c8d8e8" : hue(90), "#3a3e34", [fly ? "ghost" : "arms", ...size], "sway", "#7affd2");
  if (type.startsWith("elemental")) return s("flame", hue(h), light(h), size, "flicker");
  if (type.startsWith("construct")) return s("construct", "#7a7a84", "#c8c8d0", [...size, "rivets"], "stomp");
  if (type.startsWith("celestial")) return s("angel", "#f2ecd8", "#ffd86a", ["wings", "halo", ...size], "flutter");
  if (type.startsWith("fey")) return s("sprite", hue(140), light(150), ["wings", ...size], "loop");
  if (type.startsWith("aberration") || type.startsWith("ooze")) return s("blob", hue(300), light(300), [type.startsWith("ooze") ? "drop" : "bigeye", ...size], "sway");
  if (type.startsWith("plant")) return s("blob", "#4a7a3a", "#a8d88a", ["leafy", ...size], "sway");
  if (type.startsWith("monstrosity")) return s(fly ? "drake" : "quad", hue(h), light(h), [...size, fly ? "wings" : "ears", "fangs"], "stomp");
  return s("humanoid", hue(30), light(30), size, "sway");
}

/** The look for a summoned creature: hand-tuned, a spirit's variant, or worked out from its stat block. */
export function critterFor(creatureId: string, def?: Pick<CreatureDef, "name" | "type" | "size" | "speed">): CritterSpec | undefined {
  const own = CRITTERS[creatureId];
  if (own) return own;
  const spirit = /^creature:spirit\/(?:summon:)?([^/]+)\/([^/]+)\//.exec(creatureId);
  if (spirit) {
    const k = `${spirit[1]}/${spirit[2]}`;
    if (SPIRIT_CRITTERS[k]) return SPIRIT_CRITTERS[k];
  }
  return def ? generatedCritter(def) : undefined;
}

const has = (sp: CritterSpec, f: string) => !!sp.f?.includes(f);

/** Two eyes (or one big one), with the blink. */
function Eyes({ x, y, gap = 5, r = 1.4, color, one }: { x: number; y: number; gap?: number; r?: number; color: string; one?: boolean }) {
  return (
    <g className="cr-eyes">
      {(one ? [x] : [x - gap / 2, x + gap / 2]).map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y} r={r + 0.8} fill="#fff" opacity={0.9} />
          <circle cx={cx} cy={y} r={r} fill={color} />
          <circle cx={cx + r * 0.3} cy={y - r * 0.3} r={r * 0.35} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

/** One body plan, drawn in a 60 × 48 box standing on its bottom edge. */
function body(sp: CritterSpec): ReactNode {
  const { c1, c2 } = sp;
  const eye = sp.eye ?? "#222";
  switch (sp.plan) {
    case "quad": {
      const horse = has(sp, "horse");
      const dog = has(sp, "dog");
      const flat = has(sp, "flat");
      const by = flat ? 38 : horse ? 30 : 33;
      return (
        <>
          <path className="cr-tail" d={has(sp, "longtail") ? `M12 ${by} Q2 ${by - 4} 4 ${by - 14} Q6 ${by - 20} 10 ${by - 18}` : horse ? `M12 ${by - 2} Q4 ${by + 2} 6 ${by + 10}` : `M12 ${by} Q6 ${by - 6} 8 ${by - 10}`} stroke={horse && has(sp, "mane") ? c2 : c1} strokeWidth={horse ? 3.4 : 2.6} fill="none" strokeLinecap="round" />
          {["cr-leg a", "cr-leg b", "cr-leg c", "cr-leg d"].map((c, i) => (
            <rect key={c} className={c} x={[15, 21, 34, 40][i]} y={by + (flat ? 2 : 3)} width={flat ? 3 : 3.4} height={48 - by - (flat ? 2 : 3)} rx={1.5} fill={i % 2 ? c1 : c2} />
          ))}
          <ellipse className="cr-body" cx={28} cy={by} rx={horse ? 17 : 15} ry={flat ? 5 : horse ? 8 : 7} fill={c1} />
          {has(sp, "hump") && <ellipse cx={26} cy={by - 8} rx={7} ry={5} fill={c1} />}
          {has(sp, "stripes") && [20, 26, 32].map((x) => <path key={x} d={`M${x} ${by - 6} q2 4 0 9`} stroke={c2} strokeWidth={1.6} fill="none" />)}
          {has(sp, "wings") && <path className="cr-wing" d={`M24 ${by - 4} Q18 ${by - 22} 34 ${by - 26} Q32 ${by - 14} 36 ${by - 6} Z`} fill={c2} stroke={c1} strokeWidth={0.8} />}
          <g className="cr-head">
            {horse ? (
              <>
                <path d={`M40 ${by - 2} L46 ${by - 16} L53 ${by - 13} L55 ${by - 6} L50 ${by - 5} L46 ${by - 9} Z`} fill={c1} />
                {has(sp, "mane") && <path d={`M39 ${by - 1} L44 ${by - 17} L47 ${by - 18} L45 ${by - 14} L42 ${by - 3} Z`} fill={c2} />}
                {has(sp, "antlers") && <path d={`M47 ${by - 16} l-3 -8 m3 8 l2 -9 m-4 4 l-3 -2 m5 0 l3 -2`} stroke="#d8c8a0" strokeWidth={1.4} fill="none" strokeLinecap="round" />}
                <Eyes x={50} y={by - 12} one r={1.1} color={eye} />
              </>
            ) : (
              <>
                <circle cx={46} cy={by - 6} r={dog ? 6.5 : 6} fill={c1} />
                <ellipse cx={51} cy={by - 4} rx={dog ? 4 : 3} ry={2.6} fill={c2} />
                {has(sp, "ears") && <path className="cr-ears" d={dog ? `M41 ${by - 10} l-3 7 l5 -2 Z M49 ${by - 11} l3 7 l-5 -2 Z` : `M41 ${by - 9} l1 -8 l5 5 Z M47 ${by - 11} l4 -7 l2 7 Z`} fill={c1} />}
                {has(sp, "horn") && <path d={`M52 ${by - 7} l5 -8 l-1 9 Z`} fill="#e8e0c8" />}
                {has(sp, "antlers") && <path d={`M44 ${by - 11} l-3 -8 m3 8 l3 -9`} stroke="#d8c8a0" strokeWidth={1.4} fill="none" />}
                {has(sp, "beak") && <path d={`M51 ${by - 7} l6 2 l-6 2 Z`} fill="#f2c03a" />}
                {has(sp, "fangs") && <path d={`M50 ${by - 2} l1 4 l1 -4 M53 ${by - 2} l1 3 l1 -3`} fill="#fff" stroke="#fff" strokeWidth={0.5} />}
                <Eyes x={46} y={by - 7} gap={4.4} r={1.2} color={eye} />
                <g className="cr-trick-paw">
                  <ellipse cx={50} cy={by + 1} rx={2} ry={1.6} fill={c2} />
                </g>
              </>
            )}
          </g>
        </>
      );
    }
    case "bird":
      return (
        <>
          <path d="M26 40 v8 M32 40 v8" stroke="#e8a83a" strokeWidth={1.4} />
          <path className="cr-tail" d="M18 36 L8 42 L18 40 Z" fill={c1} />
          <ellipse className="cr-body" cx={28} cy={33} rx={11} ry={10} fill={c1} />
          <ellipse cx={30} cy={36} rx={6} ry={6} fill={c2} />
          <path className="cr-wing" d="M18 30 Q22 22 34 30 Q26 40 18 36 Z" fill={c1} stroke={c2} strokeWidth={0.6} />
          <g className="cr-head">
            <circle cx={30} cy={21} r={7.5} fill={c1} />
            {has(sp, "tufts") && <path d="M24 16 l-1 -6 l4 4 Z M36 16 l1 -6 l-4 4 Z" fill={c1} />}
            <circle cx={30} cy={23} r={5} fill={c2} opacity={has(sp, "bigeyes") ? 1 : 0} />
            <path d="M30 24 l3 3 l-3 2 Z" fill="#f2b23a" />
            <Eyes x={30} y={21} gap={has(sp, "bigeyes") ? 6 : 5} r={has(sp, "bigeyes") ? 1.9 : 1.2} color={eye} />
          </g>
        </>
      );
    case "bat":
      return (
        <>
          <path className="cr-wing l" d="M24 30 Q10 18 4 30 Q10 28 12 34 Q16 30 24 36 Z" fill={c2} stroke={c1} strokeWidth={0.8} />
          <path className="cr-wing r" d="M36 30 Q50 18 56 30 Q50 28 48 34 Q44 30 36 36 Z" fill={c2} stroke={c1} strokeWidth={0.8} />
          <ellipse className="cr-body" cx={30} cy={36} rx={7} ry={8} fill={c1} />
          <path d="M27 44 v4 M33 44 v4" stroke={c1} strokeWidth={1.4} />
          <g className="cr-head">
            <circle cx={30} cy={27} r={6} fill={c1} />
            <path d="M25 24 l-1 -7 l4 4 Z M35 24 l1 -7 l-4 4 Z" fill={c1} />
            <Eyes x={30} y={27} gap={4} r={1.1} color={eye} />
          </g>
        </>
      );
    case "snake":
      return (
        <>
          <path className="cr-body" d="M10 44 Q18 34 28 42 Q38 50 46 40 Q50 34 44 30" stroke={c1} strokeWidth={6} fill="none" strokeLinecap="round" />
          <path d="M10 44 Q18 34 28 42 Q38 50 46 40" stroke={c2} strokeWidth={1.4} fill="none" strokeDasharray="2 3" />
          <g className="cr-head">
            <ellipse cx={42} cy={27} rx={6} ry={4.5} fill={c1} />
            <path className="cr-trick-tongue" d="M47 28 l5 0 l2 -2 M52 28 l2 2" stroke="#e83a3a" strokeWidth={0.9} fill="none" />
            <Eyes x={42} y={25.5} gap={4} r={1} color={eye} />
          </g>
        </>
      );
    case "fish":
      return (
        <>
          <path d="M8 26 Q8 48 30 48 Q52 48 52 26" fill="rgba(140, 200, 255, 0.22)" stroke="rgba(200, 230, 255, 0.7)" strokeWidth={1.2} />
          <path d="M9 30 Q30 26 51 30" stroke="rgba(160, 220, 255, 0.6)" strokeWidth={1} fill="none" />
          <g className="cr-swim">
            {has(sp, "seahorse") ? (
              <>
                <path className="cr-body" d="M30 30 Q24 32 26 38 Q28 44 33 42 Q30 40 31 37 Q34 34 33 30 Q36 26 33 24 Q30 23 30 30 Z" fill={c1} />
                <path d="M33 24 l5 1 l-5 2 Z" fill={c2} />
                <Eyes x={32} y={26} one r={0.9} color="#222" />
              </>
            ) : (
              <>
                <path className="cr-tail" d="M20 38 L13 33 L13 43 Z" fill={c2} />
                <ellipse className="cr-body" cx={28} cy={38} rx={9} ry={5.5} fill={c1} />
                {has(sp, "teeth") && <path d="M35 39 l1 1.6 l1 -1.6 l1 1.6" stroke="#fff" strokeWidth={0.6} fill="none" />}
                <Eyes x={32} y={36.5} one r={1} color={sp.eye ?? "#222"} />
              </>
            )}
          </g>
          <circle className="cr-bubble" cx={34} cy={30} r={1.2} fill="none" stroke="rgba(220,240,255,0.9)" strokeWidth={0.6} />
        </>
      );
    case "crab":
      return (
        <>
          {[14, 18, 22, 38, 42, 46].map((x, i) => (
            <path key={x} className={`cr-leg ${i % 2 ? "a" : "b"}`} d={`M${x < 30 ? x + 6 : x - 6} 40 L${x} 47`} stroke={c1} strokeWidth={1.6} />
          ))}
          <ellipse className="cr-body" cx={30} cy={38} rx={12} ry={7} fill={c1} />
          <g className="cr-claw l">
            <path d="M19 36 Q12 30 10 26" stroke={c1} strokeWidth={2.4} fill="none" />
            <path d="M10 26 q-4 -4 0 -6 q2 2 1 4 q3 -2 3 1 Z" fill={c2} />
          </g>
          <g className="cr-claw r">
            <path d="M41 36 Q48 30 50 26" stroke={c1} strokeWidth={2.4} fill="none" />
            <path d="M50 26 q4 -4 0 -6 q-2 2 -1 4 q-3 -2 -3 1 Z" fill={c2} />
          </g>
          <g className="cr-head">
            <path d="M27 32 v-5 M33 32 v-5" stroke={c1} strokeWidth={1.2} />
            <Eyes x={30} y={26} gap={6} r={1.1} color="#222" />
          </g>
        </>
      );
    case "octopus":
      return (
        <>
          {[14, 21, 28, 35, 42].map((x, i) => (
            <path key={x} className={`cr-tentacle t${i}`} d={`M${x + 2} 36 Q${x - 2} 42 ${x + 1} 47 Q${x + 4} 46 ${x + 3} 44`} stroke={c1} strokeWidth={3} fill="none" strokeLinecap="round" />
          ))}
          <g className="cr-head">
            <ellipse className="cr-body" cx={30} cy={28} rx={12} ry={11} fill={c1} />
            <ellipse cx={26} cy={24} rx={3} ry={2} fill={c2} opacity={0.7} />
            <Eyes x={30} y={31} gap={7} r={1.4} color="#222" />
          </g>
          <circle className="cr-trick-ink" cx={46} cy={38} r={5} fill="#2a1a3a" opacity={0} />
        </>
      );
    case "frog":
      return (
        <>
          <path className="cr-leg a" d="M14 46 Q12 38 20 38 L24 46 Z" fill={c1} />
          <path className="cr-leg b" d="M46 46 Q48 38 40 38 L36 46 Z" fill={c1} />
          <ellipse className="cr-body" cx={30} cy={39} rx={13} ry={8} fill={c1} />
          <ellipse cx={30} cy={42} rx={8} ry={4} fill={c2} />
          <g className="cr-head">
            <circle cx={24} cy={30} r={4.2} fill={c1} />
            <circle cx={36} cy={30} r={4.2} fill={c1} />
            <Eyes x={30} y={30} gap={12} r={1.6} color={sp.eye ?? "#222"} />
            <path d="M24 37 Q30 40 36 37" stroke="#2a3a1a" strokeWidth={0.8} fill="none" />
            {has(sp, "claws") && <path d="M18 44 l-2 3 M42 44 l2 3" stroke="#fff" strokeWidth={0.8} />}
            <path className="cr-trick-tongue" d="M30 38 L50 30" stroke="#e8708a" strokeWidth={1.4} strokeLinecap="round" />
          </g>
        </>
      );
    case "bug": {
      const centi = has(sp, "legs100");
      return (
        <>
          <line className="cr-trick-thread" x1={30} y1={0} x2={30} y2={30} stroke="rgba(230,230,240,0.7)" strokeWidth={0.5} />
          <g className="cr-drop">
            {centi ? (
              <>
                {[10, 16, 22, 28, 34, 40, 46].map((x, i) => (
                  <g key={x}>
                    <path className={`cr-leg ${i % 2 ? "a" : "b"}`} d={`M${x} 42 l-2 5 M${x + 2} 42 l2 5`} stroke={c1} strokeWidth={1} />
                    <circle className="cr-body" cx={x + 1} cy={40} r={3.6} fill={i % 2 ? c1 : c2} />
                  </g>
                ))}
                <g className="cr-head">
                  <circle cx={50} cy={38} r={4} fill={c1} />
                  <Eyes x={51} y={37} gap={3} r={0.8} color={sp.eye ?? "#222"} />
                </g>
              </>
            ) : (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <g key={i}>
                    <path className={`cr-leg ${i % 2 ? "a" : "b"}`} d={`M26 ${36 + i} Q${16 - i * 2} ${28 + i * 3} ${12 - i} ${47}`} stroke={c2} strokeWidth={1.8} fill="none" />
                    <path className={`cr-leg ${i % 2 ? "b" : "a"}`} d={`M34 ${36 + i} Q${44 + i * 2} ${28 + i * 3} ${48 + i} ${47}`} stroke={c2} strokeWidth={1.8} fill="none" />
                  </g>
                ))}
                {has(sp, "wasp") && <path className="cr-wing" d="M26 30 Q16 18 24 16 Q30 24 30 30 M34 30 Q44 18 36 16 Q30 24 30 30" fill="rgba(220,240,255,0.6)" stroke="rgba(255,255,255,0.8)" strokeWidth={0.5} />}
                <ellipse className="cr-body" cx={30} cy={38} rx={has(sp, "wasp") ? 6 : 8} ry={6} fill={c1} />
                {has(sp, "wasp") && <path d="M25 36 h10 M25 39 h10" stroke={c2} strokeWidth={1.4} />}
                {has(sp, "stinger") && <path className="cr-tail" d="M24 38 Q12 34 14 22 Q18 18 20 22" stroke={c1} strokeWidth={2.6} fill="none" strokeLinecap="round" />}
                {has(sp, "claws") && <path d="M36 36 l8 -4 l2 -3 M36 39 l9 0 l2 -2" stroke={c2} strokeWidth={1.8} fill="none" />}
                <g className="cr-head">
                  <circle cx={30} cy={31} r={4.2} fill={c1} />
                  <Eyes x={30} y={31} gap={3.4} r={0.9} color={sp.eye ?? "#a82a2a"} />
                </g>
              </>
            )}
          </g>
        </>
      );
    }
    case "imp":
    case "fiend":
    case "humanoid":
    case "undead":
    case "angel":
    case "sprite": {
      const tiny = sp.plan === "imp" || sp.plan === "sprite";
      const top = tiny ? 22 : 14;
      return (
        <>
          {has(sp, "wings") && sp.plan === "sprite" && (
            <g className="cr-wing">
              <ellipse cx={22} cy={top + 8} rx={8} ry={4} fill="rgba(220,255,240,0.55)" stroke="rgba(255,255,255,0.9)" strokeWidth={0.5} transform={`rotate(-30 22 ${top + 8})`} />
              <ellipse cx={38} cy={top + 8} rx={8} ry={4} fill="rgba(220,255,240,0.55)" stroke="rgba(255,255,255,0.9)" strokeWidth={0.5} transform={`rotate(30 38 ${top + 8})`} />
            </g>
          )}
          {has(sp, "wings") && sp.plan !== "sprite" && (
            <g className="cr-wing">
              <path d={sp.plan === "angel" ? `M26 ${top + 8} Q8 ${top - 4} 6 ${top + 18} Q16 ${top + 12} 26 ${top + 16} Z M34 ${top + 8} Q52 ${top - 4} 54 ${top + 18} Q44 ${top + 12} 34 ${top + 16} Z` : `M26 ${top + 8} L12 ${top - 2} L14 ${top + 8} L8 ${top + 10} L24 ${top + 16} Z M34 ${top + 8} L48 ${top - 2} L46 ${top + 8} L52 ${top + 10} L36 ${top + 16} Z`} fill={sp.plan === "angel" ? "#ffffff" : sp.c2} opacity={0.95} />
            </g>
          )}
          {has(sp, "spadetail") && <path className="cr-tail" d={`M27 ${top + 22} Q14 ${top + 26} 16 ${top + 16} l-3 -2 l5 0 l1 -4`} stroke={sp.c1} strokeWidth={1.6} fill="none" />}
          <path className="cr-leg a" d={`M27 ${top + 20} L26 48`} stroke={sp.c2} strokeWidth={tiny ? 2.4 : 3.4} strokeLinecap="round" />
          <path className="cr-leg b" d={`M33 ${top + 20} L34 48`} stroke={sp.c2} strokeWidth={tiny ? 2.4 : 3.4} strokeLinecap="round" />
          <rect className="cr-body" x={tiny ? 25 : 23} y={top + 6} width={tiny ? 10 : 14} height={tiny ? 15 : 18} rx={tiny ? 4 : 5} fill={sp.plan === "undead" && has(sp, "bones") ? "none" : sp.c1} stroke={has(sp, "bones") ? sp.c1 : "none"} strokeWidth={1.2} />
          {has(sp, "bones") && <path d={`M30 ${top + 7} v16 M25 ${top + 11} h10 M25 ${top + 15} h10 M26 ${top + 19} h8`} stroke={sp.c1} strokeWidth={1.4} />}
          {has(sp, "wraps") && <path d={`M23 ${top + 10} l14 3 M23 ${top + 15} l14 -2 M23 ${top + 20} l14 2`} stroke={sp.c2} strokeWidth={1} />}
          <g className="cr-arm l">
            <path d={has(sp, "arms") ? `M24 ${top + 10} L14 ${top + 12}` : `M24 ${top + 10} L19 ${top + 20}`} stroke={sp.c1} strokeWidth={tiny ? 2 : 3} strokeLinecap="round" />
          </g>
          <g className="cr-arm r">
            <path d={has(sp, "arms") ? `M36 ${top + 10} L46 ${top + 12}` : `M36 ${top + 10} L41 ${top + 20}`} stroke={sp.c1} strokeWidth={tiny ? 2 : 3} strokeLinecap="round" />
            {has(sp, "bow") && <path d={`M43 ${top + 12} Q48 ${top + 20} 43 ${top + 28}`} stroke="#c8a060" strokeWidth={1.2} fill="none" />}
            {has(sp, "shield") && <path d={`M40 ${top + 12} h8 v6 q-4 5 -8 0 Z`} fill="#ffd86a" stroke="#c8a03a" strokeWidth={0.6} />}
          </g>
          <circle className="cr-trick-flame" cx={46} cy={top + 6} r={2.6} fill="#ffb03a" opacity={0} />
          <g className="cr-head">
            {has(sp, "halo") && <ellipse className="cr-halo" cx={30} cy={top - 6} rx={6} ry={1.8} fill="none" stroke="#ffe08a" strokeWidth={1.2} />}
            <circle cx={30} cy={top} r={tiny ? 6 : 7} fill={sp.plan === "undead" && has(sp, "bones") ? sp.c1 : sp.c1} />
            {has(sp, "horns") && <path d={`M25 ${top - 4} q-3 -5 1 -8 q0 4 2 6 Z M35 ${top - 4} q3 -5 -1 -8 q0 4 -2 6 Z`} fill={sp.plan === "imp" || sp.plan === "fiend" ? "#2a1a14" : "#e8e0c8"} />}
            {sp.plan === "sprite" && <path d={`M26 ${top - 5} q4 -4 8 0`} stroke={sp.c2} strokeWidth={1.4} fill="none" />}
            {has(sp, "bones") && <path d={`M27 ${top + 4} h6`} stroke="#3a3a3a" strokeWidth={0.8} strokeDasharray="1 1" />}
            <Eyes x={30} y={top - 0.5} gap={tiny ? 4 : 5} r={tiny ? 1 : 1.2} color={sp.eye ?? "#222"} />
          </g>
        </>
      );
    }
    case "drake":
      return (
        <>
          <path className="cr-tail" d="M16 38 Q4 36 6 26 Q8 22 11 24" stroke={sp.c1} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <path className="cr-wing" d="M24 32 L18 14 L28 22 L32 12 L34 26 Z" fill={sp.c2} stroke={sp.c1} strokeWidth={0.8} />
          <path className="cr-leg a" d="M22 40 v8 M36 40 v8" stroke={sp.c1} strokeWidth={3.2} strokeLinecap="round" />
          <ellipse className="cr-body" cx={29} cy={37} rx={12} ry={7.5} fill={sp.c1} />
          <path d="M22 40 Q29 45 36 40" stroke={sp.c2} strokeWidth={2.4} fill="none" />
          <g className="cr-head">
            <path d="M38 32 Q44 22 50 24 L56 28 L50 31 Q45 33 40 36 Z" fill={sp.c1} />
            {has(sp, "horns") && <path d="M45 24 l-3 -6 l5 4 Z M49 24 l1 -6 l2 6 Z" fill={sp.c2} />}
            <Eyes x={49} y={26.5} one r={1.2} color={sp.eye ?? "#222"} />
          </g>
          <circle className="cr-trick-flame" cx={56} cy={28} r={2.4} fill={sp.c2} opacity={0} />
        </>
      );
    case "blob":
      return (
        <>
          {has(sp, "smoke") && [16, 30, 44].map((x) => <circle key={x} className="cr-smoke" cx={x} cy={44} r={5} fill={sp.c2} opacity={0.4} />)}
          {has(sp, "eyestalks") && [18, 26, 34, 42].map((x, i) => <g key={x} className={`cr-stalk s${i}`}><path d={`M30 26 Q${x} 18 ${x} 10`} stroke={sp.c1} strokeWidth={1.6} fill="none" /><circle cx={x} cy={9} r={2.2} fill="#fff" /><circle cx={x} cy={9} r={1} fill="#222" /></g>)}
          {has(sp, "star") ? (
            <path className="cr-body" d="M30 18 L34 30 L46 30 L36 37 L40 48 L30 41 L20 48 L24 37 L14 30 L26 30 Z" fill={sp.c1} stroke={sp.c2} strokeWidth={1} />
          ) : (
            <path className="cr-body" d={has(sp, "ghost") ? "M18 48 L18 30 Q18 16 30 16 Q42 16 42 30 L42 48 L38 44 L34 48 L30 44 L26 48 L22 44 Z" : "M14 48 Q12 26 30 22 Q48 26 46 48 Z"} fill={sp.c1} opacity={has(sp, "ghost") ? 0.85 : 1} />
          )}
          {has(sp, "leafy") && <path d="M22 24 q-6 -8 2 -10 q2 6 -2 10 M38 24 q6 -8 -2 -10 q-2 6 2 10" fill={sp.c2} />}
          <g className="cr-head">
            {has(sp, "bigeye") || has(sp, "eyestalks") ? <Eyes x={30} y={34} one r={has(sp, "eyestalks") ? 4 : 3} color={sp.eye ?? "#222"} /> : <Eyes x={30} y={has(sp, "star") ? 33 : 32} gap={8} r={has(sp, "bigeyes") ? 2 : 1.4} color={sp.eye ?? "#fff"} />}
          </g>
        </>
      );
    case "construct": {
      const round = has(sp, "round");
      return (
        <>
          <path className="cr-leg a" d="M23 40 v8 M37 40 v8" stroke={sp.c1} strokeWidth={4} />
          {round ? <ellipse className="cr-body" cx={30} cy={32} rx={13} ry={11} fill={sp.c1} /> : <rect className="cr-body" x={17} y={20} width={26} height={22} rx={has(sp, "rock") ? 6 : 2} fill={sp.c1} />}
          {has(sp, "rivets") && [20, 40].flatMap((x) => [24, 38].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill={sp.c2} />))}
          {has(sp, "rock") && <path d="M20 28 l6 4 l-2 6 M38 24 l-4 6 l4 4" stroke={sp.c2} strokeWidth={0.8} fill="none" />}
          {has(sp, "cube") && <path d="M17 20 l5 -5 h26 l-5 5 M43 20 l5 -5 v22 l-5 5" fill={sp.c2} stroke={sp.c1} strokeWidth={0.6} />}
          <g className="cr-head">
            <rect x={23} y={27} width={14} height={5} rx={2.5} fill="#1a1a1e" />
            <Eyes x={30} y={29.5} gap={7} r={1.1} color={sp.eye ?? "#5affd2"} />
          </g>
        </>
      );
    }
    case "flame":
      return (
        <>
          <g className="cr-body cr-flicker">
            {has(sp, "drop") ? (
              <path d="M30 12 Q44 30 42 38 Q40 48 30 48 Q20 48 18 38 Q16 30 30 12 Z" fill={sp.c1} opacity={0.9} />
            ) : has(sp, "swirl") ? (
              <path d="M30 46 Q16 44 18 34 Q20 26 30 28 Q38 30 36 36 Q34 40 30 38 M30 22 Q44 22 44 12" stroke={sp.c1} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.9} />
            ) : (
              <>
                <path d="M30 10 Q40 24 42 34 Q44 48 30 48 Q16 48 18 34 Q20 26 26 20 Q26 30 30 30 Q28 20 30 10 Z" fill={sp.c1} />
                <path d="M30 24 Q36 34 36 40 Q36 46 30 46 Q24 46 24 40 Q24 34 30 24 Z" fill={sp.c2} />
              </>
            )}
          </g>
          <g className="cr-head">
            <Eyes x={30} y={38} gap={6} r={1.2} color={sp.eye ?? "#fff"} />
          </g>
        </>
      );
  }
}

/** The creature, sitting on the edge of its row and keeping busy. Down at 0 hit points. */
export function Critter({ spec, down, label, seed = 0 }: { spec: CritterSpec; down?: boolean; label: string; seed?: number }) {
  const size = has(spec, "huge") ? 1.35 : has(spec, "big") ? 1.15 : has(spec, "tiny") ? 0.75 : has(spec, "small") ? 0.88 : 1;
  return (
    <span
      className={`critter cr-${spec.plan}${spec.trick ? ` tr-${spec.trick}` : ""}${has(spec, "glow") ? " cr-glow" : ""}${down ? " down" : ""}`}
      style={{ ["--cr-scale" as string]: String(size), ["--cr-delay" as string]: `${-((seed * 1.7) % 9)}s` }}
      role="img"
      aria-label={down ? `${label}, down` : label}
    >
      <svg viewBox="0 0 60 48" aria-hidden="true">
        {body(spec)}
      </svg>
    </span>
  );
}
