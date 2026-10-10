"""Compendiums Objets et Compétences Pokémon à partir des tableaux du Recueil des Annexes (PyMuPDF).

Usage : python tools/annexes.py "chemin/vers/Hakai_Kousen_Recueil_des_Annexes_v6.pdf"
Écrit packs-src/objets et packs-src/competences.
"""
import glob, hashlib, html, json, os, re, shutil, sys, unicodedata

import fitz  # PyMuPDF

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "packs-src")
SYSTEM = "hakai-kousen"

TYPES = {"normal", "feu", "eau", "plante", "electrik", "glace", "combat", "poison", "sol", "vol", "psy",
         "insecte", "roche", "spectre", "dragon", "tenebres", "acier", "fee"}
NAME_COLS = ["Objet", "Ball", "Baie", "Spécialité", "Remède", "Équipement", "Pierre", "Sucrerie", "Contenant",
             "Appareil", "Charme", "Cristal", "Composant", "Fossile complet", "Fragment", "Aile", "Relique", "CT"]
EFFECT_COLS = ["Effet HK", "Effet", "Bonus", "Déclenchement et effet", "Usage dans HK", "Fonction",
               "Contenu ou fonction", "Évolutions compatibles", "Évolution", "Capacité ou fonction",
               "Effet complémentaire", "Effet à très courte portée", "Usage de référence"]
PRICE_COLS = ["Prix", "Prix local", "Prix de référence", "Valeur", "Valeur de rachat", "Valeur unitaire"]
# (annexe, préfixe de section) -> (dossier, catégorie d'objet)
SECTIONS = {
    (2, "1."): ("Baies", "consumable"), (2, "2."): ("Baies", "held"), (2, "3."): ("Baies", "held"),
    (2, "4."): ("Baies", "held"), (2, "5."): ("Baies", "consumable"),
    **{(3, f"{n}."): ("Poké Balls", "ball") for n in (1, 2, 3, 4, 6, 7)},
    **{(4, f"{n}."): ("Soins", "consumable") for n in range(1, 10)},
    (5, "3."): ("CT", "ct"),
    **{(6, f"{n}."): ("Objets tenus", "held") for n in range(1, 18)},
    **{(7, f"{n}."): ("Objets d'évolution", "other") for n in (1, 3, 4, 5, 6)},
    (8, "1."): ("Équipement", "equipment"), (8, "2."): ("Équipement", "professional"),
    (8, "3."): ("Équipement", "equipment"), (8, "4."): ("Équipement", "consumable"),
    (8, "5."): ("Équipement", "other"), (8, "6."): ("Équipement", "other"),
    **{(8, f"{n}."): ("Objets rares", "other") for n in (7, 8, 9, 10, 11)},
    (8, "12."): ("Entraînement", "other"), (8, "13."): ("Entraînement", "other"),
    (8, "14."): ("Équipement", "consumable"), (8, "15."): ("Équipement", "equipment"),
}
IMG = {"Baies": "icons/consumables/fruit/berry-red.webp", "Poké Balls": "icons/svg/circle.svg",
       "Soins": "icons/consumables/potions/potion-bottle-corked-red.webp", "CT": "icons/svg/book.svg",
       "Objets tenus": "icons/svg/item-bag.svg", "Objets d'évolution": "icons/svg/crystal.svg",
       "Équipement": "icons/svg/chest.svg", "Objets rares": "icons/svg/mystery-man-black.svg",
       "Entraînement": "icons/svg/upgrade.svg"}


def slug(text):
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower().strip()


def reset_folder(path):
    """Vide un dossier de sources (OneDrive peut refuser de supprimer le dossier lui-même)."""
    os.makedirs(path, exist_ok=True)
    for f in glob.glob(os.path.join(path, "*.json")):
        os.remove(f)


def make_id(*parts):
    return hashlib.sha1(":".join(parts).encode("utf8")).hexdigest()[:16]


def para(text):
    return f"<p>{html.escape(text, quote=False)}</p>" if text else ""


def extract_tables(pdf):
    """Tableaux de chaque annexe, avec la section (« N. Titre ») qui les précède."""
    out, annex, previous = [], None, {}
    for i, page in enumerate(fitz.open(pdf)):
        m = re.search(r"ANNEXE N°\s*(\d+)", page.get_text())
        if m:
            annex = int(m.group(1))
        if annex is None:
            continue
        blocks = [(b[1], b[4].strip()) for b in page.get_text("blocks")]
        for t in page.find_tables().tables:
            rows = [[(c or "").replace("\n", " ").strip() for c in r] for r in t.extract()]
            rows = [r for r in rows if any(r)]
            if len(rows) < 2:
                continue
            above = [s for y, s in blocks if y < t.bbox[1] and re.match(r"^\d+\.\s", s)]
            section = above[-1].split("\n")[0] if above else previous.get(annex, "")
            previous[annex] = section
            out.append({"annex": annex, "page": i + 1, "section": section, "header": rows[0], "rows": rows[1:]})
    return out


def find_header(table):
    rows = [table["header"]] + table["rows"]
    for i, row in enumerate(rows):
        if any(c in NAME_COLS for c in row):
            return row, rows[i + 1:]
    return None, []


def price(text):
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits and "₽" in (text or "") else 0


def use_effects(text):
    t = text.lower()
    use = {"vit": 0, "vitFull": False, "ene": 0, "eneFull": False, "cures": [], "revive": 0, "free": False}
    m = re.search(r"(?:rend|\+)\s*(\d+)\s*vit\b", t)
    if m: use["vit"] = int(m.group(1))
    if "toute la vit" in t: use["vitFull"] = True
    m = re.search(r"(?:rend|\+)\s*(\d+)\s*ene\b", t)
    if m: use["ene"] = int(m.group(1))
    if re.search(r"toute l.ene", t): use["eneFull"] = True
    if "relève" in t:
        use["revive"] = 1 if "à 1 vit" in t else 50 if "moitié" in t else 100
    if re.search(r"guérit|soigne", t):
        if "toutes les altérations" in t:
            use["cures"] = ["all"]
        else:
            for word, ids in [("paralysie", ["paralysie"]), ("brûlure", ["brulure"]), ("gel", ["gel"]), ("sommeil", ["sommeil"]),
                              ("confusion", ["confusion"]), ("empoisonnement", ["poison", "toxik"]), ("poison", ["poison", "toxik"])]:
                if word in t:
                    use["cures"] += [i for i in ids if i not in use["cures"]]
    return use


def write(folder, doc):
    name = re.sub(r"[^A-Za-z0-9]+", "_", slug(doc["name"])).strip("_")[:50]
    with open(os.path.join(folder, f"{name}_{doc['_id']}.json"), "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)


def main(pdf):
    tables = extract_tables(pdf)
    for sub in ("objets", "competences"):
        reset_folder(os.path.join(SRC, sub))
    attacks = {}
    for f in glob.glob(os.path.join(SRC, "capacites", "*.json")):
        a = json.load(open(f, encoding="utf8"))
        attacks[a["name"].lower()] = a["_id"]

    items, folders = {}, {}
    for table in tables:
        key = next((k for k in SECTIONS if k[0] == table["annex"] and table["section"].startswith(k[1] + " ")), None)
        if not key:
            continue
        folder, category = SECTIONS[key]
        header, rows = find_header(table)
        if not header:
            continue
        idx = {h: i for i, h in enumerate(header) if h}
        name_col = next(h for h in header if h in NAME_COLS)
        effect_col = next((h for h in header if h in EFFECT_COLS), None)
        price_col = next((h for h in header if h in PRICE_COLS), None)
        for row in rows:
            name = row[idx[name_col]].strip() if idx[name_col] < len(row) else ""
            if not name or len(name) < 3 or (name.isupper() and len(name) > 12):
                continue
            effect = row[idx[effect_col]].strip() if effect_col and idx[effect_col] < len(row) else ""
            extras = [f"<strong>{h}</strong> : {html.escape(row[i], quote=False)}" for h, i in idx.items()
                      if h not in (name_col, effect_col, price_col) and i < len(row) and row[i].strip()]
            system = {"category": category, "quantity": 1, "price": price(row[idx[price_col]]) if price_col else 0,
                      "charges": 0, "use": use_effects(effect), "captureMod": None, "captureCondition": "", "boostType": "", "boost": 0}
            description = para(effect) + ("<p>" + "<br>".join(extras) + "</p>" if extras else "")
            u = system["use"]
            if (folder == "Baies" and (u["vit"] or u["ene"] or u["cures"])) or name == "Jus de Baie":
                u["free"] = True
            if folder == "Poké Balls":
                cap = row[idx["Capture"]] if "Capture" in idx else row[idx["Bonus"]] if "Bonus" in idx else ""
                m = re.search(r"([+\-−]\s*\d+)", cap or effect)
                if m:
                    system["captureMod"] = int(m.group(1).replace("−", "-").replace(" ", ""))
                if "Condition" in idx:
                    system["captureCondition"] = row[idx["Condition"]]
                elif re.match(r"[+\-−]\s*\d+\s+si\b", effect):
                    system["captureCondition"] = effect
            if (table["annex"], key[1]) in ((6, "1."), (6, "2.")) and "Type" in idx:
                t = slug(row[idx["Type"]])
                if t in TYPES:
                    system["boostType"] = t
                    m = re.search(r"\+(\d+)\s*dégâts", effect)
                    system["boost"] = int(m.group(1)) if m else 2
            if folder == "CT":
                attack_id = attacks.get(name.lower())
                link = f"@UUID[Compendium.{SYSTEM}.capacites.Item.{attack_id}]{{{name}}}" if attack_id else name
                description = f"<p>Enseigne {link} à un Pokémon compatible, puis est consommée.</p>" + description
                name = f"CT {name}"
            uid = make_id("objet", slug(name))
            if uid in items:
                continue
            folders.setdefault(folder, make_id("dossier-objets", folder))
            items[uid] = {"_id": uid, "_key": f"!items!{uid}", "name": name, "type": "gear",
                          "img": IMG.get(folder, "icons/svg/item-bag.svg"), "folder": folders[folder],
                          "system": {**system, "description": description}}

    for i, (name, fid) in enumerate(folders.items()):
        write(os.path.join(SRC, "objets"), {"_id": fid, "_key": f"!folders!{fid}", "name": name, "type": "Item", "sorting": "a",
                                            "sort": (i + 1) * 1000, "color": None, "folder": None, "description": "", "flags": {}})
    for item in items.values():
        write(os.path.join(SRC, "objets"), item)

    categories = {"2.": "standard", "3.": "intermediate", "4.": "rare"}
    skills = {}
    for table in tables:
        if table["annex"] != 1:
            continue
        current = categories.get(table["section"].split(" ")[0] if table["section"] else None)
        if not current or len(table["header"]) != 2:
            continue
        for name, desc in [table["header"]] + table["rows"]:
            if not name or name in ("Compétence", "Niveau"):
                continue
            uid = make_id("competence", slug(name))
            skills.setdefault(uid, {"_id": uid, "_key": f"!items!{uid}", "name": name, "type": "pokeskill", "img": "icons/svg/upgrade.svg",
                                    "system": {"level": 1, "category": current, "progress": 0, "description": para(desc)}})
    for skill in skills.values():
        write(os.path.join(SRC, "competences"), skill)
    print(f"{len(items)} objets, {len(skills)} compétences")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
