# D&D 5e Player Companion

A rules-aware character sheet, roll composer and table tool for D&D 5e (2014 rules), built for one group's real games. Every number the app shows can be opened to see where it comes from, and the app warns but never blocks.

The full product spec is the "D&D 5e Player Companion — Phase 0 Specification" doc. This repository is the project's memory between work sessions: the code, the content packs, the reference characters and their tests.

## Layout

| Path | What it is |
| --- | --- |
| `packages/schema` | Zod schemas and types: characters, content definitions, modifiers, operations |
| `packages/engine` | The rules engine. `derive(character, content)` returns the whole sheet with a breakdown for every number. Pure TypeScript, no UI |
| `content/packs/table-2014` | The group's private pack, one file per area: `pack.json` is the header, the other files hold definitions (classes, races, feats, items, table rules). `feats-remastered.json` holds the table's own versions of the feats, which replace the book ones |
| `content/fixtures` | Reference characters from the table, used as test fixtures |

## Commands

```sh
npm install
npm test          # engine tests, including every reference character
npm run typecheck
```

## How the engine works

1. **Sources.** The engine walks the character and collects everything active on it: race, background, class levels and their features, subclass features, feats, chosen options (a Fighting Style, a Magic Initiate class), equipped and attuned items, and manual entries.
2. **Grants.** Each source grants ability bonuses, proficiencies, modifiers, resources, spellcasting and senses.
3. **Modifiers** target selectors such as `roll.attack.weapon.ranged`, `roll.check.*` or `stat.ac`. Each is either applied automatically or offered as a suggestion. A condition the app can't check ("against being charmed") always becomes a suggestion with its reason.
4. **Breakdowns.** Every result lists its parts, so a +7 attack shows Dexterity +3, Proficiency +2 and Archery +2.

## Content policy

Definitions carry mechanics, a short summary in our own words, and a book and page reference. No book text is copied into this repository.

## Status

| Phase | State |
| --- | --- |
| 1 · Engine core | Done for all four reference characters (Μπέρεν, Αριστοτέλης, Ελισσαίος, Αγακλής): abilities, saves, skills, passives, AC, initiative, speed, HP, weapon and feature attacks (melee and thrown), spellcasting, slots and Pact Magic, resources, level scaling, table rules |
| 1 · Remaining | Operation log and undo, local storage (IndexedDB), JSON export, the sheet UI |

### Shortcuts to revisit

- Variant human ability bonuses aren't recorded for Ελισσαίος and Αγακλής, so their base scores are the final scores.
- Αγακλής's Athlete +1 (Strength or Dexterity) isn't chosen yet; the engine shows it as a warning.
- Dual Wielder's +2 AC is switched on with the `dual-wielding` toggle until the app can tell what is in each hand.
- Mage Armor is a manual entry with a toggle until the effects system (Phase 4).

- The ranger class in `table-2014.json` already uses the Tasha's optional features. A general "optional class features" switch comes with the character builder.
- Μπέρεν's Acrobatics, Medicine and History proficiencies and his Druidic language are kept as the player's own entries (a manual grant), by the DM's decision.
