"""Recalcule effets et mécaniques particulières des capacités déjà présentes dans packs-src
(compendium Capacités et capacités embarquées dans le Pokédex), sans retélécharger le site.

Usage : python tools/update_attacks.py
"""
import glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from effects_parser import infer_chance, parse_effects, parse_special  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packs-src")


def text(html):
    return re.sub(r"<[^>]+>", "", html or "").replace("&#x27;", "'").replace("&amp;", "&")


def update(item):
    s = item["system"]
    desc = text(s.get("description", ""))
    # « 30% de baisser… » sans le mot « chance » : la probabilité est aussi celle de l'effet secondaire.
    if not s.get("effectChance"):
        s["effectChance"] = infer_chance(desc, s.get("category"))
    s["effects"] = parse_effects(desc, s.get("effectChance", 0), item["name"])
    s["special"] = parse_special(item["name"], desc)
    return item


def main():
    count = 0
    for f in glob.glob(os.path.join(ROOT, "capacites", "*.json")):
        doc = json.load(open(f, encoding="utf8"))
        json.dump(update(doc), open(f, "w", encoding="utf8"), ensure_ascii=False, indent=2)
        count += 1
    embedded = 0
    for f in glob.glob(os.path.join(ROOT, "pokedex", "*.json")):
        doc = json.load(open(f, encoding="utf8"))
        if doc.get("type") != "pokemon":
            continue
        for it in doc.get("items", []):
            if it.get("type") == "attack":
                update(it)
                embedded += 1
        json.dump(doc, open(f, "w", encoding="utf8"), ensure_ascii=False, indent=2)
    print(f"{count} capacités et {embedded} capacités embarquées mises à jour")


if __name__ == "__main__":
    main()
