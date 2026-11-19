import type { ReactNode } from "react";
import type { RelicMotif, RelicShown } from "../fx/relics";

/** Each emblem's drawing (a 40×40 grid); its parts are animated in styles.css (.relic-<motif>). */
const ART: Record<RelicMotif, ReactNode> = {
  tome: (
    <>
      <path className="r-book" d="M8 10 L20 13 L32 10 L32 31 L20 34 L8 31 Z M20 13 V34" />
      <path className="r-cross" d="M20 17 V27 M15 22 H25" />
    </>
  ),
  vineyard: (
    <>
      <path className="r-vine" d="M6 30 C12 22 18 30 24 20 C28 13 34 14 35 8" />
      <g className="r-grapes">
        {[
          [20, 22],
          [24, 22],
          [22, 26],
          [26, 26],
          [24, 30],
          [18, 26],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.6} />
        ))}
      </g>
      <path className="r-leaf" d="M27 15 C31 10 36 12 35 16 C31 18 28 18 27 15 Z" />
    </>
  ),
  scribing: (
    <>
      <path className="r-arm" d="M6 26 C14 18 26 18 34 26" />
      {["ᚠ", "ᛟ", "ᚱ"].map((g, i) => (
        <text key={i} className={`r-rune n${i}`} x={11 + i * 8} y={20}>
          {g}
        </text>
      ))}
    </>
  ),
  winds: (
    <g className="r-swirl">
      <path d="M8 16 C16 10 28 12 30 18 C31 22 26 24 23 21" />
      <path d="M10 24 C18 20 30 24 32 28 C33 32 27 33 25 30" />
      <path d="M6 20 H20" />
    </g>
  ),
  werewolf: (
    <>
      <path className="r-wolf" d="M10 12 L15 18 L20 15 L25 18 L30 12 L29 22 C27 28 23 31 20 31 C17 31 13 28 11 22 Z" />
      <path className="r-chain" d="M4 34 C12 30 28 30 36 34" />
    </>
  ),
  pinecone: (
    <>
      <circle className="r-band" cx={20} cy={26} r={9} />
      <path className="r-cone" d="M20 6 C25 10 26 16 20 22 C14 16 15 10 20 6 Z M16.5 12 L23.5 12 M15.8 16 L24.2 16" />
      <circle className="r-gem" cx={20} cy={14} r={2.2} />
    </>
  ),
  lasthope: (
    <>
      <path className="r-flame" d="M20 34 C11 30 11 21 16 15 C16 20 19 21 20 18 C21 12 26 9 26 4 C33 12 31 28 20 34 Z" />
      <path className="r-wings" d="M20 22 C14 18 8 18 4 20 C9 22 13 24 18 26 M20 22 C26 18 32 18 36 20 C31 22 27 24 22 26" />
    </>
  ),
  feathertide: (
    <g className="r-feather">
      <path d="M12 34 C14 24 22 10 32 6 C30 16 24 26 14 32" />
      <path d="M12 34 L28 10" />
    </g>
  ),
  nightclaw: (
    <>
      <path className="r-claw" d="M10 8 L18 32 M18 6 L24 32 M26 8 L30 30" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} className={`r-snow n${i}`} cx={8 + i * 8} cy={6} r={1.3} />
      ))}
    </>
  ),
  cychron: (
    <>
      <path className="r-fur" d="M6 28 C12 20 28 20 34 28 C28 26 12 26 6 28 Z" />
      <path className="r-flake" d="M20 6 V18 M15 9 L25 15 M25 9 L15 15" />
    </>
  ),
  essence: (
    <>
      <path className="r-trunk" d="M20 34 V18 M20 22 L13 14 M20 20 L27 12 M20 26 L12 22 M20 25 L29 20" />
      <path className="r-roots" d="M20 34 L14 38 M20 34 L26 38 M20 34 V39" />
      {[
        [13, 14],
        [27, 12],
        [12, 22],
        [29, 20],
      ].map(([x, y], i) => (
        <circle key={i} className={`r-bud n${i}`} cx={x} cy={y} r={2} />
      ))}
    </>
  ),
  tinker: (
    <>
      <g className="r-cog a">
        <circle cx={15} cy={16} r={6} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x={14} y={8} width={2} height={3} transform={`rotate(${a} 15 16)`} />
        ))}
      </g>
      <g className="r-cog b">
        <circle cx={26} cy={26} r={5} />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x={25} y={19.5} width={2} height={3} transform={`rotate(${a} 26 26)`} />
        ))}
      </g>
    </>
  ),
  pearl: (
    <>
      <circle className="r-head" cx={20} cy={24} r={7} />
      <ellipse className="r-orbit" cx={20} cy={16} rx={13} ry={4} />
      <circle className="r-pearl" cx={33} cy={16} r={2.6} />
    </>
  ),
  // The Whistle of the Ashen Gale: a bone whistle bound in silver chain, its cap of worked silver, runes along it, a
  // dark feather hanging on a chain from the cap; ash drifts from its window, and the feather stirs in a wind no one feels.
  whistle: (
    <>
      <path className="r-bone" d="M7 30 L23 10 L28 14 L12 34 Z" />
      <path className="r-cap" d="M22 9 L25 6 L31 11 L28 14 Z" />
      <path className="r-window" d="M17 18 L19.5 15.5 L21.5 17.5 L19 20 Z" />
      <path className="r-runes" d="M11 29 l1.5 1.2 M13 26.5 l1.5 1.2 M15 24 l1.5 1.2 M23.5 13 l1.4 1.1" />
      <path className="r-binding" d="M9 28 L16 33 M12 24 L20 29 M16 19.5 L22 24 M19 15 L25 19" />
      <path className="r-hang" d="M30 10 C33 12 34 15 33 18" />
      <circle className="r-bead" cx={33} cy={19.5} r={1.6} />
      <g className="r-feather">
        <path d="M33 21 C36 25 36 31 33 37 C30 31 30 25 33 21 Z" />
        <path d="M33 22 V37" />
      </g>
      {[0, 1, 2].map((i) => (
        <circle key={i} className={`r-ash n${i}`} cx={18} cy={16} r={0.9} />
      ))}
    </>
  ),
  // The Battleaxe of Regina Lapsa: a crude bearded blade with a silvered edge and a back spike, black feathers
  // engraved on its face, a leather-wrapped haft with faded rune diamonds; light runs along the silver edge now and then.
  lapsa: (
    <>
      <path className="r-haft" d="M11 7 L33 35" />
      <path className="r-wrap" d="M15.5 12.5 L30.5 31.5" />
      <path className="r-wrap2" d="M16 13.1 L30 30.9" />
      <path className="r-runes" d="M18 14.8 l1.2 0.4 l0.4 1.2 l-1.2 -0.4 Z M22.6 20.6 l1.2 0.4 l0.4 1.2 l-1.2 -0.4 Z M27.2 26.4 l1.2 0.4 l0.4 1.2 l-1.2 -0.4 Z" />
      <path className="r-pommel" d="M31.5 33.5 L34.5 32.5 L35.5 36.5 L32 36.8 Z" />
      <path className="r-blade" d="M12.5 6.5 C9.5 3.8 6 2.6 3.2 3 C1.6 9.5 1.8 17.5 4.5 24.5 C6.4 19.5 9.6 15.2 14.6 11.6 Z" />
      <path className="r-spike" d="M14.6 7.6 C17.5 6.8 19.8 5 21 2.6 C20.6 6.6 18.7 9.4 15.8 10.6 Z" />
      <path className="r-collar" d="M11.2 6 L14.6 4.2 L16.6 7.4 L13.2 9.4 Z" />
      <circle className="r-knob" cx={11.4} cy={4.2} r={1.6} />
      <path className="r-feathers" d="M7.6 6.6 C6 10 6 14 7 17.5 M7 9.5 l-1.2 0.4 M6.7 12 l-1.3 0.4 M6.8 14.5 l-1.2 0.5 M10.4 9 C9 11.2 8.6 13.6 9 15.6" />
      <path className="r-edge" d="M3.2 3 C1.6 9.5 1.8 17.5 4.5 24.5" />
    </>
  ),
  unlocking: (
    <>
      <path className="r-lock" d="M12 18 V13 C12 6 28 6 28 13 V18" />
      <rect className="r-body" x={9} y={18} width={22} height={16} rx={3} />
      <path className="r-keyhole" d="M20 23 A2.4 2.4 0 1 1 19.99 23 M20 26 V30" />
    </>
  ),
};

/** The emblems of the homebrew items that are yours now (Play, under the effects): tap one to open it. */
export function RelicStrip({ relics, onOpen }: { relics: RelicShown[]; onOpen: (r: RelicShown) => void }) {
  if (!relics.length) return null;
  return (
    <div className="relic-strip" role="group" aria-label="Attuned items">
      {relics.map((r) => (
        <button key={r.key} className={`relic relic-${r.motif}${r.active ? " on" : ""}`} onClick={() => onOpen(r)} aria-label={r.name} title={r.name}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            {ART[r.motif]}
          </svg>
        </button>
      ))}
    </div>
  );
}
