# Audit, round 14: what's still not covered

Done on 28 Oct 2026, after 13a–13g were merged. How it was checked:
1. A scan of every class, subclass, race and feat feature in both packs for features with no mechanics in the content.
2. A search of the engine, store and app for each one by its id, since some are handled in code.
3. Characters built at 20th level in every subclass, then the Play page checked for each resource: does tapping it open its feature, or does it only spend a use? (Harness Divine Power had the second problem.)
4. The AUDIT-ROUND13 lists (B, C and G) and docs/NOT-TRACKED.md compared against the current code.

Rows marked "ribbon" are flavour or social features (a language, a disguise, sensing a creature) and are fine as text.

## A. The Play page: uses that only spend the pool
Tapping these resources on Play marks a use and does nothing else, the same problem Harness Divine Power had. Most of them cast a spell for free, so tapping one should open that spell ready to cast, with "Use resource without effect" kept as the second choice.

| Resource | Where it comes from | What a tap should do |
|---|---|---|
| Mystic Arcanum (6th–9th) | Warlock 11+ | Open the arcanum spell's cast panel |
| Signature Spells (both) | Wizard 20 | Open the signature spell (cast at 3rd level) |
| Primal Awareness spells (4) | Ranger (Tasha's) | Open the chosen spell |
| Fey Reinforcements, Misty Wanderer | Fey Wanderer | Open Summon Fey / Misty Step |
| Grasping Tentacles | The Fathomless | Open Evard's Black Tentacles |
| Walker in Dreams | Circle of Dreams | Open the spell to pick (Dream, Scrying, Teleportation Circle) |
| Star Map (Guiding Bolt) | Circle of Stars | Open Guiding Bolt |
| Telekinetic Master | Psi Warrior | Open Telekinesis |
| Shapechanger | Transmutation | Open Polymorph (yourself, beast CR 1) |
| Summon drake (free) | Drakewarden | Open the drake summon |
| Dark One's Own Luck, Draconic Presence | Fiend, Ascendant Dragon | Explain that it's ticked on the check or save it changes, then offer to spend it anyway |
| Relentless Rage, Overchannel (counters) | Barbarian, Evocation | These count uses, not spend them: tapping should say so rather than mark a use |

## B. Features with no effect yet (numbers that matter)
| Class | Feature | What's missing |
|---|---|---|
| Monk 6 (Mercy) | Physician's Touch | Hand of Healing also ends a disease or a condition (blinded, deafened, paralyzed, poisoned, stunned): a pick on the heal |
| Monk 11 (Mercy) | Flurry of Healing and Harm | Hand of Healing in place of each Flurry strike, with no ki (Hand of Harm's part is there) |
| Monk 11 (Open Hand) | Tranquility | A Sanctuary on you after each long rest, with its DC (8 + Wisdom + PB) |
| Monk 17 (Drunken Master) | Intoxicated Frenzy | Up to 3 more Flurry attacks, each against a different creature |
| Cleric 17 (Grave) | Keeper of Souls | When an enemy dies near you, someone regains HP equal to its Hit Dice (a button, once per round) |
| Cleric 17 (Peace) | Expansive Bond | Bond range 60 ft; the creature that takes the damage with Protective Bond resists it |
| Cleric 1 (Order) | Voice of Authority | After a spell on an ally, that ally can use a reaction to attack (a reminder on casting) |
| Paladin 20 (Redemption) | Emissary of Redemption | Resistance to all damage dealt by others, and retaliation damage. Ends against a creature you attack |
| Wizard 10 (Scribes) | Master Scrivener | A scroll from your book, cast one level higher, once per long rest |
| Sorcerer 14 (Wild Magic) | Controlled Chaos | Roll the surge table twice and pick one |
| Barbarian 14 (Wild Magic) | Controlled Surge | Roll the Wild Surge twice and pick one |
| Ranger 11 (Beast Master) | Bestial Fury | Your companion attacks twice when you command it to Attack |
| Ranger 7 (Drakewarden) | Bond of Fang and Scale | The drake's flying speed, Medium size, and the extra damage resistance (left over from round 13) |
| Fighter 10 / 18 (Cavalier) | Hold the Line, Vigilant Defender | A reaction attack when a creature moves within reach; an extra reaction each turn for opportunity attacks |
| Fighter 15 / 18 (Rune Knight) | Master of Runes, Runic Juggernaut | Each rune twice per rest (it's one shared counter today); Huge size and +5 ft reach (the d10 die is done) |
| Fighter 15 (Eldritch Knight) | Arcane Charge | Teleport 30 ft with Action Surge (a note on Action Surge) |
| Bard 3 / 14 (Creation) | Mote of Potential, Creative Crescendo | What the mote adds to each kind of roll; more than one item from Performance of Creation |
| Bard 6 (Eloquence) | Unfailing Inspiration | A die that didn't change the result is kept (a "give it back" after the roll) |
| Druid 10 (Shepherd) | Guardian Spirit | Your summons inside the totem's aura regain HP equal to half your druid level at the end of their turn |
| Barbarian 7 (Tasha's) | Instinctive Pounce | Move up to half your speed when you rage (a note on Rage) |

## C. Spells
- **Counterspell and Dispel Magic:** against a higher-level spell, the ability check (DC 10 + the spell's level) isn't offered from the cast. The Abjuration wizard's Improved Abjuration is a suggestion on all Intelligence checks today; it should go on this roll.
- **Heroes' Feast** (on yourself): the hit point maximum increase (2d10), poison and fear immunity, and advantage on Wisdom saves for 24 hours could all be one tag.
- **Goodberry:** the 10 berries (1 HP each, for 24 hours) could be a counter.
- **Lesser and Greater Restoration on yourself:** could offer to remove the condition tag (or one exhaustion level) they end.

## D. Docs that are out of date
NOT-TRACKED still lists features that were done in later rounds:
- the School Savant features (copying costs are halved),
- Hex Warrior's Charisma,
- Focused Conjuration and Durable Summons,
- Mighty Summoner.

These lines should be struck when the next round lands.

## Fine as text (ribbons)
Trance, Mask of the Wild, Naturally Stealthy, Speech of Beast and Leaf, Mimicry, Infiltration Expertise, Impostor, Insightful Manipulator, Soul of Deceit, Fancy Footwork, Magical Ambush, Use Magic Device, Improved Duplicity, Split Enchantment, Malleable Illusions, Minor Alchemy, Sanctuary Vessel, Awakened Mind, Master of Hexes, Timeless Body, Tongue of the Sun and Moon, Deathless Nature, Sculpt Spells, Warrior of the Gods, Nature's Sanctuary, Born to the Saddle (advantage while mounted is a tick on that save).

## Suggested order (one sub-phase at a time, as usual)
- **14a, the Play page (A):** spell uses open their spell, and counters say they're counters. This is the same kind of fix as Harness Divine Power.
- **14b, monk and cleric (B):** Physician's Touch, Flurry of Healing and Harm, Tranquility, Intoxicated Frenzy, Keeper of Souls, Expansive Bond, Voice of Authority.
- **14c, the rest of B:** Emissary of Redemption, Master Scrivener, Controlled Chaos/Surge, Bestial Fury, Bond of Fang and Scale, Cavalier, Rune Knight, Arcane Charge, Creation, Unfailing Inspiration, Guardian Spirit, Instinctive Pounce.
- **14d, spells (C) and docs (D).**
