# D&D 5e Player Companion

A rules-aware character sheet, roll composer and table tool for D&D 5e (2014 rules), built for one group's real games. Every number the app shows can be opened to see where it comes from, and the app warns but never blocks.

The full product spec is the "D&D 5e Player Companion — Phase 0 Specification" doc. This repository is the project's memory between work sessions: the code, the content packs, the reference characters and their tests.

## Layout

| Path | What it is |
| --- | --- |
| `packages/schema` | Zod schemas and types: characters, content definitions, modifiers, operations |
| `packages/dice` | Dice formulas (`2d20kh1+5`, `2d6r<=2`, `1d20min10`, `[fire]` types), secure rolling, entering real dice results, critical damage, and the roll composer logic |
| `packages/store` | The operation log: every change (damage, a spent slot, a rest) is an operation; the character is the snapshot with the log replayed. Gives undo, redo, history and merging between devices |
| `packages/engine` | The rules engine. `derive(character, content)` returns the whole sheet with a breakdown for every number. Pure TypeScript, no UI |
| `packages/app` | The app: a React PWA. `npm run dev` runs it locally; every push to `main` is tested and published to GitHub Pages |
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

- `content/packs/srd-5.1`: material from the System Reference Document 5.1 by Wizards of the Coast LLC, used verbatim under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). Built with `scripts/build-srd-spells.py` from the open SRD dataset (github.com/5e-bits/5e-database); the only change is capitalizing ability names as the SRD prints them.
- `content/packs/table-2014`: the group's private pack. Non-SRD entries carry mechanics, a short summary in our own words and a book reference; spells marked "Placeholder" wait for the group's own import of the book text.

## Status

| Phase | State |
| --- | --- |
| 1 · Engine core | Done for all four reference characters (Μπέρεν, Αριστοτέλης, Ελισσαίος, Αγακλής): abilities, saves, skills, passives, AC, initiative, speed, HP, weapon and feature attacks (melee and thrown), spellcasting, slots and Pact Magic, resources, level scaling, table rules |
| 1 · Operation log | Done: damage (resistances, temp HP, 0 HP, massive damage), healing, temp HP, death saves, resources, spell and Pact slots, Hit Dice, short and long rests, toggles, validated field edits, undo/redo, offline merge |
| 1 · App | First screens: status strip with HP pad, Play (features, slots, Hit Dice, rests, death saves), Actions (attacks, spellcasting), Sheet (abilities, saves, skills, passives); every number opens its breakdown; undo toast; saved on the device; JSON export |
| 2 · Dice and composer | Done: tap any save, skill, initiative or attack to open the composer; optional modifiers as checkboxes (carried from attack to damage); advantage and disadvantage with the 2014 cancelling rule; extra bonus; real dice (default) or app rolls per character; critical damage with Brutal Critical and Vicious; last 200 rolls saved per character |
| 3 · Features and inventory | Done: features you can use (Rage, Form of Dread, Fey Step, Favored Foe, Portent, free casts, Flame Tongue...) grouped by action, bonus action, reaction and free; using one spends its uses, switches on its effects and records rolled temp HP; Inventory tab with equip, attune (limit warning), quantities, add and remove items, coins, weight |
| 4 · Effects and conditions | Done: all 14 conditions and Exhaustion (2014 rules, cumulative levels), with included conditions (Paralyzed brings Incapacitated); spell effects (Bless, Bane, Guidance, Haste, Slow, Shield, Shield of Faith, Mage Armor, Hunter's Mark, Hex, Heroism, Aid, Blur, Faerie Fire, Hold Person), Bardic Inspiration, Dodge, cover; custom effects for DM rulings; durations in rounds with End of my turn; reminders for what the app can't apply; auto-fail warnings; speed and HP max halving and caps |
| 5 · Spells and concentration | Done: 319 SRD 5.1 spells with their full text; each character's spells from their sheet (class lists, Magic Initiate, Fey Touched, Infernal Legacy, Primal Awareness, Haunted by the Shadows); DC, attack, damage and healing by slot level, cantrips by character level; casting with slots, upcasting, Pact slots, free uses and rituals; preparing (limit noted); spell attacks and damage through the composer; effects on yourself (Shield, Mage Armor); concentration with the automatic check on damage (DC 10 or half, after resistance, temp HP included), ends at 0 HP, when incapacitated, or when casting another |
| Remaining from 1 | Editing a character in the app, importing a file |

### Shortcuts to revisit

- Variant human ability bonuses aren't recorded for Ελισσαίος and Αγακλής, so those +1s are folded into their base scores.
- Dual Wielder's +2 AC is switched on with the `dual-wielding` toggle until the app can tell what is in each hand.

- The ranger class in `table-2014.json` already uses the Tasha's optional features. A general "optional class features" switch comes with the character builder.
- Μπέρεν's Acrobatics, Medicine and History proficiencies and his Druidic language are kept as the player's own entries (a manual grant), by the DM's decision.
