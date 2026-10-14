import type { Thrower } from "./dice3d";

/**
 * The 3D dice themselves: @3d-dice/dice-box (MIT, packages/app/public/dice-box,
 * copied from its npm package with its licence). Nothing of it loads until the
 * player switches 3D dice on and throws: then its script, physics and theme
 * are fetched once (and kept for offline use by the service worker).
 *
 * The dice are drawn over the whole screen, never take a tap, and clear away
 * a moment after they settle.
 */

interface DieRoll {
  groupId: number;
  rollId: number;
  sides: number | string;
  value: number;
}
interface Box {
  init(): Promise<unknown>;
  roll(notation: { qty: number; sides: number }[]): Promise<DieRoll[]>;
  clear(): unknown;
  show(): unknown;
  hide(): unknown;
}

const ID = "dice-box-3d";
let loading: Promise<Box> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`3D dice: ${what} took too long`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** Loads the library the first time (only then); later calls get the same box. */
export function loadDiceBox(): Promise<Box> {
  loading ??= (async () => {
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
      settleTimeout: 6000,
    });
    await box.init();
    return box;
  })().catch((e: unknown) => {
    // A failed load can be tried again next time.
    loading = undefined;
    throw e;
  });
  return loading;
}

/** Whether the library has already been loaded this session (nothing is fetched to answer). */
export const diceBoxLoaded = () => loading !== undefined;

/** Throws these dice and returns each one's face, in the order asked. */
export const throwDice: Thrower = async (sides) => {
  const box = await withTimeout(loadDiceBox(), 20000, "loading");
  if (hideTimer) clearTimeout(hideTimer);
  document.getElementById(ID)?.classList.add("on");
  box.show();
  const rolls = await withTimeout(box.roll(sides.map((s) => ({ qty: 1, sides: s }))), 12000, "the throw");
  // One group per die asked for, in order.
  const faces = [...rolls].sort((a, b) => a.groupId - b.groupId || a.rollId - b.rollId).map((r) => r.value);
  hideTimer = setTimeout(() => {
    document.getElementById(ID)?.classList.remove("on");
    box.clear();
  }, 1600);
  return faces;
};
