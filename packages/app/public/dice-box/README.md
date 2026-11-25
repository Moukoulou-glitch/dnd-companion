# dice-box (vendored)

@3d-dice/dice-box 1.1.4 by Frank Ali, MIT licence (LICENSE.txt), copied from the npm package's `dist` folder:
the minified module, its three world builds, the dice physics (`Dice.min.js`, `assets/ammo`) and the default theme (`assets/themes/default`).

The app loads it with a plain dynamic import (`src/diceBox.ts`) only when 3D dice are switched on; it isn't
bundled or precached. To update: `npm pack @3d-dice/dice-box`, copy the same files from `package/dist`.

## Local patch (dnd-companion)

`world.offscreen.min.js` (its worker, kept base64 inside the file) and `world.onscreen.min.js` carry one addition:
`__dndForce`, called in `handleAsleep` after the die's face is read. A die rolled with `data: { i, want }` turns
(a short slerp) to the face showing `want` once it has settled, and reports that value. The app uses it for dice
that count as their maximum (Beacon of Hope, Overchannel), so the die shows what counts. Re-apply it after an update.
The service worker's cache for these files is named in `vite.config.ts` (`dice-box-2`): change it whenever they change.

Patch 2 (25a): in the worker's `initScene`, the OffscreenCanvas is kept as `self.__dndCanvas` and its
`webglcontextlost` / `webglcontextrestored` events are posted to the page as `{ action: "dnd-context-lost" }` /
`"dnd-context-restored"` (dice-box ignores unknown actions). `src/diceBox.ts` watches the box's workers and
rebuilds the box on the next throw when the context is lost. Cache name now `dice-box-3`.
