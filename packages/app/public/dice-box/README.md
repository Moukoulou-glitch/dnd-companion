# dice-box (vendored)

@3d-dice/dice-box 1.1.4 by Frank Ali, MIT licence (LICENSE.txt), copied from the npm package's `dist` folder:
the minified module, its three world builds, the dice physics (`Dice.min.js`, `assets/ammo`) and the default theme (`assets/themes/default`).

The app loads it with a plain dynamic import (`src/diceBox.ts`) only when 3D dice are switched on; it isn't
bundled or precached. To update: `npm pack @3d-dice/dice-box`, copy the same files from `package/dist`.
