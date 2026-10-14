# Effects and haptics

The effects are decoration only. Each one follows a confirmed change or result and never changes the game: rolls, HP, resources and conditions are decided by the engine and the store before any effect plays.

## How it works

- **Triggers:** `packages/app/src/fx/triggers.ts`. These are pure functions with no rules and no state changes.
  - `opFx(type, payload, before, after)` compares the character before and after a recorded operation.
  - `rollFx(record)` reads a saved roll.
- **Signals:** each one fires once per live action. None fires on load, replay, undo, re-render or reopening a sheet.
  - `dnd-op` comes from `useCharacters.act`.
  - `dnd-roll` comes from `useCharacters.addRoll`.
  - `dnd-fx` comes from `playFx()`. It is only used for the concentration save, whose result is a roll, not an operation.
- **Drawing:** `packages/app/src/fx/FxLayer.tsx`.
  - `specOf()` gives each effect where it is drawn, how long it lasts, its look (a CSS class) and its vibration pattern.
  - The pieces are reusable: core flash, ripple ring, dots, cracks, arcane circle, slash, star and edge vignette. Their CSS is in `styles.css` under "Effects".
  - The layer is `pointer-events: none` and `aria-hidden`. Each effect has a short text label, so colour is never the only signal. At most six effects are on screen at once.
- **Existing effects, unchanged:** `components/Fx.tsx` (Channel Divinity glow, Rage veins, the grey veil for Exhaustion and death), `vibrate.ts` (HP thresholds), `flash.ts` (opt-in flashlight) and the HP box blinking at 10% or less.

## Implemented

| | Effect | Trigger | Where | Length | Haptic |
|---|---|---|---|---|---|
| A | Critical hit: white-gold flash, ripple, sparks | Attack roll whose own result is a crit (natural 20, or a feature's crit range) | The roll's total | 520 ms | two short pulses |
| B | Natural 1: dark red distortion, cracks | Attack roll with a natural 1 (cosmetic only) | The roll's total | 420 ms | one short pulse |
| C | Healing: emerald and gold wave, "+N HP"; the HP bar slides | HP that actually went up (capped). Setting HP by hand and levelling don't count | HP box | 700 ms | — |
| C | Temp HP: pale blue shimmer, "+N temp" | Temporary HP that actually went up | HP box | 650 ms | — |
| D | Spellcasting: arcane circle and ripple; colour by school for evocation, abjuration, necromancy and conjuration (from the spell's definition) | A recorded cast | Where you tapped | 700 ms | — |
| E | Shield ring: solid for "Blocked", dashed for "N less", filled for "Temp HP took N" | Damage that didn't all get through: immunity, resistance, Heavy Armor Master, temp HP, Durable's Hit Die | HP box | 600 ms | — |
| F | Sneak Attack: violet-black slash with afterimage | Sneak Attack dice in a rolled damage | The roll's total | 450 ms | — |
| G | Concentration "held" (steady glow) or "lost" (cracks) | The Constitution save's result after damage | Concentration chip | 600 ms | — |
| H | Crimson edge heartbeat: silver for a success, deeper red for a failure, distinct on the third | A death save recorded at 0 HP. A natural 20 plays healing instead | Screen edges | 650–800 ms | — (the existing HP patterns stay) |
| I | Golden star with rising motes (gained), or flare and dissolve (spent) | Inspiration count that actually changed | Where you swiped | 650 ms | — |
| J | Slow golden rings and "Level N" growing | A confirmed level-up | Middle of the screen | 1 s | short triple |

## Damage types, charm and transformations

- **Data:** `packages/app/src/fx/looks.ts`. It holds looks only, no rules.
  - `DAMAGE_FX`: a colour, a drawn piece and a name for each of the 13 damage types.
  - `CHARM_SPELLS`: the spells that charm.
  - `FORM_FX`: transformation looks, keyed by the state (toggle) the feature turns on in the content.
- **Damage type on a damage roll:** the type with the most damage in the roll plays at the roll's total, with its name. If you entered your own dice's total, the roll's first type plays. Nothing plays when a spell's own look or Sneak Attack already does.
- **Damage you take:** typed damage that all got through plays its type at the HP box ("−7 fire"). When some was stopped, the shield ring plays instead, as before. Untyped damage plays nothing, as before.
- **Looks:**

  | Type | Look |
  |---|---|
  | fire | embers rising |
  | cold | frost shards and a dotted rim |
  | lightning | a jagged bolt |
  | thunder | rings pushing out |
  | acid | drops falling |
  | poison | slow cloud puffs |
  | necrotic | dark wisps drawn in |
  | radiant | golden rays |
  | psychic | rings pressing in |
  | force | one crisp ring |
  | slashing | a cut |
  | piercing | a thrust |
  | bludgeoning | an impact |
- **Charm:**
  - Casting a spell that charms (Charm Person, Charm Monster, Animal Friendship, the Dominate spells, Hypnotic Pattern, Geas, Modify Memory) draws a rose-violet spiral in where you tapped.
  - While you concentrate on one, a faint rose shimmer sits at the bottom edge.
  - The Charmed condition landing on you plays a rose haze at the edges and a slow spiral, labelled "Charmed". It plays once, not again while it's there, and nothing plays when it ends.
- **Transformations:**
  - **Necrotic Shroud:** darkness and a violet glow close in from the edges, and faint skeletal wings draw at the sides.
  - **Form of Dread:** a cold, deathly pallor washes out from the middle, with tatters of shadow rising.
  - Each plays once, when the feature's state turns on (however it was turned on). A quiet loop stays at the edges while the state is on, and it ends with the state (the duration running out, a rest, switching it off). A reload keeps the loop but doesn't replay the start.

## Nature spells

- **Where:** they grow up from the ground (just above the tabs) toward where you tapped, at least a third of the screen high. The placement is called "ground" in `fx/spells.ts`.
- **Spells:**
  - **Thorn Whip:** a thorny vine whips up and snaps away. Its damage plays a sting of thorns.
  - **Entangle:** weeds and vines spring up and twist. While it lasts, a low tangle sits above the tabs.
  - **Spike Growth:** a row of spikes rises, rippling out from the middle. Its damage (from the concentration chip) is a sting of thorns. While it lasts, a low band of spikes sits above the tabs.
  - **Grasping Vine:** one thick vine rises with a curling tip, and a small curled vine sways at the bottom-left while it lasts. It deals no damage, so its later lashes have nothing to follow.
  - **Maximilian's Earthen Grasp:** the ground cracks, and a hand of earth rises and closes into a fist. Each crush squeezes, right after casting and later from the chip. While it lasts, a band of earth sits above the tabs.
- **Placeholders:** Grasping Vine and Maximilian's Earthen Grasp are in `content/packs/table-2014/spells-placeholder.json`, in our own words with no book text. A book file adds the full text.

## Spells by phase and unarmed strikes

- **Registry:** `packages/app/src/fx/spells.ts` (`SPELL_FX`) is keyed by spell id. It holds looks only, no mechanics. Each spell can have a look for up to four phases:
  - **cast:** the castSpell operation is recorded.
  - **again:** the spell's damage is rolled from the concentration chip. This is a later use while it lasts.
  - **resolve:** its damage is rolled right after casting.
  - **ongoing:** a quiet loop while the engine says you're concentrating on it.

  A phase with no look plays nothing, so a lasting spell never replays its whole cast. Rolls carry `spell` and `again` (`RollRecord`).
- **Moonbeam:** the cast shows a glyph and a column of moonlight coming down. Its damage plays a silver pulse, both right after casting and on later turns. While it lasts, a soft shimmer sits at the right edge.
- **Call Lightning:** the cast gathers the storm and drops a big bolt. Each later bolt (from the chip) is short and comes from the storm that's already there. A faint cloud band sits at the top while it lasts.
- **Gust of Wind:** the cast sends a pressure wave across the screen. While it lasts, a faint stream of streaks drifts across the lower part.
- **Ongoing loops:** they appear and go with concentration (a 400 ms fade when it ends). They pause while the app is in the background and stand still under reduced motion.
- **Unarmed strikes:** they play from the player's call on the attack (Hit, Critical damage or Miss). A hit shows speed lines closing in plus a small shockwave. A crit shows a bigger one with sparks. A miss shows only a trail of air. Unarmed strikes are recognised by attack id: `martial-arts*`, `tavern-unarmed` and `unarmed-*`.
- **Ice Storm:** frost at the screen's edges, hail coming down, then one wide icy wave. It plays on the cast only; its damage roll doesn't replay it.
- **Control Water:** casting asks what the water does: Flood (water rises), Part Water (it separates), Redirect Flow (the current bends) or Whirlpool (it spirals in). The pick becomes the spell's tag. With no mode, or one the effects don't know, a neutral ripple plays instead of a guess. While it lasts, a faint line of water sits at the bottom edge.
- **Control Weather:** casting asks which weather you're bringing: clear skies, rain, snow, wind or storm. The cast is slower (1.4 s), with cloud layers and changing light. Afterwards only a faint sky in that tone stays at the top, because the weather changes in stages, not at once.
- **Flurry of Blows:** three afterimages when its ki is spent. Each strike's impact plays only when you call it a hit.
- **Way of Mercy:**
  - Hand of Healing: jade and ivory motes drawn in, then a gentle pulse. It plays when the feature is used.
  - Hand of Harm: violet energy round a spectral hand that snaps in. It plays when its ki is spent on a damage roll. In a Flurry at 11th level, Hand of Harm costs no ki, so it has no use to follow and plays nothing.
- **Reckless Attack:** a short red streak when it's ticked on an attack roll, and a small red impact only when that attack is called a hit. It never replays Rage's veins, and it shows nothing extra on damage. It's recognised by its option label, "Reckless Attack", as the content names it.
- **What the app doesn't track, so no effect can follow it:**
  - where Moonbeam's beam is, or that it moved;
  - Gust of Wind's direction, or its bonus-action change of direction;

## Device-dependent

- **Vibration:** Android browsers only (iPhones don't allow it). It never repeats, because one event gives one pattern.
- **Flashlight:** only Sacred Weapon uses it, and only when switched on. No effect asks for the camera.
- **Reduced motion** (`prefers-reduced-motion: reduce`): nothing moves or scales. A static tint and the label fade over 450 ms, particles and cracks are hidden, and the HP bar doesn't slide.

## Testing

- `packages/app/test/fx6.test.ts` covers the two placeholders (including Grasping Vine on the Nature domain's list), each nature spell's ground look, their damage looks, and the band following concentration.
- `packages/app/test/fx5.test.ts` covers damage types (main type, own dice, priority), typed damage taken, charm spells and the Charmed condition, and both transformations with their loops.
- `packages/app/test/fx.test.ts` also covers casting versus later uses, the ongoing loop following concentration, and unarmed hit, crit and miss.
- `packages/app/test/fx.test.ts` runs real operations through the store and checks the triggers:
  - crit and natural 1 only on attack rolls;
  - Sneak Attack only with its dice;
  - healing capped, and nothing when HP didn't change;
  - blocked, reduced and absorbed damage;
  - death-save ticks and the final one;
  - Inspiration gained and spent;
  - level-up;
  - spell schools.
- **By hand:**
  - Roll an attack with your own dice and enter 20 or 1.
  - Heal or take damage on the HP box, with a resistance set under Sheet → Defenses.
  - Swipe Inspiration on Play.
  - Make death saves at 0 HP.
  - Level up.
  - Turn on "reduce motion" in the phone's settings to see the static versions.
