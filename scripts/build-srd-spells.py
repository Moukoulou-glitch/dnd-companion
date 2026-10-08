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
    if s.get("heal_at_slot_level"):
        d["heal"] = {"atSlot": s["heal_at_slot_level"]}
    if s.get("area_of_effect"):
        ae = s["area_of_effect"]
        d["area"] = f"{ae['size']}-foot {ae['type']}"
    return d


src = json.load(open(sys.argv[1]))
spells = sorted((convert(s) for s in src), key=lambda x: (x["level"], x["name"]))
out = "content/packs/srd-5.1/spells.json"
json.dump({"definitions": spells}, open(out, "w"), ensure_ascii=False, indent=1)
print(f"{len(spells)} spells written to {out}")
