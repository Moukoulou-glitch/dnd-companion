"""
Builds content/packs/srd-5.1/spells.json from the open SRD 5.1 dataset
(https://github.com/5e-bits/5e-database, src/2014/en/5e-SRD-Spells.json).

Text is kept as published in the SRD. The only change: the dataset lowercases
ability names ("dexterity saving throw"); they are capitalized back as in the
SRD ("Dexterity saving throw").

Usage: python3 scripts/build-srd-spells.py <path to 5e-SRD-Spells.json>
"""
import json, re, sys

ABILS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
ABBR = {"str": "str", "dex": "dex", "con": "con", "int": "int", "wis": "wis", "cha": "cha"}
CAP = re.compile(r"\b(" + "|".join(ABILS) + r")\b")


def fix(text: str) -> str:
    return CAP.sub(lambda m: m.group(1).capitalize(), text)


def attack_of(s):
    if s.get("attack_type") in ("melee", "ranged"):
        return s["attack_type"]
    body = " ".join(s.get("desc", [])).lower()
    if "ranged spell attack" in body:
        return "ranged"
    if "melee spell attack" in body:
        return "melee"
    return None


# Spells that can target only one creature (reviewed by hand): War Caster's
# opportunity-attack spell needs a 1-action spell that targets only the creature.
SINGLE_TARGET = set("""acid-splash chill-touch eldritch-blast fire-bolt poison-spray ray-of-frost sacred-flame shocking-grasp vicious-mockery true-strike animal-friendship charm-person command guiding-bolt hideous-laughter inflict-wounds magic-missile acid-arrow blindness-deafness hold-person ray-of-enfeeblement scorching-ray enlarge-reduce suggestion bestow-curse dispel-magic banishment blight dominate-beast phantasmal-killer polymorph contagion dominate-person hold-monster modify-memory telekinesis disintegrate flesh-to-stone harm heal irresistible-dance finger-of-death plane-shift dominate-monster feeblemind maze power-word-stun power-word-kill""".split())

# Spells whose damage has two types at once (reviewed by hand): the source data
# keeps only one. Each part rolls as its own dice of its own type, so
# resistances apply per type. Upcasting adds to the type the spell names.
def _scale(base, per, frm, to=9):
    n, die = base.split("d")
    return {str(l): f"{int(n) + (l - frm) * per}d{die}" for l in range(frm, to + 1)}

DAMAGE_PARTS = {
    # 2d8 bludgeoning (+1d8 per slot above 4th) and 4d6 cold.
    "ice-storm": {"type": "bludgeoning", "atSlot": _scale("2d8", 1, 4), "also": [{"type": "cold", "atSlot": _scale("4d6", 0, 4)}]},
    # 4d6 fire and 4d6 radiant; the extra 1d6 per slot above 5th goes on the fire here (the spell lets you put it on the radiant instead).
    "flame-strike": {"type": "fire", "atSlot": _scale("4d6", 1, 5), "also": [{"type": "radiant", "atSlot": _scale("4d6", 0, 5)}]},
    # 20d6 fire and 20d6 bludgeoning.
    "meteor-swarm": {"type": "fire", "atSlot": {"9": "20d6"}, "also": [{"type": "bludgeoning", "atSlot": {"9": "20d6"}}]},
}

# Casting times the source data shortens to its first option.
CASTING_TIMES = {"plant-growth": "1 action or 8 hours"}


def convert(s):
    d = {
        "kind": "spell",
        "id": f"spell:{s['index']}",
        "name": s["name"],
        "source": {"pack": "srd-5.1", "book": "SRD 5.1"},
        "level": s["level"],
        "school": s["school"]["name"],
        "castingTime": CASTING_TIMES.get(s["index"], s["casting_time"]),
        "range": s["range"],
        "components": s.get("components", []),
        "duration": s["duration"],
        "concentration": s["concentration"],
        "ritual": s["ritual"],
        "classes": [c["index"] for c in s.get("classes", [])],
        "text": [fix(p) for p in s.get("desc", [])],
        "higherLevels": [fix(p) for p in s.get("higher_level", [])],
    }
    if s.get("material"):
        d["material"] = s["material"]
    a = attack_of(s)
    if a:
        d["attack"] = a
    if s.get("dc"):
        d["save"] = {"ability": ABBR[s["dc"]["dc_type"]["index"]], "onSuccess": s["dc"].get("dc_success", "none")}
    dmg = s.get("damage")
    if dmg:
        if isinstance(dmg, list):
            dmg = dmg[0]
        out = {}
        if dmg.get("damage_type"):
            out["type"] = dmg["damage_type"]["index"]
        if dmg.get("damage_at_slot_level"):
            out["atSlot"] = dmg["damage_at_slot_level"]
        if dmg.get("damage_at_character_level"):
            out["atCharacterLevel"] = dmg["damage_at_character_level"]
        if out.get("atSlot") or out.get("atCharacterLevel"):
            d["damage"] = out
    if s["index"] in DAMAGE_PARTS:
        d["damage"] = DAMAGE_PARTS[s["index"]]
    if s.get("heal_at_slot_level"):
        d["heal"] = {"atSlot": s["heal_at_slot_level"]}
    if s["index"] in SINGLE_TARGET:
        d["singleTarget"] = True
    if s.get("area_of_effect"):
        ae = s["area_of_effect"]
        d["area"] = f"{ae['size']}-foot {ae['type']}"
    return d


src = json.load(open(sys.argv[1]))
spells = sorted((convert(s) for s in src), key=lambda x: (x["level"], x["name"]))
out = "content/packs/srd-5.1/spells.json"
json.dump({"definitions": spells}, open(out, "w"), ensure_ascii=False, indent=1)
print(f"{len(spells)} spells written to {out}")
