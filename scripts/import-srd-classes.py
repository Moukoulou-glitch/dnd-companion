#!/usr/bin/env python3
"""
Builds the SRD 5.1 classes, subclasses, class features, races and the
Acolyte background from the open 5e-database JSON (SRD 5.1, CC-BY-4.0).

    python3 scripts/import-srd-classes.py <path to 5e-database/src/2014/en>

Writes content/packs/srd-5.1/{classes,races,backgrounds}.json. Text is the
SRD's own (allowed by its licence); summaries are written here, in our words.
The table pack's versions of the same classes, features and races win over
these where both exist (see mergeClass in the engine's registry).
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "content" / "packs" / "srd-5.1"
SOURCE = {"pack": "srd-5.1", "book": "SRD 5.1"}


def load(name):
    return json.loads((SRC / f"5e-SRD-{name}.json").read_text())


classes = load("Classes")
levels = load("Levels")
features = {f["index"]: f for f in load("Features")}
subclasses = load("Subclasses")
races = load("Races")
subraces = load("Subraces")
traits = {t["index"]: t for t in load("Traits")}
backgrounds = load("Backgrounds")
equipment_categories = {c["index"]: c for c in load("Equipment-Categories")}

SKILL_IDS = {
    "acrobatics": "acrobatics", "animal-handling": "animalHandling", "arcana": "arcana", "athletics": "athletics",
    "deception": "deception", "history": "history", "insight": "insight", "intimidation": "intimidation",
    "investigation": "investigation", "medicine": "medicine", "nature": "nature", "perception": "perception",
    "performance": "performance", "persuasion": "persuasion", "religion": "religion",
    "sleight-of-hand": "sleightOfHand", "stealth": "stealth", "survival": "survival",
}

# The table pack's invocations and pact boon from Xanathar's and Tasha's, offered next to the SRD's.
TABLE_INVOCATIONS = [f"feature:invocation-{n}" for n in (
    "aspect-of-the-moon", "bond-of-the-talisman", "cloak-of-flies", "eldritch-mind", "eldritch-smite", "far-scribe",
    "ghostly-gaze", "gift-of-the-depths", "gift-of-the-ever-living-ones", "gift-of-the-protectors", "grasp-of-hadar",
    "improved-pact-weapon", "investment-of-the-chain-master", "lance-of-lethargy", "maddening-hex",
    "protection-of-the-talisman", "rebuke-of-the-talisman", "relentless-hex", "shroud-of-shadow", "tomb-of-levistus",
    "tricksters-escape", "undying-servitude")]
TABLE_PACT_BOONS = ["feature:pact-of-the-talisman"]

# Our own one-line summaries.
CLASS_SUMMARY = {
    "barbarian": "Furious warrior who shrugs off blows in a rage.",
    "bard": "Musician and spellcaster who inspires allies and knows a little of everything.",
    "cleric": "Divine spellcaster whose god grants healing, protection and power.",
    "druid": "Nature's spellcaster who can take the shape of beasts.",
    "fighter": "Master of weapons and armor, with more attacks than anyone.",
    "monk": "Unarmored martial artist powered by ki.",
    "paladin": "Holy warrior sworn to an oath, with smites and healing hands.",
    "ranger": "Wilderness hunter and tracker with a touch of nature magic.",
    "rogue": "Stealthy expert who strikes precisely with Sneak Attack.",
    "sorcerer": "Born with magic, able to bend spells with metamagic.",
    "warlock": "Spellcaster bound to an otherworldly patron, with invocations and pact magic.",
    "wizard": "Scholar of arcane magic with the widest spellbook.",
}
RACE_SUMMARY = {
    "hill-dwarf": "Sturdy and wise: poison resistance, darkvision and extra hit points.",
    "high-elf": "Graceful and keen-eyed, with a wizard cantrip and trance instead of sleep.",
    "lightfoot-halfling": "Small, lucky and brave; slips behind larger creatures to hide.",
    "human": "+1 to every ability score.",
    "dragonborn": "Draconic ancestry: a breath weapon and a damage resistance.",
    "rock-gnome": "Small and clever, with a knack for tinkering and magic resistance.",
    "half-elf": "Charismatic, versatile in two skills, with elven resilience.",
    "half-orc": "Strong and fierce: hard to drop, savage with critical hits.",
    "tiefling": "Infernal heritage: darkvision, fire resistance and a little innate magic.",
}

SPELLCASTING = {
    # class: (progression, preparation, from level)
    "bard": ("full", "known", 1),
    "cleric": ("full", "prepared", 1),
    "druid": ("full", "prepared", 1),
    "paladin": ("half", "prepared", 2),
    "ranger": ("half", "known", 2),
    "sorcerer": ("full", "known", 1),
    "warlock": ("pact", "known", 1),
    "wizard": ("full", "prepared", 1),
}

# SRD fighting styles that the table already has, with their mechanics.
ALIASES = {
    "fighter-fighting-style-archery": "feature:style-archery",
    "ranger-fighting-style-archery": "feature:style-archery",
    "fighter-fighting-style-two-weapon-fighting": "feature:style-two-weapon-fighting",
    "ranger-fighting-style-two-weapon-fighting": "feature:style-two-weapon-fighting",
}

defs = {}


def fid(index):
    if index in ALIASES:
        return ALIASES[index]
    # Every class's Defense, Dueling... is the same fighting style.
    m = re.match(r"^(?:fighter-|ranger-|paladin-)?fighting-style-(.+)$", index)
    if m:
        return f"feature:style-{m.group(1)}"
    return f"feature:{index}"


# Option features (fighting styles, Hunter's Prey choices, Land terrains,
# dragon ancestors) are offered by the feature that asks for them, not
# listed on their own.
OPTION_INDEXES = {
    o["item"]["index"]
    for f in features.values()
    for key in ("subfeature_options",)
    if key in (f.get("feature_specific") or {})
    for o in (f["feature_specific"][key].get("from", {}).get("options", []))
    if o.get("option_type") == "reference"
}

# Working mechanics for the most used SRD features, keyed by the SRD index:
# what the feature grants (uses, buttons, modifiers) and how it scales.
CL = lambda c: f"classLevel.class:{c}"
MECHANICS = {
    # Fighter
    "second-wind": {"grant": {"resources": [{"id": "second-wind", "name": "Second Wind", "max": 1, "reset": "short"}], "actions": [{"id": "second-wind", "name": "Second Wind", "economy": "bonus", "cost": {"resource": "second-wind"}, "heal": f"1d10 + {CL('fighter')}", "note": "Regain 1d10 + fighter level hit points."}]}},
    "action-surge-1-use": {"scaling": {"uses": {"class": "class:fighter", "table": [[2, 1], [17, 2]]}}, "grant": {"resources": [{"id": "action-surge", "name": "Action Surge", "max": "scale.uses", "reset": "short"}], "actions": [{"id": "action-surge", "name": "Action Surge", "economy": "free", "cost": {"resource": "action-surge"}, "extraAction": True, "note": "One more action on this turn (once per turn)."}]}},
    "indomitable-1-use": {"scaling": {"uses": {"class": "class:fighter", "table": [[9, 1], [13, 2], [17, 3]]}}, "grant": {"resources": [{"id": "indomitable", "name": "Indomitable", "max": "scale.uses", "reset": "long"}], "actions": [{"id": "indomitable", "name": "Indomitable", "economy": "free", "cost": {"resource": "indomitable"}, "note": "Reroll a saving throw you failed; you must use the new roll."}]}},
    "extra-attack-1": {"scaling": {"attacks": {"class": "class:fighter", "table": [[5, 2], [11, 3], [20, 4]]}}, "grant": {"extraAttacks": "scale.attacks"}},
    "improved-critical": {"grant": {"modifiers": [{"selector": "roll.attack.weapon.*", "op": "critRange", "value": 19, "label": "Improved Critical"}]}},
    "superior-critical": {"grant": {"modifiers": [{"selector": "roll.attack.weapon.*", "op": "critRange", "value": 18, "label": "Superior Critical"}]}},
    "fighting-style-defense": {"grant": {"modifiers": [{"selector": "stat.ac", "op": "add", "value": 1, "label": "Fighting Style: Defense", "when": {"withArmor": True}}]}},
    "fighting-style-dueling": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.melee", "op": "add", "value": 2, "mode": "suggested", "label": "Dueling", "when": {"text": "one-handed melee weapon and no other weapon"}}]}},
    "fighting-style-great-weapon-fighting": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.melee", "op": "reroll", "value": 2, "mode": "suggested", "label": "Great Weapon Fighting", "when": {"text": "two-handed or versatile weapon held in two hands"}}]}},
    "fighting-style-protection": {"grant": {"actions": [{"id": "protection", "name": "Protection", "economy": "reaction", "note": "With a shield: a creature you see attacks someone else within 5 ft of you; it has disadvantage on that attack."}]}},
    # Bard
    "bardic-inspiration-d6": {"scaling": {"die": {"class": "class:bard", "table": [[1, "d6"], [5, "d8"], [10, "d10"], [15, "d12"]]}}, "grant": {"resources": [{"id": "bardic-inspiration", "name": "Bardic Inspiration", "max": "mod.cha", "min": 1, "reset": "long", "die": "scale.die", "shortFrom": {"class": "class:bard", "level": 5}}], "actions": [{"id": "bardic-inspiration", "name": "Bardic Inspiration", "economy": "bonus", "cost": {"resource": "bardic-inspiration"}, "note": "Give a creature within 60 ft that can hear you one Bardic Inspiration die (d6; d8 at 5th, d10 at 10th, d12 at 15th) for 10 minutes. They add it to + Effect → Bardic Inspiration."}]}},
    "cutting-words": {"grant": {"actions": [{"id": "cutting-words", "name": "Cutting Words", "economy": "reaction", "cost": {"resource": "bardic-inspiration"}, "note": "A creature within 60 ft makes an attack, check or damage roll: roll your Bardic Inspiration die and subtract it."}]}},
    # Cleric
    "channel-divinity-1-rest": {"name": "Channel Divinity", "scaling": {"uses": {"class": "class:cleric", "table": [[2, 1], [6, 2], [18, 3]]}}, "grant": {"resources": [{"id": "channel-divinity", "name": "Channel Divinity", "max": "scale.uses", "reset": "short"}]}},
    "channel-divinity-turn-undead": {"grant": {"actions": [{"id": "turn-undead", "name": "Turn Undead", "economy": "action", "cost": {"resource": "channel-divinity"}, "note": "Undead within 30 ft that can see or hear you make a Wisdom save against your spell save DC or are turned for 1 minute (or until damaged). Destroy Undead from 5th level."}]}},
    "channel-divinity-preserve-life": {"grant": {"actions": [{"id": "preserve-life", "name": "Preserve Life", "economy": "action", "cost": {"resource": "channel-divinity"}, "note": "Share out 5 × your cleric level in healing among creatures within 30 ft, none above half their hit point maximum. Not undead or constructs."}]}},
    "divine-strike": {"scaling": {"dice": {"class": "class:cleric", "table": [[8, "1d8"], [14, "2d8"]]}}, "grant": {"modifiers": [{"selector": "roll.damage.weapon.*", "op": "add", "value": "scale.dice", "damageType": "radiant", "mode": "suggested", "oncePerTurn": True, "label": "Divine Strike", "when": {"text": "once on each of your turns"}}]}},
    "divine-intervention": {"grant": {"actions": [{"id": "divine-intervention", "name": "Divine Intervention", "economy": "action", "note": "Call on your deity: roll d100, and if it's your cleric level or lower, the DM chooses how it helps. On a success, not again for 7 days; otherwise after a long rest."}]}},
    # Druid
    "wild-shape-cr-1-4-or-below-no-flying-or-swim-speed": {"name": "Wild Shape", "grant": {"resources": [{"id": "wild-shape", "name": "Wild Shape", "max": 2, "reset": "short"}], "actions": [{"id": "wild-shape", "name": "Wild Shape", "economy": "action", "cost": {"resource": "wild-shape"}, "note": "Become a beast you've seen: CR 1/4 and no flying or swimming (CR 1/2, no flying at 4th; CR 1 at 8th). Lasts up to half your druid level in hours."}]}},
    # Monk
    "martial-arts": {"scaling": {"die": {"class": "class:monk", "table": [[1, "1d4"], [5, "1d6"], [11, "1d8"], [17, "1d10"]]}}, "grant": {"attacks": [{"id": "martial-arts", "name": "Unarmed Strike", "category": "simple", "kind": "melee", "damage": "scale.die", "damageType": "bludgeoning", "properties": ["finesse"]}, {"id": "martial-arts-bonus", "name": "Unarmed Strike (bonus action)", "category": "simple", "kind": "melee", "damage": "scale.die", "damageType": "bludgeoning", "properties": ["finesse"], "action": "bonus", "requires": {"attack": "martial-arts", "text": "Martial Arts: the bonus unarmed strike comes after taking the Attack action with an unarmed strike or a monk weapon."}}]}},
    "monk-unarmored-defense": {"grant": {"modifiers": [{"selector": "stat.ac", "op": "acBase", "value": "10 + mod.dex + mod.wis", "label": "Unarmored Defense", "when": {"noArmor": True, "noShield": True}}]}},
    "ki": {"grant": {"resources": [{"id": "ki", "name": "Ki points", "max": CL("monk"), "reset": "short"}]}},
    "flurry-of-blows": {"grant": {"actions": [{"id": "flurry-of-blows", "name": "Flurry of Blows", "economy": "bonus", "cost": {"resource": "ki"}, "note": "Right after taking the Attack action: two unarmed strikes as a bonus action."}]}},
    "patient-defense": {"grant": {"actions": [{"id": "patient-defense", "name": "Patient Defense", "economy": "bonus", "cost": {"resource": "ki"}, "untilTurnStart": True, "toggles": ["dodging"], "note": "Take the Dodge action as a bonus action: until your next turn, attacks against you have disadvantage and you have advantage on Dexterity saves."}]}},
    "step-of-the-wind": {"grant": {"actions": [{"id": "step-of-the-wind", "name": "Step of the Wind", "economy": "bonus", "cost": {"resource": "ki"}, "dash": True, "note": "Dash (or Disengage) as a bonus action, and your jump distance doubles this turn."}]}},
    "stunning-strike": {"grant": {"actions": [{"id": "stunning-strike", "name": "Stunning Strike", "economy": "free", "cost": {"resource": "ki"}, "note": "After hitting with a melee weapon attack: the target makes a Constitution save against your ki save DC (8 + proficiency + Wisdom) or is stunned until the end of your next turn."}]}},
    "deflect-missiles": {"grant": {"actions": [{"id": "deflect-missiles", "name": "Deflect Missiles", "economy": "reaction", "roll": {"dice": f"1d10 + mod.dex + {CL('monk')}", "label": "damage reduced"}, "note": "When a ranged weapon attack hits you. Reduced to 0: catch it, and spend 1 ki to throw it back."}]}},
    "unarmored-movement-1": {"name": "Unarmored Movement", "scaling": {"speed": {"class": "class:monk", "table": [[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]]}}, "grant": {"modifiers": [{"selector": "stat.speed.walk", "op": "add", "value": "scale.speed", "label": "Unarmored Movement", "when": {"noArmor": True, "noShield": True}}]}},
    "monk-extra-attack": {"grant": {"extraAttacks": 2}},
    "wholeness-of-body": {"grant": {"resources": [{"id": "wholeness-of-body", "name": "Wholeness of Body", "max": 1, "reset": "long"}], "actions": [{"id": "wholeness-of-body", "name": "Wholeness of Body", "economy": "action", "cost": {"resource": "wholeness-of-body"}, "heal": f"3*{CL('monk')}", "note": "Regain three times your monk level in hit points."}]}},
    # Paladin
    "divine-sense": {"grant": {"resources": [{"id": "divine-sense", "name": "Divine Sense", "max": "1 + mod.cha", "min": 1, "reset": "long"}], "actions": [{"id": "divine-sense", "name": "Divine Sense", "economy": "action", "cost": {"resource": "divine-sense"}, "note": "Until the end of your next turn, you know where celestials, fiends and undead are within 60 ft (not behind total cover), and any consecrated or desecrated place."}]}},
    "lay-on-hands": {"grant": {"resources": [{"id": "lay-on-hands", "name": "Lay on Hands", "max": f"5*{CL('paladin')}", "reset": "long"}], "actions": [{"id": "lay-on-hands", "name": "Lay on Hands", "economy": "action", "cost": {"resource": "lay-on-hands"}, "spendAmount": {"label": "Hit points to restore", "heals": True}, "note": "Touch a creature and restore hit points from your pool; 5 points cure one disease or neutralize one poison instead. Not undead or constructs."}]}},
    "divine-smite": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.melee", "op": "add", "value": "2d8", "damageType": "radiant", "mode": "suggested", "label": "Divine Smite", "when": {"text": "spend a spell slot on a hit: +1d8 per slot level above 1st (up to 5d8), +1d8 against undead or fiends"}}]}},
    "channel-divinity": {"name": "Channel Divinity (paladin)", "grant": {"resources": [{"id": "channel-divinity-paladin", "name": "Channel Divinity", "max": 1, "reset": "short"}]}},
    "channel-divinity-sacred-weapon": {"grant": {"actions": [{"id": "sacred-weapon", "name": "Sacred Weapon", "economy": "action", "cost": {"resource": "channel-divinity-paladin"}, "duration": {"rounds": 10}, "toggles": ["sacred-weapon"], "note": "For 1 minute your weapon is magical, sheds bright light, and you add your Charisma modifier to attacks with it."}], "modifiers": [{"selector": "roll.attack.weapon.*", "op": "add", "value": "mod.cha", "label": "Sacred Weapon", "when": {"toggle": "sacred-weapon"}}]}},
    "channel-divinity-turn-the-unholy": {"grant": {"actions": [{"id": "turn-the-unholy", "name": "Turn the Unholy", "economy": "action", "cost": {"resource": "channel-divinity-paladin"}, "note": "Fiends and undead within 30 ft that can hear you make a Wisdom save or are turned for 1 minute (or until damaged)."}]}},
    "paladin-extra-attack": {"grant": {"extraAttacks": 2}},
    "aura-of-protection": {"grant": {"modifiers": [{"selector": "roll.save.*", "op": "add", "value": "mod.cha", "label": "Aura of Protection"}]}},
    "improved-divine-smite": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.melee", "op": "add", "value": "1d8", "damageType": "radiant", "label": "Improved Divine Smite"}]}},
    # Ranger, barbarian
    "ranger-extra-attack": {"grant": {"extraAttacks": 2}},
    "barbarian-extra-attack": {"grant": {"extraAttacks": 2}},
    # Sorcerer
    "font-of-magic": {"grant": {"resources": [{"id": "sorcery-points", "name": "Sorcery points", "max": CL("sorcerer"), "reset": "long"}]}},
    "draconic-resilience": {"grant": {"modifiers": [{"selector": "stat.hp.max", "op": "add", "value": CL("sorcerer"), "label": "Draconic Resilience"}, {"selector": "stat.ac", "op": "acBase", "value": "13 + mod.dex", "label": "Draconic Resilience", "when": {"noArmor": True}}]}},
    # Warlock: pact boons and invocations
    "pact-of-the-chain": {"grant": {"spells": [{"spell": "spell:find-familiar", "name": "Find Familiar", "casting": "ritual", "list": "warlock"}]}},
    "pact-of-the-blade": {"grant": {"actions": [{"id": "pact-weapon", "name": "Create pact weapon", "economy": "action", "note": "A melee weapon of your choice appears in your empty hand. You're proficient with it and it counts as magical. Add it in Items to roll its attacks."}]}},
    "pact-of-the-tome": {"choices": [{"id": "cantrips", "label": "Book of Shadows cantrips", "kind": "spell", "count": 3, "spells": {"level": 0}}], "grant": {"spellcasting": {"id": "book-of-shadows", "label": "Book of Shadows", "ability": "cha", "progression": "none"}}},
    "eldritch-invocation-agonizing-blast": {"grant": {"modifiers": [{"selector": "roll.damage.spell.eldritch-blast", "op": "add", "value": "mod.cha", "label": "Agonizing Blast"}]}},
    "eldritch-invocation-armor-of-shadows": {"grant": {"spells": [{"spell": "spell:mage-armor", "name": "Mage Armor", "casting": "at will, on yourself", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-beast-speech": {"grant": {"spells": [{"spell": "spell:speak-with-animals", "name": "Speak with Animals", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-beguiling-influence": {"grant": {"proficiencies": [{"kind": "skill", "target": "deception"}, {"kind": "skill", "target": "persuasion"}]}},
    "eldritch-invocation-book-of-ancient-secrets": {"choices": [{"id": "rituals", "label": "Ritual spells", "kind": "spell", "count": 2, "spells": {"level": 1, "ritual": True}}], "grant": {"spellcasting": {"id": "ancient-secrets", "label": "Book of Ancient Secrets", "ability": "cha", "progression": "none"}}},
    "eldritch-invocation-devils-sight": {"grant": {"senses": {"devil's sight": 120}}},
    "eldritch-invocation-eldritch-sight": {"grant": {"spells": [{"spell": "spell:detect-magic", "name": "Detect Magic", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-eldritch-spear": {"grant": {"modifiers": [{"selector": "roll.attack.spell.eldritch-blast", "op": "note", "label": "Eldritch Spear: Eldritch Blast reaches 300 ft."}]}},
    "eldritch-invocation-fiendish-vigor": {"grant": {"spells": [{"spell": "spell:false-life", "name": "False Life", "casting": "at will, on yourself, as 1st level", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-gaze-of-two-minds": {"grant": {"actions": [{"id": "gaze-of-two-minds", "name": "Gaze of Two Minds", "economy": "action", "note": "Touch a willing humanoid and perceive through its senses until the end of your next turn (an action each turn keeps it going); you're blinded and deafened to your own surroundings."}]}},
    "eldritch-invocation-mask-of-many-faces": {"grant": {"spells": [{"spell": "spell:disguise-self", "name": "Disguise Self", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-misty-visions": {"grant": {"spells": [{"spell": "spell:silent-image", "name": "Silent Image", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-repelling-blast": {"grant": {"modifiers": [{"selector": "roll.damage.spell.eldritch-blast", "op": "note", "label": "Repelling Blast: each beam that hits can push the target up to 10 ft away."}]}},
    "eldritch-invocation-thief-of-five-fates": {"grant": {"spells": [{"spell": "spell:bane", "name": "Bane", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-mire-the-mind": {"grant": {"spells": [{"spell": "spell:slow", "name": "Slow", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-one-with-shadows": {"grant": {"actions": [{"id": "one-with-shadows", "name": "One with Shadows", "economy": "action", "note": "In dim light or darkness: you're invisible until you move or take an action or reaction."}]}},
    "eldritch-invocation-sign-of-ill-omen": {"grant": {"spells": [{"spell": "spell:bestow-curse", "name": "Bestow Curse", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-thirsting-blade": {"grant": {"extraAttacks": 2}},
    "eldritch-invocation-bewitching-whispers": {"grant": {"spells": [{"spell": "spell:compulsion", "name": "Compulsion", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-dreadful-word": {"grant": {"spells": [{"spell": "spell:confusion", "name": "Confusion", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-sculptor-of-flesh": {"grant": {"spells": [{"spell": "spell:polymorph", "name": "Polymorph", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-minions-of-chaos": {"grant": {"spells": [{"spell": "spell:conjure-elemental", "name": "Conjure Elemental", "casting": "once per long rest, with a warlock slot", "list": "warlock"}]}},
    "eldritch-invocation-ascendant-step": {"grant": {"spells": [{"spell": "spell:levitate", "name": "Levitate", "casting": "at will, on yourself", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-otherworldly-leap": {"grant": {"spells": [{"spell": "spell:jump", "name": "Jump", "casting": "at will, on yourself", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-whispers-of-the-grave": {"grant": {"spells": [{"spell": "spell:speak-with-dead", "name": "Speak with Dead", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-lifedrinker": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.melee", "op": "add", "value": "mod.cha", "damageType": "necrotic", "mode": "suggested", "label": "Lifedrinker", "when": {"text": "with your pact weapon"}}]}},
    "eldritch-invocation-chains-of-carceri": {"grant": {"spells": [{"spell": "spell:hold-monster", "name": "Hold Monster", "casting": "at will, on a celestial, fiend or elemental", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-master-of-myriad-forms": {"grant": {"spells": [{"spell": "spell:alter-self", "name": "Alter Self", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-visions-of-distant-realms": {"grant": {"spells": [{"spell": "spell:arcane-eye", "name": "Arcane Eye", "casting": "at will", "list": "warlock", "atWill": True}]}},
    "eldritch-invocation-witch-sight": {"grant": {"senses": {"witch sight": 30}}},
    # Sorcerer: Flexible Casting and Metamagic
    "flexible-casting-creating-spell-slots": {"grant": {"actions": [{"id": "flexible-to-slot", "name": "Flexible Casting: create a slot", "economy": "bonus", "cost": {"resource": "sorcery-points"}, "flexibleCasting": "toSlot", "note": "Spend sorcery points to create a spell slot: 1st 2, 2nd 3, 3rd 5, 4th 6, 5th 7. Created slots vanish on a long rest."}]}},
    "flexible-casting-converting-spell-slot": {"grant": {"actions": [{"id": "flexible-to-points", "name": "Flexible Casting: slot into points", "economy": "bonus", "cost": {"resource": "sorcery-points"}, "flexibleCasting": "toPoints", "note": "Spend a spell slot to gain sorcery points equal to its level."}]}},
    "metamagic-careful-spell": {"grant": {"actions": [{"id": "careful-spell", "name": "Careful Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "note": "1 point: up to your Charisma modifier creatures automatically succeed on the spell's save."}]}},
    "metamagic-distant-spell": {"grant": {"actions": [{"id": "distant-spell", "name": "Distant Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "note": "1 point: double the spell's range, or touch becomes 30 ft."}]}},
    "metamagic-empowered-spell": {"grant": {"actions": [{"id": "empowered-spell", "name": "Empowered Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "note": "1 point: reroll up to your Charisma modifier damage dice (works with other Metamagic)."}]}},
    "metamagic-extended-spell": {"grant": {"actions": [{"id": "extended-spell", "name": "Extended Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "note": "1 point: double a duration of 1 minute or longer, up to 24 hours."}]}},
    "metamagic-heightened-spell": {"grant": {"actions": [{"id": "heightened-spell", "name": "Heightened Spell", "economy": "free", "cost": {"resource": "sorcery-points", "amount": 3}, "note": "3 points: one target has disadvantage on its first save against the spell."}]}},
    "metamagic-quickened-spell": {"grant": {"actions": [{"id": "quickened-spell", "name": "Quickened Spell", "economy": "free", "cost": {"resource": "sorcery-points", "amount": 2}, "note": "2 points: a spell with a casting time of 1 action is cast as a bonus action instead."}]}},
    "metamagic-subtle-spell": {"grant": {"actions": [{"id": "subtle-spell", "name": "Subtle Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "note": "1 point: no verbal or somatic components."}]}},
    "metamagic-twinned-spell": {"grant": {"actions": [{"id": "twinned-spell", "name": "Twinned Spell", "economy": "free", "cost": {"resource": "sorcery-points"}, "spendAmount": {"label": "Sorcery points (the spell's level; 1 for a cantrip)"}, "note": "A spell that targets one creature and not self targets a second creature in range."}]}},
    # Ranger (Hunter) options
    "hunters-prey-colossus-slayer": {"grant": {"modifiers": [{"selector": "roll.damage.weapon.*", "op": "add", "value": "1d8", "mode": "suggested", "oncePerTurn": True, "label": "Colossus Slayer", "when": {"text": "the target is below its hit point maximum; once per turn"}}]}},
    "hunters-prey-giant-killer": {"grant": {"actions": [{"id": "giant-killer", "name": "Giant Killer", "economy": "reaction", "note": "A Large or larger creature within 5 ft hits or misses you with an attack: attack it right after, if you can see it."}]}},
    "hunters-prey-horde-breaker": {"grant": {"actions": [{"id": "horde-breaker", "name": "Horde Breaker", "economy": "free", "note": "Once on each of your turns when you make a weapon attack: one more attack against a different creature within 5 ft of the original target and in range."}]}},
    "defensive-tactics-escape-the-horde": {"grant": {"modifiers": [{"selector": "stat.ac", "op": "note", "label": "Escape the Horde: opportunity attacks against you have disadvantage."}]}},
    "defensive-tactics-multiattack-defense": {"grant": {"modifiers": [{"selector": "stat.ac", "op": "add", "value": 4, "mode": "suggested", "label": "Multiattack Defense", "when": {"text": "against later attacks from a creature that hit you this turn"}}]}},
    "defensive-tactics-steel-will": {"grant": {"modifiers": [{"selector": "roll.save.*", "op": "advantage", "mode": "suggested", "label": "Steel Will", "when": {"text": "against being frightened"}}]}},
    "multiattack-volley": {"grant": {"actions": [{"id": "volley", "name": "Volley", "economy": "action", "note": "A ranged attack against every creature within 10 ft of a point you can see in range (one roll each, one piece of ammunition each)."}]}},
    "multiattack-whirlwind-attack": {"grant": {"actions": [{"id": "whirlwind-attack", "name": "Whirlwind Attack", "economy": "action", "note": "A melee attack against every creature within 5 ft of you, a separate roll for each."}]}},
    "superior-hunters-defense-evasion": {"grant": {"modifiers": [{"selector": "roll.save.dex", "op": "note", "label": "Evasion: on a Dexterity save for half damage, none on a success and half on a failure."}]}},
    "superior-hunters-defense-stand-against-the-tide": {"grant": {"actions": [{"id": "stand-against-the-tide", "name": "Stand Against the Tide", "economy": "reaction", "note": "A hostile creature misses you with a melee attack: it repeats the attack against another creature of your choice."}]}},
    "superior-hunters-defense-uncanny-dodge": {"grant": {"actions": [{"id": "hunter-uncanny-dodge", "name": "Uncanny Dodge", "economy": "reaction", "note": "An attacker you can see hits you: halve the attack's damage."}]}},
    # Rogue (SRD levels beyond the table's)
    "reliable-talent": {"grant": {"modifiers": [{"selector": "roll.check.skill.*", "op": "minD20", "value": 10, "label": "Reliable Talent", "when": {"text": "skills you're proficient in"}}]}},
}


def apply_mechanics(index, d):
    m = MECHANICS.get(index)
    if not m:
        return d
    if "name" in m:
        d["name"] = m["name"]
    if "scaling" in m:
        d["scaling"] = m["scaling"]
    if "choices" in m:
        d["choices"] = (d.get("choices") or []) + m["choices"]
    if "grant" in m:
        g = d.setdefault("grant", {})
        for k, v in m["grant"].items():
            g[k] = (g.get(k) or []) + v if isinstance(v, list) else v
    return d


def summary_of(paras):
    first = " ".join(p for p in paras if not p.startswith("|"))[:400]
    m = re.match(r"(.+?[.!?])(\s|$)", first)
    s = (m.group(1) if m else first).strip()
    return s if len(s) <= 220 else s[:217].rsplit(" ", 1)[0] + "…"


def clean_text(desc):
    out = []
    for p in desc:
        p = p.strip()
        if not p:
            continue
        out.append(p)
    return out


def proficiency(ref):
    """An SRD proficiency reference as our Proficiency entries."""
    idx, name = ref["index"], ref["name"]
    if idx.startswith("saving-throw"):
        return []
    if idx.startswith("skill-"):
        return [{"kind": "skill", "target": SKILL_IDS[idx[6:]]}]
    armor = {"light-armor": ["light"], "medium-armor": ["medium"], "heavy-armor": ["heavy"], "all-armor": ["light", "medium", "heavy"], "shields": ["shields"]}
    if idx in armor:
        return [{"kind": "armor", "target": t} for t in armor[idx]]
    if idx in ("simple-weapons", "martial-weapons"):
        return [{"kind": "weapon", "target": idx.split("-")[0]}]
    cat = ref.get("_category")
    tool_words = ("tools", "kit", "supplies", "set", "instrument", "utensils")
    if any(w in name.lower() for w in tool_words) or idx in INSTRUMENTS:
        return [{"kind": "tool", "target": tool_name(name)}]
    # A specific weapon: "Hand crossbows" -> "hand crossbow".
    w = name.lower()
    w = re.sub(r"s$", "", w) if not w.endswith("ss") else w
    return [{"kind": "weapon", "target": w}]


INSTRUMENTS = {e["index"] for e in equipment_categories.get("musical-instruments", {}).get("equipment", [])}


def tool_name(name):
    return name[0] + name[1:].lower()


def options_of(choice):
    """The names/indexes in an SRD option set, flattening nested choices."""
    frm = choice.get("from", {})
    out = []
    if frm.get("option_set_type") == "equipment_category":
        cat = equipment_categories.get(frm["equipment_category"]["index"], {})
        return [{"index": e["index"], "name": e["name"]} for e in cat.get("equipment", [])]
    for o in frm.get("options", []):
        if o.get("option_type") == "reference":
            out.append(o["item"])
        elif o.get("option_type") == "choice":
            out.extend(options_of(o["choice"]))
    return out


def choice_defs(prof_choices, prefix=""):
    """Class/race proficiency choices as ChoiceDefs plus the grant entries that use them."""
    choices, profs = [], []
    n_tool = 0
    for pc in prof_choices:
        opts = options_of(pc)
        skills = [SKILL_IDS[o["index"][6:]] for o in opts if o["index"].startswith("skill-")]
        if skills and len(skills) == len(opts):
            cid = f"{prefix}skills"
            choices.append({"id": cid, "label": "Skills", "kind": "skill", "count": pc["choose"], **({"from": skills} if len(skills) < 18 else {})})
            profs.append({"kind": "skill", "target": {"choice": cid}})
        else:
            n_tool += 1
            cid = f"{prefix}tools" + ("" if n_tool == 1 else f"-{n_tool}")
            names = [tool_name(o["name"]) for o in opts]
            choices.append({"id": cid, "label": "Tools or instruments", "kind": "tool", "count": pc["choose"], "from": names})
            profs.append({"kind": "tool", "target": {"choice": cid}})
    return choices, profs


def feature_choices(f):
    """Choices a feature asks for (Expertise, Fighting Style, Invocations...) and the grant that uses them."""
    spec = f.get("feature_specific") or {}
    choices, grant = [], {}
    if "expertise_options" in spec:
        eo = spec["expertise_options"]
        opts = options_of(eo)
        skills = [SKILL_IDS[o["index"][6:]] for o in opts if o["index"].startswith("skill-")]
        choices.append({"id": "skills", "label": "Expertise", "kind": "skill", "count": eo["choose"]})
        grant["proficiencies"] = [{"kind": "expertise", "target": {"choice": "skills"}}]
    if "subfeature_options" in spec:
        so = spec["subfeature_options"]
        extra = TABLE_PACT_BOONS if f["index"] == "pact-boon" else []
        choices.append({"id": "option", "label": f["name"], "kind": "feature", "count": so["choose"], "from": [fid(o["index"]) for o in options_of(so)] + extra})
    if "invocations" in spec:
        choices.append({"id": "invocations", "label": "Eldritch Invocations", "kind": "feature", "count": 2, "countBy": "invocations", "from": [fid(o["index"]) for o in spec["invocations"]] + TABLE_INVOCATIONS})
    for key, label in (("enemy_type_options", "Favored enemy"), ("terrain_type_options", "Favored terrain")):
        if key in spec:
            o = spec[key]
            choices.append({"id": key.split("_")[0], "label": label, "kind": "option", "count": o["choose"], "from": o["from"]["options"]})
    return choices, grant


def add_feature(f, name=None, extra_text=None):
    i = fid(f["index"])
    if i in defs:
        return i
    text = clean_text(f.get("desc", []))
    if extra_text:
        text += extra_text
    d = {"kind": "feature", "id": i, "name": name or f["name"], "summary": summary_of(text) if text else f["name"], "source": SOURCE, "text": text}
    choices, grant = feature_choices(f)
    if choices:
        d["choices"] = choices
    if grant:
        d["grant"] = grant
    m = re.match(r"^(?:fighter-|ranger-|paladin-)?(fighting-style-.+)$", f["index"])
    apply_mechanics(m.group(1) if m else f["index"], d)
    if d["id"].startswith("feature:style-"):
        d["name"] = re.sub(r"^Fighting Style:\s*", "", d["name"])
    defs[i] = d
    # Options a feature offers (fighting styles, invocations) are features too.
    spec = f.get("feature_specific") or {}
    for key in ("subfeature_options",):
        if key in spec:
            for o in options_of(spec[key]):
                if o["index"] in features:
                    add_feature(features[o["index"]])
    if "invocations" in spec:
        for o in spec["invocations"]:
            if o["index"] in features:
                add_feature(features[o["index"]])
    return i


def base_name(name):
    return re.sub(r"\s*\(.*\)$", "", name).strip()


def class_features(feature_refs, flavor):
    """Level lists of features, skipping ASIs and subclass placeholders, folding upgrades into the first one."""
    out = []
    first = {}  # base name -> feature dict index in defs
    for level, ref in feature_refs:
        f = features[ref["index"]]
        name = f["name"]
        if "ability-score-improvement" in ref["index"]:
            continue
        if name == flavor or name.endswith(" feature") or name in ("Domain Spells", "Oath Spells", "Aura improvements"):
            continue
        b = base_name(name)
        spec = f.get("feature_specific")
        if b in first and not spec and b != name:
            # An upgrade (Bardic Inspiration (d8)): its text goes on the original.
            d = defs[first[b]]
            d["text"] = d["text"] + [f"Level {level}: " + " ".join(clean_text(f.get("desc", [])))]
            continue
        if b in first and not spec and b == name:
            d = defs[first[b]]
            d["text"] = d["text"] + [f"Level {level}: " + " ".join(clean_text(f.get("desc", [])))]
            continue
        i = add_feature(f, name=b if b != name and not spec else None)
        if not spec:
            first[b] = i
        out.append({"level": level, "feature": i})
    return out


# ---- Classes ----
for c in classes:
    ci = c["index"]
    lv = sorted([x for x in levels if x["class"]["index"] == ci and "subclass" not in x], key=lambda x: x["level"])
    sub = next((s for s in subclasses if s["class"]["index"] == ci), None)
    flavor = sub["subclass_flavor"] if sub else ""
    refs = [(x["level"], f) for x in lv for f in x["features"]]
    sub_level = next((lvl for lvl, f in refs if features[f["index"]]["name"] == flavor), 3)
    feats = class_features(refs, flavor)

    asi, prev = [], 0
    for x in lv:
        if x["ability_score_bonuses"] > prev:
            asi.append(x["level"])
        prev = x["ability_score_bonuses"]

    progression = {}
    for key, src in (("cantrips", ("spellcasting", "cantrips_known")), ("spellsKnown", ("spellcasting", "spells_known")), ("invocations", ("class_specific", "invocations_known"))):
        vals = [((x.get(src[0]) or {}).get(src[1]) or 0) for x in lv]
        if any(vals):
            progression[key] = vals

    profs = [p for ref in c["proficiencies"] for p in proficiency(ref)]
    choices, choice_profs = choice_defs(c["proficiency_choices"])
    mc = c.get("multi_classing", {})
    mc_profs = [p for ref in mc.get("proficiencies", []) for p in proficiency(ref)]
    mc_choices, mc_choice_profs = choice_defs(mc.get("proficiency_choices", []))
    prereq = None
    if mc.get("prerequisites"):
        prereq = {"abilities": {p["ability_score"]["index"]: p["minimum_score"] for p in mc["prerequisites"]}}
    elif mc.get("prerequisite_options"):
        po = mc["prerequisite_options"]
        prereq = {"abilities": {o["ability_score"]["index"]: o["minimum_score"] for o in po["from"]["options"]}, "any": True}

    d = {
        "kind": "class",
        "id": f"class:{ci}",
        "name": c["name"],
        "summary": CLASS_SUMMARY[ci],
        "source": SOURCE,
        "hitDie": c["hit_die"],
        "saves": [s["index"] for s in c["saving_throws"]],
        "startingGrant": {"proficiencies": profs + choice_profs},
        "multiclassGrant": {"proficiencies": mc_profs + mc_choice_profs},
        "features": feats,
        "subclassLevel": sub_level,
        "subclassTitle": flavor,
        "choices": choices,
        "asiLevels": asi,
    }
    if mc_choices:
        d["multiclassChoices"] = mc_choices
    if progression:
        d["progression"] = progression
    if prereq:
        d["multiclassPrereq"] = prereq
    if ci in SPELLCASTING:
        prog, prep, start = SPELLCASTING[ci]
        d["spellcasting"] = {"id": ci, "label": c["name"], "ability": c["spellcasting"]["spellcasting_ability"]["index"], "progression": prog}
        d["spellPreparation"] = prep
        if start > 1:
            d["spellcastingFromLevel"] = start
    defs[d["id"]] = d

# ---- Subclasses ----
for s in subclasses:
    si = s["index"]
    sub_feats = sorted([f for f in features.values() if (f.get("subclass") or {}).get("index") == si], key=lambda f: f["level"])
    refs = []
    first = {}
    for f in sub_feats:
        if f["index"] in OPTION_INDEXES:
            add_feature(f)
            continue
        b = base_name(f["name"])
        if b in first and not f.get("feature_specific"):
            d = defs[first[b]]
            d["text"] = d["text"] + [f"Level {f['level']}: " + " ".join(clean_text(f.get("desc", [])))]
            continue
        i = add_feature(f, name=b if b != f["name"] and not f.get("feature_specific") else None)
        first[b] = i
        refs.append({"level": f["level"], "feature": i})
    # Domain, oath and circle spells: always prepared, from the level they arrive.
    ci = s["class"]["index"]
    if s.get("spells") and ci != "warlock":
        by_level = {}
        for sp in s["spells"]:
            lvl = min(int(p["index"].rsplit("-", 1)[1]) for p in sp["prerequisites"] if p.get("type") == "level")
            by_level.setdefault(lvl, []).append(sp["spell"])
        for lvl, spells in sorted(by_level.items()):
            i = f"feature:{si}-spells-{lvl}"
            defs[i] = {
                "kind": "feature",
                "id": i,
                "name": f"{s['name']} spells ({lvl})",
                "summary": "Always prepared, and they don't count against the spells you prepare: " + ", ".join(x["name"] for x in spells) + ".",
                "source": SOURCE,
                "grant": {"spells": [{"spell": f"spell:{x['index']}", "name": x["name"], "casting": "always prepared", "list": ci} for x in spells]},
            }
            refs.append({"level": lvl, "feature": i})
    refs.sort(key=lambda r: r["level"])
    defs[f"subclass:{si}"] = {
        "kind": "subclass",
        "id": f"subclass:{si}",
        "name": s["name"],
        "summary": summary_of(clean_text(s.get("desc", []))),
        "source": SOURCE,
        "text": clean_text(s.get("desc", [])),
        "class": f"class:{ci}",
        "features": refs,
    }

classes_out = [d for d in defs.values()]

# ---- Races ----
race_defs = {}


def trait_feature(t):
    i = f"feature:trait-{t['index']}"
    if i in race_defs:
        return i
    text = clean_text(t.get("desc", []))
    d = {"kind": "feature", "id": i, "name": t["name"], "summary": summary_of(text) if text else t["name"], "source": SOURCE, "text": text}
    grant, choices = {}, []
    profs = [p for ref in t.get("proficiencies", []) for p in proficiency(ref)]
    if t.get("proficiency_choices"):
        cs, ps = choice_defs([t["proficiency_choices"]])
        choices += cs
        profs += ps
    if profs:
        grant["proficiencies"] = profs
    spec = t.get("trait_specific") or {}
    if "subtrait_options" in spec:
        so = spec["subtrait_options"]
        opts = options_of(so)
        for o in opts:
            if o["index"] in traits:
                trait_feature(traits[o["index"]])
        choices.append({"id": "option", "label": t["name"], "kind": "feature", "count": so["choose"], "from": [f"feature:trait-{o['index']}" for o in opts]})
    if "spell_options" in spec:
        choices.append({"id": "cantrip", "label": "Cantrip", "kind": "spell", "count": spec["spell_options"]["choose"], "spells": {"classes": ["wizard"], "level": 0}})
        grant["spellcasting"] = {"id": "high-elf", "label": "High Elf cantrip", "ability": "int", "progression": "none"}
    if t["index"] in ("darkvision",):
        grant["senses"] = {"darkvision": 60}
    if t["index"] == "superior-darkvision":
        grant["senses"] = {"darkvision": 120}
    if t["index"] == "dwarven-toughness":
        grant["modifiers"] = [{"selector": "stat.hp.max", "op": "add", "value": "level", "label": "Dwarven Toughness"}]
    if t["index"] == "dwarven-resilience":
        grant["modifiers"] = [{"selector": "defense.resist.poison", "op": "resist", "label": "Dwarven Resilience"}]
    if t["index"] == "hellish-resistance":
        grant["modifiers"] = [{"selector": "defense.resist.fire", "op": "resist", "label": "Hellish Resistance"}]
    if grant:
        d["grant"] = grant
    if choices:
        d["choices"] = choices
    race_defs[i] = d
    return i


def race_def(r, sub=None):
    ident = sub["index"] if sub else r["index"]
    name = sub["name"] if sub else r["name"]
    bonuses = {}
    for b in r.get("ability_bonuses", []) + (sub.get("ability_bonuses", []) if sub else []):
        bonuses[b["ability_score"]["index"]] = bonuses.get(b["ability_score"]["index"], 0) + b["bonus"]
    grant = {"abilityBonuses": bonuses} if bonuses else {}
    choices = []
    if r.get("ability_bonus_options"):
        o = r["ability_bonus_options"]
        choices.append({"id": "abilities", "label": "Ability scores (+1 each)", "kind": "ability", "count": o["choose"], "from": [x["ability_score"]["index"] for x in o["from"]["options"]]})
        grant["abilityChoice"] = {"choice": "abilities", "amount": 1}
    profs = [{"kind": "language", "target": l["name"]} for l in r.get("languages", [])]
    profs += [p for ref in r.get("starting_proficiencies", []) for p in proficiency(ref)]
    for lo in [r.get("language_options")] + ([sub.get("language_options")] if sub else []):
        if lo:
            frm = lo.get("from", {})
            names = [o["item"]["name"] for o in frm.get("options", []) if o.get("option_type") == "reference"]
            choices.append({"id": "language", "label": "Language", "kind": "language", "count": lo["choose"], **({"from": names} if names else {})})
            profs.append({"kind": "language", "target": {"choice": "language"}})
    if r.get("starting_proficiency_options"):
        cs, ps = choice_defs([r["starting_proficiency_options"]])
        choices += cs
        profs += ps
    if profs:
        grant["proficiencies"] = profs
    feats = [trait_feature(traits[t["index"]]) for t in r.get("traits", []) + (sub.get("racial_traits", []) if sub else []) if t["index"] in traits]
    d = {
        "kind": "race",
        "id": f"race:{ident}",
        "name": name,
        "summary": RACE_SUMMARY.get(ident, name),
        "source": SOURCE,
        "text": clean_text([r.get("age", ""), r.get("size_description", "")] + ([sub.get("desc", "")] if sub else [])),
        "size": r["size"].lower(),
        "speed": r["speed"],
        "grant": grant,
        "features": feats,
    }
    if sub:
        d["group"] = r["name"]
    if choices:
        d["choices"] = choices
    race_defs[d["id"]] = d


for r in races:
    subs = [s for s in subraces if s["race"]["index"] == r["index"]]
    if subs:
        for s in subs:
            race_def(r, s)
    else:
        race_def(r)

# ---- Background ----
bg_defs = []
for b in backgrounds:
    feat_id = f"feature:{re.sub(r'[^a-z]+', '-', b['feature']['name'].lower()).strip('-')}"
    bg_defs.append({"kind": "feature", "id": feat_id, "name": b["feature"]["name"], "summary": summary_of(b["feature"]["desc"]), "source": SOURCE, "text": clean_text(b["feature"]["desc"])})
    profs = [p for ref in b["starting_proficiencies"] for p in proficiency(ref)]
    choices = []
    lo = b.get("language_options")
    if lo:
        choices.append({"id": "languages", "label": "Languages", "kind": "language", "count": lo["choose"]})
        profs.append({"kind": "language", "target": {"choice": "languages"}})
    bg_defs.append({
        "kind": "background",
        "id": f"background:{b['index']}",
        "name": b["name"],
        "summary": "Raised in service to a temple: Insight, Religion, two languages, and shelter among the faithful.",
        "source": SOURCE,
        "grant": {"proficiencies": profs},
        "choices": choices,
        "features": [feat_id],
    })


def write(name, items):
    (OUT / name).write_text(json.dumps({"definitions": items}, ensure_ascii=False, indent=2) + "\n")


write("classes.json", classes_out)
write("races.json", list(race_defs.values()))
write("backgrounds.json", bg_defs)
print(f"{sum(1 for d in classes_out if d['kind']=='class')} classes, {sum(1 for d in classes_out if d['kind']=='subclass')} subclasses, "
      f"{sum(1 for d in classes_out if d['kind']=='feature')} features, {sum(1 for d in race_defs.values() if d['kind']=='race')} races, {len(bg_defs)//2} background")
