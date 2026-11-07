import { useId, type ReactNode } from "react";
import { CLASS_COLOURS, type ClassKey } from "../fx/features";
import { CrestSigil, type CrestSpec } from "../fx/crest";

/**
 * A character's token on the Characters page: a disc in its main class's colours with that class's mark,
 * a ring patterned by its subclass, a second class as a small coin at the top, and its race's mark (the
 * race crest's emblem) at the bottom.
 */
export interface TokenClass {
  key: string;
  level: number;
  subclass?: string;
}

/** A simple mark per class, drawn on a 24×24 grid. */
const CLASS_MARKS: Record<string, ReactNode> = {
  barbarian: <path d="M7 19 L16 6 M12 5 Q20 6 19 13 Q16 10 13 9 Z" stroke="#fff" strokeWidth={2} fill="#fff" strokeLinecap="round" strokeLinejoin="round" />,
  bard: <path d="M9 17 a2.6 2.6 0 1 1 -0.1 0 Z M11.5 16.5 V5 L18 4 V8 L11.5 9" stroke="#fff" strokeWidth={2} fill="#fff" strokeLinejoin="round" />,
  cleric: <path d="M12 4 V20 M6 9 H18" stroke="#fff" strokeWidth={3} strokeLinecap="round" />,
  druid: <path d="M12 20 V11 M12 11 C6 11 5 6 6 4 C11 4 13 7 12 11 Z M12 13 C16 13 18 10 18 7 C15 7 12 9 12 13 Z" stroke="#fff" strokeWidth={1.6} fill="#fff" strokeLinejoin="round" />,
  fighter: <path d="M12 3 L14 6 V15 H10 V6 Z M7 15 H17 M12 15 V20" stroke="#fff" strokeWidth={2} fill="#fff" strokeLinejoin="round" strokeLinecap="round" />,
  monk: <path d="M12 4 a8 8 0 0 1 0 16 a4 4 0 0 1 0 -8 a4 4 0 0 0 0 -8 Z" fill="#fff" />,
  paladin: <path d="M12 3 L19 6 V11 C19 16 15 19 12 21 C9 19 5 16 5 11 V6 Z" fill="#fff" />,
  ranger: <path d="M6 18 C14 16 16 10 18 6 M5 5 L19 19 M16 19 H19 V16" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  rogue: <path d="M15 3 L17 5 L9 15 L7 13 Z M6 14 L10 18 M5 19 L8 16" stroke="#fff" strokeWidth={2} fill="#fff" strokeLinecap="round" strokeLinejoin="round" />,
  sorcerer: <path d="M12 3 C14 8 18 9 16 14 C15 18 12 20 12 20 C12 20 7 18 7 14 C7 11 10 10 10 7 C12 9 13 11 12 13 C14 11 13 7 12 3 Z" fill="#fff" />,
  warlock: <path d="M3 12 C7 6 17 6 21 12 C17 18 7 18 3 12 Z M12 9 a3 3 0 1 1 -0.1 0 Z" fill="#fff" fillRule="evenodd" />,
  wizard: <path d="M12 3 L13.8 9.5 L20 9.5 L15 13.4 L17 20 L12 16 L7 20 L9 13.4 L4 9.5 L10.2 9.5 Z" fill="#fff" />,
  artificer: <path d="M12 7 a5 5 0 1 1 -0.1 0 Z M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M7 17 L5 19" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" />,
};

/** A subclass's own pattern on the ring: its hue and number of segments come from its id, so each one looks different. */
export function subclassPattern(id: string | undefined): { hue: number; segments: number } | undefined {
  if (!id) return undefined;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return { hue: n % 360, segments: 3 + (Math.floor(n / 360) % 6) };
}

const rgb = (k: string, second = false) => {
  const c = CLASS_COLOURS[(k in CLASS_COLOURS ? k : "other") as ClassKey];
  return `rgb(${second ? c.rgb2 : c.rgb})`;
};

export function CharacterToken({ classes, race, size = 44 }: { classes: TokenClass[]; race?: CrestSpec; size?: number }) {
  const sorted = [...classes].sort((a, b) => b.level - a.level);
  const main = sorted[0];
  const second = sorted[1];
  const key = main?.key ?? "other";
  const pat = subclassPattern(main?.subclass);
  const r = 15.5;
  const circ = 2 * Math.PI * r;
  const gid = `tok-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className="char-token" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={gid} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={rgb(key, true)} />
            <stop offset="65%" stopColor={rgb(key)} />
            <stop offset="100%" stopColor="#1a1f2b" />
          </radialGradient>
        </defs>
        <circle cx={20} cy={20} r={14} fill={`url(#${gid})`} />
        {/* The subclass's ring: a hue and a number of segments of its own; a plain ring with none yet. */}
        <circle
          cx={20}
          cy={20}
          r={r}
          fill="none"
          stroke={pat ? `hsl(${pat.hue} 70% 62%)` : "var(--line)"}
          strokeWidth={2.6}
          {...(pat ? { strokeDasharray: `${(circ / pat.segments) * 0.72} ${(circ / pat.segments) * 0.28}` } : {})}
          transform="rotate(-90 20 20)"
        />
        <g transform="translate(9 9) scale(0.9166)" opacity={0.95}>
          {CLASS_MARKS[key] ?? <circle cx={12} cy={12} r={5} fill="#fff" />}
        </g>
        {/* A second class: a small coin in its colours at the top right. */}
        {second && (
          <g>
            <circle cx={33} cy={7} r={5.5} fill={rgb(second.key)} stroke="#11161f" strokeWidth={1.5} />
            <g transform="translate(29.6 3.6) scale(0.285)">{CLASS_MARKS[second.key]}</g>
          </g>
        )}
      </svg>
      {/* The race's mark (its crest's emblem) on a small disc at the bottom right. */}
      {race && (
        <span className="char-token-race">
          <CrestSigil spec={race} />
        </span>
      )}
    </span>
  );
}
