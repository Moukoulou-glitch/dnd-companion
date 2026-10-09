import { useEffect, useState } from "react";
import type { Character } from "@dnd/schema";

/** Glows the feature's name in gold wherever it is on screen (Channel Divinity used). */
export function glowFeature(name: string) {
  const els = document.querySelectorAll<HTMLElement>(`[data-feature-name="${CSS.escape(name)}"]`);
  els.forEach((el) => {
    el.classList.remove("cd-glow");
    void el.offsetWidth; // restart the animation
    el.classList.add("cd-glow");
    setTimeout(() => el.classList.remove("cd-glow"), 700);
  });
}

/** Veins from the edges of the screen toward the middle: red, half see-through, about half a second. */
const VEINS = [
  "M0,120 C60,140 90,180 150,190 S220,230 260,260",
  "M0,420 C70,410 100,380 160,390 S230,360 270,380",
  "M0,700 C60,680 120,690 150,640 S210,600 250,560",
  "M390,90 C330,120 310,170 260,180 S200,220 170,250",
  "M390,380 C330,390 300,420 250,410 S190,440 150,430",
  "M390,760 C340,720 300,730 270,680 S230,620 210,590",
  "M120,0 C130,60 170,90 160,140 S190,200 180,240",
  "M280,0 C270,50 240,80 250,130 S220,180 230,220",
  "M100,844 C120,790 160,770 160,720 S190,660 200,630",
  "M300,844 C280,800 250,780 255,730 S230,680 215,650",
  // Little branches off the main veins.
  "M90,170 C105,150 120,150 130,135",
  "M110,395 C120,370 140,365 150,350",
  "M330,135 C320,110 330,95 320,75",
  "M300,405 C310,430 300,450 310,470",
  "M160,95 C185,100 195,90 215,95",
  "M150,790 C170,780 175,760 195,755",
  "M60,690 C70,720 90,725 95,745",
  "M340,730 C320,745 315,770 300,775",
];

export function RageVeins({ show }: { show: number }) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (!show) return;
    setOn(show);
    const t = setTimeout(() => setOn(0), 650);
    return () => clearTimeout(t);
  }, [show]);
  if (!on) return null;
  return (
    <svg key={on} className="rage-veins" viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="rage-edge" cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="rgba(150,0,10,0)" />
          <stop offset="100%" stopColor="rgba(150,0,10,0.45)" />
        </radialGradient>
      </defs>
      <rect className="rage-edge" x="0" y="0" width="390" height="844" fill="url(#rage-edge)" />
      {VEINS.map((d, i) => (
        <path key={i} d={d} pathLength={1} className={i >= 10 ? "branch" : ""} style={{ animationDelay: `${i >= 10 ? 140 : (i % 4) * 25}ms` }} />
      ))}
    </svg>
  );
}

/** Listens to every change and plays the flourishes. */
export function useFlourishes(onRage: () => void, actionName: (id: string) => string | undefined) {
  useEffect(() => {
    const h = (e: Event) => {
      const { type, payload, before, after } = (e as CustomEvent<{ type: string; payload: { action?: string; name?: string; on?: boolean }; before: Character; after: Character }>).detail;
      const cd = (c: Character) => Object.entries(c.resourcesUsed).filter(([k]) => k.startsWith("channel-divinity")).reduce((t, [, v]) => t + (v ?? 0), 0);
      if (type === "useAction" && payload.action && cd(after) > cd(before)) {
        const name = actionName(payload.action);
        if (name) requestAnimationFrame(() => glowFeature(name));
      }
      if (!before.toggles.includes("raging") && after.toggles.includes("raging")) onRage();
    };
    window.addEventListener("dnd-op", h);
    return () => window.removeEventListener("dnd-op", h);
  }, [onRage, actionName]);
}

/** How grey the app turns: a sixth more for each level of Exhaustion; all of it at 6 or when dead. */
export function greyLevel(c: Character): number {
  const ex = c.effects.find((e) => e.effect === "condition:exhaustion")?.level ?? 0;
  if (c.deathSaves.failures >= 3 || ex >= 6) return 1;
  return Math.min(1, ex / 6);
}
