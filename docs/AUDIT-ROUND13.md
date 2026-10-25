# Audit, round 13 (Oct 25): what isn't covered yet

How it was checked:
- **Scripts over all the content:** 1,092 features, 75 feats, 346 spells, 258 items, 167 effects, 99 subclasses and 37 races.
- **Searches of the code:** for each feature, whether it changes anything or is only text.
- **Test characters built in the engine,** to confirm each suspected gap. All 12 classes at 20th level, every subclass, and multiclass mixes: Barbarian/Monk, Cleric/Paladin, Wizard/Eldritch Knight and Sorcerer/Warlock.
- **Existing records:** NOT-TRACKED.md, which lists what was already known and decided, was read first. Items below are new unless marked "(known)".

Everything marked **confirmed** was reproduced on a test character. The rest are features whose content has no mechanics and that the code never mentions, so they are shown as text only.

---

## A. Wrong today (bugs)

1. **Circle of the Land gets every land's spells at once.** A Land druid has the circle spells of all seven lands always prepared: 43 spells at 20th level. They should come from the one land chosen at 2nd level (Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp; the PHB adds Underdark). The SRD import merged the lists. **Confirmed.**
2. **Warlock patrons' expanded spell lists aren't applied.** The Archfey, Celestial, Fathomless, Genie, Great Old One, Hexblade and Undead each have the list only as a summary. The table's Fiend has no expanded-list feature at all. A warlock can't pick those spells as warlock spells. **Confirmed** (no granted spells from any patron's list).
3. **Channel Divinity from two classes gives two separate pools.** A Cleric 2 / Paladin 3 gets 1 + 1 uses. The 2014 multiclassing rule: taking the feature again gives that class's options but no extra use, and uses grow only at levels that say so. **Confirmed.**
4. **Primal Champion (Barbarian 20th) isn't applied.** It should give +4 Strength and +4 Constitution, with a maximum of 24. A barbarian 20 with Str 21 stays at 21. **Confirmed.** It's an SRD feature with no mechanics; the table's barbarian override stops at 9th level.

## B. Features whose effect is text only

### Capstones and high-level features
| Class | Feature | What's missing |
|---|---|---|
| Barbarian 15 | Persistent Rage | The rage doesn't end early (its timer only ends by choice or when you fall unconscious) |
| Barbarian 18 | Indomitable Might | A Strength check total below your Strength score uses the score |
| Barbarian 6 (Berserker) | Mindless Rage | Can't be charmed or frightened while raging |
| Cleric 20 | Divine Intervention Improvement | It succeeds automatically |
| Druid 20 | Archdruid | Unlimited Wild Shape (Wild Shape stays at 2 uses), and ignoring some components |
| Druid 10 (Land) | Nature's Ward | Poison and disease immunity, and charm/fear immunity against elementals and fey |
| Druid 6 (Land), Ranger 8 | Land's Stride | Note only |
| Monk 10 | Purity of Body | Immune to poison and disease (the poison immunity isn't on the sheet) |
| Monk 18 | Empty Body | 4 ki: invisible for a minute, resistant to all damage except force (not an action today) |
| Monk 7 | Stillness of Mind | An action that ends charmed or frightened on you |
| Monk 6 (Mercy) | Physician's Touch | Ending a condition with Hand of Healing |
| Monk 11 (Mercy) | Flurry of Healing and Harm | Free Hand of Healing in a Flurry ("Hand of Harm in a Flurry at 11th shows no effect", known) |
| Monk 11 (Open Hand) | Tranquility | Sanctuary after each long rest |
| Paladin 3 | Divine Health | Disease immunity |
| Paladin 14 | Cleansing Touch | Uses equal to your Charisma modifier, to end a spell on someone |
| Paladin 15 (Devotion) | Purity of Spirit | Always under Protection from Evil and Good |
| Ranger 20 | Foe Slayer | Once per turn, add Wisdom to an attack or damage roll against your favored enemy |
| Ranger 3 | Primeval Awareness | Spend a slot as an action |
| Ranger 10 | Hide in Plain Sight | +10 to Stealth while camouflaged |
| Ranger 18 | Feral Senses | Note only |
| Rogue 9 (Soulknife) | Soul Blades | Homing Strikes (a Psionic die added to a missed attack) and Psychic Teleportation |
| Rogue 17 (Thief) | Thief's Reflexes | Two turns in the first round |
| Rogue 3 (Thief) | Fast Hands | Cunning Action's extra options |
| Rogue 14 / 18 | Blindsense, Elusive | Notes only |
| Sorcerer 20 | Sorcerous Restoration | 4 sorcery points back on a short rest |
| Warlock 20 | Eldritch Master | All Pact slots back, once per long rest |
| Warlock (Hexblade) 1 | Hex Warrior | Charisma for the hex weapon's attack and damage (known; matters a lot for Hexblades and Hexadins) |
| Fighter 3 (Cavalier) | Born to the Saddle | Advantage on saves against falling off your mount |
| Ranger 7 (Drakewarden) | Bond of Fang and Scale | The drake's flying speed and Medium size |

### Choices that can't be made yet
- **Bard Magical Secrets (10th, 14th, 18th) and Lore's Additional Magical Secrets (6th):** no picker for spells from any class's list. Today they can only be added as beyond-the-rules spells.
- **Bard Peerless Skill (Lore 14):** Bardic Inspiration on your own ability checks.
- **Bard Countercharm (6):** no action or tag.
- **Invocation Gift of the Ever-Living Ones:** healing dice count as their maximum while your familiar is near. The Beacon of Hope mechanism already does this kind of thing.

### Feats with a note but no effect
- **Elven Accuracy:** the third d20 when you have advantage isn't rolled; it's a note.
- **Piercer:** rerolling one piercing die, and the extra die on a critical hit, are notes. Brutal Critical and Savage Attacks already add crit dice, so the mechanism exists.
- **Flames of Phlegethos:** rerolling 1s on fire damage is a note. Great Weapon Fighting's reroll mechanism exists.
- **Crusher and Slasher:** their critical-hit riders are notes. That one is fine as is, since they affect the target.

## C. Spells

### SRD spells without their own effect or creature
- **Animate Objects, Arcane Hand, Arcane Sword:** creatures or attacks you command, with no stat block or attack in the app (Spiritual Weapon shows how it can be done).
- **True Strike:** no tag giving advantage on your next attack.
- **Time Stop:** its 1d4 + 1 turns aren't rolled or tracked.
- **Antimagic Field, Mislead, Simulacrum, and the common uses of Wish:** no tag beyond the timer.

### Book spells (loaded from your files): mechanics come only from reading their text
These are common at the table and need more than the text reader gets: a weapon, a rider on your attacks, or an effect on you.
- **Booming Blade and Green-Flame Blade:** a weapon attack plus a rider. They interact with Extra Attack (not allowed with it), War Caster, Sneak Attack and crits.
- **Shadow Blade:** a weapon, with advantage in dim light.
- **Spirit Shroud, Crusader's Mantle, Holy Weapon, Elemental Weapon:** extra damage on your attacks.
- **Ranger spells:** Zephyr Strike, Hail of Thorns, Lightning Arrow, Swift Quiver, Conjure Barrage and Volley.
- **Witch Bolt** (repeat damage), Compelled Duel, Blade Ward.
- **Auras:** Aura of Vitality, Aura of Life, Aura of Purity.
- **Self buffs:** Tenser's Transformation; the four Investitures; Tasha's Otherworldly Guise; Intellect Fortress; Gift of Alacrity; Silvery Barbs (only if the table uses Strixhaven).

## D. Items
- **Most SRD magic items aren't in the app.** Of the 258 items, 56 are magic, mostly potions and scrolls. Common ones with numbers to apply are missing:
  - **Protection:** Cloak and Ring of Protection, Bracers of Defense.
  - **Items that set a score:** Gauntlets of Ogre Power, the Belts of Giant Strength, Headband of Intellect, Amulet of Health.
  - **Rings:** Ring of Resistance, Evasion, Free Action, Spell Storing, Regeneration.
  - **Boots and cloaks:** Boots of Speed, Elvenkind and Levitation, Winged Boots; Cloak of Elvenkind and Displacement.
  - **Periapts and Ioun Stones:** Periapt of Wound Closure, Ioun Stones.
  - **Staffs, robes and wands:** Staff of Power and of the Magi, Robe of the Archmagi, Wand of Magic Missiles and Fireballs, Pearl of Power.
  - **Weapons:** Frost Brand, Sun Blade, Holy Avenger, Dragon Slayer and Giant Slayer, Javelin of Lightning, Mace of Disruption, Dwarven Thrower, Vorpal Sword.
  - **Armor and shields:** Elven Chain, Adamantine and Mithral armor, Animated Shield, Sentinel Shield.
  - **Containers:** Bag of Holding and its weight.

  SRD 5.1 is CC-BY, so they can be added.
- **Caster focus items from other books:** Rod of the Pact Keeper, Wand of the War Mage, Arcane Grimoire, Amulet of the Devout, Moon Sickle, Bloodwell Vial, All-Purpose Tool and Rhythm-Maker's Drum. All add +N to spell attacks and save DCs, and most do something more. That pattern isn't supported yet.
- **Items loaded from your book files** get only "+N to attack and damage" or "+N to AC" automatically. Everything else stays text, or you build it as your own item.

## E. Content scope: depends on which books your table uses
- **Subclasses not in the app:**
  - From books that are already partly in the app: College of Spirits (Van Richten's, whose races are in) and Way of the Ascendant Dragon (Fizban's, whose races, feats and spells are in).
  - From books that aren't in the app yet: Arcana Domain, Purple Dragon Knight, Way of the Long Death, Oath of the Crown and Path of the Battlerager (Sword Coast); Death Domain and Oathbreaker (DMG); Echo Knight, Chronurgy and Graviturgy (Wildemount).
- **Races:** about half of the official 2014-era races. Aarakocra, Genasi, Tortle, Changeling, Warforged, Kalashtar, Shifter, Gith, Satyr, Centaur, Minotaur, Fairy, Harengon, Owlin, Duergar, Sea Elf, Shadar-kai, Deep Gnome, and the Tiefling and Half-Elf variants are missing. A book file can add a race, but only its basic numbers are read.
- **Backgrounds:** only Acolyte, Folk Hero and your own. A book file can add the rest, with skills, tools and languages read from it.

## F. Rules nothing in the app handles
- Falling damage (1d6 per 10 ft, at most 20d6).
- Holding your breath and suffocating.
- Underwater combat: disadvantage on most weapons, resistance to fire.
- Surprise, on the first round.
- Travel pace, downtime and crafting are DM-side; probably not worth it.

## G. Combinations (synergies)
**Checked and working:**
- Extra Attack doesn't stack across classes (Thirsting Blade).
- Unarmored Defense counts once.
- Multiclass spell slots include third-casters (Wizard 3 + Eldritch Knight 3 gives level-4 slots).
- Multiclassing minimum scores are warned.
- Great Weapon Fighting rerolls smite dice.
- Elemental Adept.
- Empowered Evocation with Overchannel.
- Brutal Critical with Savage Attacks.
- The 3-attunement limit.

**Missing:**
- Channel Divinity across classes (A3).
- Hex Warrior with Pact of the Blade (B).
- Elven Accuracy with any source of advantage (B).
- Piercer's crit die with the other crit dice (B).
- Gift of the Ever-Living Ones, which works like Beacon of Hope (B).
- The blade cantrips with Extra Attack, War Caster, Sneak Attack and crits (C).
- Spirit Shroud and Crusader's Mantle on every attack of a multiattack (C).
- Eldritch Master with Pact slots (B).
- Sorcerous Restoration with Font of Magic (B).
- Caster items with spell attack and save DC (D).

## Suggested order (one sub-phase at a time, as usual)
- **13a, the bugs:** one land for Circle of the Land, the warlock expanded lists, one shared Channel Divinity pool, Primal Champion.
- **13b, capstones and immunities:** Archdruid, Sorcerous Restoration, Eldritch Master, Foe Slayer, Divine Intervention Improvement, Persistent Rage, Indomitable Might, Mindless Rage, Purity of Body, Divine Health, Nature's Ward, Empty Body, Stillness of Mind, Cleansing Touch, Purity of Spirit, Thief's Reflexes.
- **13c, choices and feat effects:** Magical Secrets, Peerless Skill, Countercharm, Soul Blades, Primeval Awareness, Hide in Plain Sight, Hex Warrior, Elven Accuracy, Piercer, Flames of Phlegethos, Gift of the Ever-Living Ones.
- **13d, spells:** Animate Objects, Arcane Hand, Arcane Sword, True Strike and Time Stop; mechanics for the common book spells listed in C (our own short wording, no book text).
- **13e, magic items:** the common SRD magic items with their numbers; caster items' +N to spell attacks and DC.
- **13f, content scope:** the subclasses and races you choose.
- **13g, rules:** falling, breath, underwater, surprise.
