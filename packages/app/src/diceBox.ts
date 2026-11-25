import type { Thrower, ThrowOptions } from "./dice3d";
import type { DieLook } from "./dice/themes";
import { batches } from "./dice/plan";
import { diceMode, type DiceMode } from "./dice3dSetting";
import { isAppleTouch } from "./platform";

/**
 * The 3D dice themselves: @3d-dice/dice-box (MIT, packages/app/public/dice-box,
 * copied from its npm package with its licence). Nothing of it loads until the
 * player switches 3D dice on and throws: then its script, physics and theme
 * are fetched once (and kept for offline use by the service worker). It draws
 * in a worker on its own canvas (one WebGL context, reused for every throw),
 * so the page stays free while the dice roll.
 *
 * The dice are drawn over the whole screen, never take a tap, and clear away
 * a moment after they settle. Throws are one at a time (queued); a large roll
 * goes up in batches (dice/plan.ts). Each die's value is announced as it
 * settles (the "dnd-dice" event), for the result strip and the effects.
 */

export interface DieRoll {
  groupId: number;
  rollId: number;
  sides: number | string;
  value: number;
  /** What we tagged the die with: its place in the batch. */
  data?: unknown;
}
export interface Box {
  init(): Promise<unknown>;
  roll(notation: { qty: number; sides: number; data?: unknown; themeColor?: string; theme?: string }[]): Promise<DieRoll[]>;
  clear(): unknown;
  show(): unknown;
  hide(): unknown;
  updateConfig?(config: object): unknown;
}

/** What the result strip and the effects hear about a throw. */
export type DiceEvent =
  | { type: "start"; dice: { sides: number; look?: DieLook }[]; strong: boolean; crit?: boolean; mode: DiceMode }
  | { type: "die"; index: number; value: number }
  | { type: "end" }
  | { type: "skip" };

export const DICE_EVENT = "dnd-dice";
const emit = (e: DiceEvent) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DICE_EVENT, { detail: e }));
};

/** Skipped by the player: the app rolls instead. */
export class SkipError extends Error {
  constructor() {
    super("Skipped");
  }
}
/** This device can't draw 3D (no WebGL): the app rolls, at once. */
export class NoWebGLError extends Error {
  constructor() {
    super("No WebGL on this device");
  }
}

/** Physics per mode (dice-box's own settings, sent to its worker). A critical hit is thrown harder. */
export function physicsFor(mode: DiceMode, strong: boolean): Record<string, number | boolean> {
  const base = mode === "fast"
    ? { gravity: 3, linearDamping: 0.75, angularDamping: 0.75, throwForce: 4, spinForce: 4, startingHeight: 6, settleTimeout: 2500 }
    : { gravity: 1, linearDamping: 0.5, angularDamping: 0.4, throwForce: 5, spinForce: 6, startingHeight: 8, settleTimeout: 5000 };
  return { ...base, ...(strong ? { throwForce: base.throwForce * 1.6, spinForce: base.spinForce * 1.5 } : {}), enableShadows: mode === "full" };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`3D dice: ${what} took too long`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/**
 * A thrower over a dice box (the real one, or a stand-in in tests), with
 * the queue, the batches, the events and skipping. `container` is the element
 * shown while the dice roll (none in tests).
 */
export function createThrower(getBox: () => Promise<Box>, opts: { container?: () => HTMLElement | null; modeOf?: () => DiceMode; hideAfterMs?: number; onStuck?: () => void; keepShown?: () => boolean } = {}) {
  let queue: Promise<unknown> = Promise.resolve();
  let skipNow: (() => void) | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** The die values arriving from the box, tagged with their place in the current batch. */
  let onDie: ((d: { data?: unknown; value: number }) => void) | undefined;
  const hideAfter = opts.hideAfterMs ?? 1600;

  const one = async (sides: number[], looks: (DieLook | undefined)[] | undefined, options: ThrowOptions | undefined): Promise<number[]> => {
    // Skip works from the first moment, while the library is still loading too.
    let skipped = false;
    const skip = new Promise<never>((_, reject) => {
      skipNow = () => {
        skipped = true;
        reject(new SkipError());
      };
    });
    skip.catch(() => undefined);
    let box: Box;
    try {
      box = await Promise.race([withTimeout(getBox(), 20000, "loading"), skip]);
    } catch (e) {
      skipNow = undefined;
      throw e;
    }
    const mode = options?.quick ? "fast" : (opts.modeOf ?? diceMode)();
    const strong = !!options?.strong;
    if (hideTimer) clearTimeout(hideTimer);
    opts.container?.()?.classList.add("on");
    // While dice are in the air, lighter effects hide the ongoing loops (less for the GPU next to the dice's WebGL).
    if (typeof document !== "undefined") document.documentElement.classList.add("dice-air");
    box.show();
    const dice = sides.map((s, i) => ({ sides: s, i, look: looks?.[i] }));
    emit({ type: "start", dice: dice.map((d) => ({ sides: d.sides, ...(d.look ? { look: d.look } : {}) })), strong, ...(options?.crit ? { crit: true } : {}), mode });
    const faces: number[] = [];
    try {
      for (const [n, batch] of batches(dice, (d) => d.look?.id ?? d.look?.color).entries()) {
        // A big roll's later batches fall faster, so the whole roll doesn't drag.
        box.updateConfig?.({ ...physicsFor(n > 0 && mode === "full" ? "fast" : mode, strong && n === 0), enableShadows: mode === "full" });
        onDie = (d) => {
          const k = typeof d.data === "number" ? d.data : typeof d.data === "object" && d.data && "i" in d.data ? (d.data as { i: number }).i : undefined;
          const die = k !== undefined ? batch[k] : undefined;
          if (die) emit({ type: "die", index: die.i, value: d.value === 0 && die.sides === 10 ? 10 : d.value });
        };
        // Each die its own group, tagged with its place in this batch (dice-box hands the tag back as each one settles).
        // A die told what to show (Beacon of Hope's maximum) carries it to the patched dice world, which turns it to that face.
        const rolled = box.roll(batch.map((d, k) => ({ qty: 1, sides: d.sides, data: options?.wants?.[d.i] ? { i: k, want: options.wants[d.i] } : k, ...(d.look ? { themeColor: d.look.color, theme: d.look.theme } : {}) })));
        const rolls = await Promise.race([withTimeout(rolled, 12000, "the throw"), skip]);
        // One group per die asked for, in order.
        faces.push(...[...rolls].sort((a, b) => a.groupId - b.groupId || a.rollId - b.rollId).map((r) => r.value));
      }
      emit({ type: "end" });
      return faces;
    } catch (e) {
      if (skipped) emit({ type: "skip" });
      // A throw that never finished: the box may be broken (a lost context), so the next one starts afresh.
      else opts.onStuck?.();
      throw e;
    } finally {
      onDie = undefined;
      skipNow = undefined;
      const clear = () => {
        opts.container?.()?.classList.remove("on");
        if (typeof document !== "undefined") document.documentElement.classList.remove("dice-air");
        box.clear();
        // Hidden between throws: nothing is drawn while no dice are out. Not on iPhones and iPads: a WebGL canvas
        // set to display:none there can come back blank (the dice roll unseen); the container's opacity hides it.
        if (!opts.keepShown?.()) box.hide();
      };
      if (skipped) clear();
      else hideTimer = setTimeout(clear, hideAfter);
    }
  };

  /** Throws these dice and returns each one's face, in the order asked. One throw at a time. */
  const throwDice: Thrower = (sides, looks, options) => {
    const run = queue.then(() => one(sides, looks, options));
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    throwDice,
    /** Stops the throw in the air (if any): its caller gets a SkipError and the app rolls. */
    skip: () => skipNow?.(),
    /** For the box's onDieComplete. */
    dieDone: (d: { data?: unknown; value: number }) => onDie?.(d),
  };
}

// --- The real box -------------------------------------------------------------

const ID = "dice-box-3d";
let loading: Promise<Box> | undefined;
let webgl: boolean | undefined;

/**
 * iPhones and iPads take a page's WebGL away when memory runs low or the app has
 * been in the background; the dice then roll unseen until a reload. The box is
 * marked stale when that happens (the patched world worker reports a lost
 * context; an onscreen canvas fires it itself; a long time in the background or
 * a throw that never finished count too) and is built afresh on the next throw:
 * its workers ended and its canvas removed, so nothing piles up.
 */
let stale = false;
/** The workers the box started (physics, and the world when it draws offscreen): ended when it's rebuilt. */
let workers: Worker[] = [];
/** How many times the box was rebuilt this session (for the settings line and tests). */
export let diceRebuilds = 0;
const BACKGROUND_MS = 60_000;

/** The dice are drawn afresh on the next throw. */
export function resetDiceBox(why = "by hand"): void {
  if (!loading) return;
  stale = true;
  if (typeof window !== "undefined") (window as unknown as { __dndDiceStale?: string }).__dndDiceStale = why;
}

function teardown(): void {
  for (const w of workers) {
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
  }
  workers = [];
  document.getElementById(ID)?.querySelectorAll("canvas").forEach((c) => c.remove());
  loading = undefined;
  stale = false;
  diceRebuilds++;
  (window as unknown as { __dndDiceRebuilds?: number }).__dndDiceRebuilds = diceRebuilds;
}

if (typeof document !== "undefined") {
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= BACKGROUND_MS) resetDiceBox("background");
  });
}

/** A canvas drawn on the page whose WebGL is still there (a worker's canvas can't be asked: true). */
function onscreenCanvasOk(c: HTMLCanvasElement): boolean {
  try {
    // The box's own context comes back for its own type; the other type gives null.
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    return !gl || !gl.isContextLost();
  } catch {
    // Handed to a worker (OffscreenCanvas): nothing to ask here.
    return true;
  }
}

/** Starts the box with `Worker` watched, so its workers can be ended later and the world's lost context heard. */
async function withWatchedWorkers<T>(start: () => Promise<T>): Promise<T> {
  const Original = window.Worker;
  const Watched = function (this: unknown, url: string | URL, options?: WorkerOptions) {
    const w = new Original(url, options);
    workers.push(w);
    w.addEventListener("message", (e: MessageEvent) => {
      const action = (e.data as { action?: string } | undefined)?.action;
      if (action === "dnd-context-lost") resetDiceBox("context lost");
    });
    return w;
  } as unknown as typeof Worker;
  Watched.prototype = Original.prototype;
  window.Worker = Watched;
  try {
    return await start();
  } finally {
    window.Worker = Original;
  }
}

/** Whether this device can draw WebGL at all (asked once). */
export function webglAvailable(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Loads the library the first time (only then); later calls get the same box. */
export function loadDiceBox(): Promise<Box> {
  if (!webglAvailable()) return Promise.reject(new NoWebGLError());
  // Drawing on the page (iPhones and iPads): a context lost since the last throw is seen here, before throwing unseen dice.
  if (loading && !stale) {
    const c = document.getElementById(ID)?.querySelector("canvas");
    if (c && !onscreenCanvasOk(c)) stale = true;
    // iPhones and iPads: a fresh drawing buffer before each throw (setting the width, even to the same value,
    // gives the canvas a new one), so a buffer Safari let go of while other effects ran is never the one shown.
    else if (c && isAppleTouch()) {
      try {
        const w = c.width;
        c.width = w;
      } catch {
        /* handed to a worker: nothing to do here */
      }
    }
  }
  if (stale && loading) teardown();
  loading ??= withWatchedWorkers(async () => {
    const base = import.meta.env.BASE_URL;
    // A plain URL, not bundled: the library stays out of the app until it's asked for.
    const mod = (await import(/* @vite-ignore */ `${base}dice-box/dice-box.es.min.js`)) as { default: new (config: object) => Box };
    let el = document.getElementById(ID);
    if (!el) {
      el = document.createElement("div");
      el.id = ID;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    const box = new mod.default({
      container: `#${ID}`,
      assetPath: `${base}dice-box/assets/`,
      theme: "default",
      themeColor: "#c8902e",
      scale: 6,
      // iPhones and iPads draw the dice on the page, not in a worker: Safari's offscreen WebGL is the one dropped
      // under memory pressure without a word, while a page canvas reports it (and can be checked before a throw).
      offscreen: !isAppleTouch(),
      settleTimeout: 6000,
      onDieComplete: (d: DieRoll) => real.dieDone(d),
    });
    await box.init();
    // Drawing on the page itself (no OffscreenCanvas): the canvas says when its context is lost.
    el.querySelector("canvas")?.addEventListener("webglcontextlost", () => resetDiceBox("context lost"));
    return box;
  }).catch((e: unknown) => {
    // A failed load can be tried again next time.
    loading = undefined;
    throw e;
  });
  return loading;
}

/** Whether the library has already been loaded this session (nothing is fetched to answer). */
export const diceBoxLoaded = () => loading !== undefined;

const real = createThrower(loadDiceBox, { container: () => document.getElementById(ID), onStuck: () => resetDiceBox("stuck throw"), keepShown: isAppleTouch });

/** Throws these dice and returns each one's face, in the order asked. */
export const throwDice: Thrower = real.throwDice;
/** The player skipped the throw in the air: the app rolls instead. */
export const skipThrow = () => real.skip();
