"""Pokédex, Capacités et Talents à partir du site hakaikousen.fr (onglet 7G, Système de base).

Usage : python tools/pokedex.py [dernier numéro, 251 par défaut] [--download]
--download remplit seulement le cache (relançable si interrompu), sans toucher aux sources.
Les pages sont mises en cache dans tools/.cache (délai de 1,5 s entre deux requêtes au site).
Écrit packs-src/pokedex, packs-src/capacites, packs-src/talents et assets/pokemon.
"""
import glob, hashlib, html, json, os, re, shutil, sys, time, unicodedata, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..")
CACHE = os.path.join(HERE, ".cache")
SRC = os.path.join(REPO, "packs-src")
ASSETS = os.path.join(REPO, "assets", "pokemon")
BASE = "https://hakaikousen.fr"
SYSTEM = "hakai-kousen"
UA = {"User-Agent": "Mozilla/5.0 (HakaiKousen Foundry compendium builder)"}
sys.path.insert(0, HERE)
from effects_parser import infer_chance, parse_effects, parse_special  # noqa: E402

TYPES = {"normal", "feu", "eau", "plante", "electrik", "glace", "combat", "poison", "sol", "vol", "psy",
         "insecte", "roche", "spectre", "dragon", "tenebres", "acier", "fee"}
CATEGORIES = {"physique": "physical", "speciale": "special", "autre": "status"}
STATS = ["dex", "for", "con", "end", "vol", "vit"]
# Générations : (nom du dossier, dernier numéro).
GENERATIONS = [("1re génération", 151), ("2e génération", 251), ("3e génération", 386), ("4e génération", 493),
               ("5e génération", 649), ("6e génération", 721), ("7e génération", 809), ("8e génération", 905), ("9e génération", 1025)]
warnings = []


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


def title(name):
    return name[:1].upper() + name[1:]


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def para(text):
    return f"<p>{html.escape(text, quote=False)}</p>" if text else ""


# ------------------------------------------------------------------ téléchargement

def cache_key(path):
    raw = urllib.parse.unquote(path)
    key = re.sub(r"[^A-Za-z0-9._-]", "_", raw)
    # Les noms non ASCII (Nidoran♀ / Nidoran♂) reçoivent un suffixe pour éviter les collisions.
    return key if raw.isascii() else key + "_" + hashlib.md5(raw.encode("utf8")).hexdigest()[:8]


def get(path, binary=False):
    os.makedirs(CACHE, exist_ok=True)
    fp = os.path.join(CACHE, cache_key(path))
    if not os.path.exists(fp):
        url = BASE + urllib.parse.quote(urllib.parse.unquote(path), safe="/")
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = r.read()
        with open(fp, "wb") as f:
            f.write(data)
        time.sleep(1.5)
    with open(fp, "rb") as f:
        data = f.read()
    return data if binary else data.decode("utf8")


# Formes alternatives retenues : Méga-Évolutions et formes régionales (même numéro que l'espèce de base).
FORM_PATTERN = re.compile(r"^m[ée]ga[\s-]|d'alola$|de galar$|de hisui$|de paldea$", re.I)


def form_kind(name):
    return "mega" if re.match(r"^m[ée]ga", name, re.I) else "regional"


def listing(limit):
    page = get("/dex/pokemon")
    entries = re.findall(r'<a href="(/dex/pokemon/[^"]+)"><img src="([^"]+)" alt="[^"]*" class="mini"><p class="capitalize">(\d+)\s*-\s*([^<]+?)</p>', page)
    chosen, forms = {}, []
    for href, img, num, name in entries:
        n = int(num)
        name = html.unescape(name.strip())
        if not (1 <= n <= limit):
            continue
        if n not in chosen:
            chosen[n] = {"num": n, "href": href, "img": img, "name": name, "form": None}
        elif FORM_PATTERN.search(name) and not any(f["name"].lower() == name.lower() for f in forms):
            forms.append({"num": n, "href": href, "img": img, "name": name, "form": form_kind(name)})
    return [chosen[n] for n in sorted(chosen)] + sorted(forms, key=lambda f: (f["num"], f["name"]))


# ------------------------------------------------------------------ lecture d'une page

def type_key(name):
    key = slug(name)
    if key not in TYPES:
        warnings.append(f"type inconnu : {name}")
    return key


def cell(row, label):
    m = re.search(rf"<small>{label}</small>\s*<span[^>]*>(.*?)</span>", row, re.S)
    return clean(m.group(1)) if m else ""


def parse_attacks(section):
    out = []
    for upper, lower in re.findall(r'<tr class="upper">(.*?)</tr>\s*<tr class="lower">(.*?)</tr>', section, re.S):
        label = re.search(r"<small>([^<]+)</small>", upper).group(1).strip()
        type_m = re.search(r'class="type type-([^"\s]+)"', upper)
        out.append({
            "label": label, "level": cell(upper, re.escape(label)), "name": cell(upper, "nom"),
            "type": type_key(html.unescape(type_m.group(1))) if type_m else "normal",
            "energy": cell(upper, "énergie"), "accuracy": cell(upper, "précision"), "range": cell(upper, "portée"),
            "category": cell(upper, "catégorie"), "damage": cell(upper, "dégâts"), "description": cell(lower, "description")
        })
    return out


def normalize_level(level):
    """« Inné », « Innée », « Départ/ 5 »… -> « Départ » ou « Départ / 5 »."""
    m = re.match(r"^(d[ée]part|inn+[ée]+e?)\s*(?:/\s*(\d+))?\s*$", level.strip(), re.I)
    if not m:
        return title(level.strip())
    return f"Départ / {m.group(2)}" if m.group(2) else "Départ"


def parse_page(text):
    start = re.search(r'<section class="contenu\s[^"]*" data-anim="1">', text).end()
    end_m = re.search(r'<section class="contenu\s[^"]*" data-anim="2">', text)
    block = text[start:end_m.start() if end_m else len(text)]
    p = {}
    m = re.search(r'<p class="nactuel capitalize">\s*<strong>\s*\d+\s*([^<]+?)</strong>\s*-\s*([^<]*?)\s*</p>', block, re.S)
    p["category"] = clean(m.group(2)) if m else ""
    m = re.search(r'<h5 class="ratio">[^<]*</h5>\s*([^<]*)<', block)
    p["ratio"] = clean(m.group(1)) if m else ""
    parts = []
    for label, content in re.findall(r'<div class="div-evo">\s*<p>(.*?)</p>(.*?)</div>\s*(?=<div class="div-evo">|</section>)', block, re.S):
        evos = [f"{title(clean(name))} ({clean(cond)})" for cond, name in re.findall(
            r'class="a-evo[^"]*">\s*<div class="condition">(.*?)</div>\s*<div class="pokemon[^"]*">(.*?)</div>', content, re.S)]
        if evos:
            parts.append(("Pré-évolution" if "pr" in slug(label)[:3] else "Évolutions") + " : " + ", ".join(evos))
    p["evolutions"] = parts
    p["talents"] = []
    # Talents de l'onglet « Système de base » ; certaines pages ne les renseignent que dans l'onglet suivant.
    sources = [block] + ([text[end_m.start():]] if end_m else [])
    for source in sources:
        talents_m = re.search(r'<table class="talents">(.*?)</table>', source, re.S)
        if talents_m:
            for upper, lower in re.findall(r'<tr class="upper">(.*?)</tr>\s*<tr class="lower">(.*?)</tr>', talents_m.group(1), re.S):
                p["talents"].append({"name": title(cell(upper, "nom")), "hidden": 'class="accent"' in upper, "description": cell(lower, "description")})
        if p["talents"]:
            break
    m = re.search(r"<strong>Taille</strong>\s*:\s*([^<]+)<strong>Poids</strong>\s*:\s*([^<]+)<", block)
    p["size"] = f"{clean(m.group(1))} / {clean(m.group(2))}" if m else ""
    types_m = re.search(r"<p>Type(.*?)</p>", block, re.S)
    p["types"] = [type_key(html.unescape(t)) for t in re.findall(r'class="type type-([^"\s]+)"', types_m.group(1))] if types_m else []
    p["stats"] = {k: int(v) for k, v in re.findall(r'stat-name stat-(\w+)">\w+</div>\s*<div class="stat-value">\s*(\d+)', block)}
    e1 = block.find('<section class="contenu-energie1">')
    e2 = block.find('<section class="contenu-energie2', e1)
    base = block[e1:e2 if e2 > 0 else len(block)]
    p["learnset"] = []
    for heading, section in re.findall(r"<h2>(.*?)</h2>(.*?)(?=<h2>|$)", base, re.S):
        heading = clean(heading).lower()
        if "expérience" in heading: source, fallback = "level", ""
        elif heading.endswith(" ct"): source, fallback = "ct", ""
        elif "oeuf" in heading: source, fallback = "egg", "Œuf"
        elif "tutorat" in heading: source, fallback = "tutor", "Tuteur"
        else: source, fallback = "other", ""
        for atk in parse_attacks(section):
            atk["source"] = source
            if atk["label"] == "nom":
                atk["level"] = fallback
            p["learnset"].append(atk)
    return p


# ------------------------------------------------------------------ documents Foundry

def attack_item(atk):
    category = CATEGORIES.get(slug(atk["category"]), "status")
    acc = atk["accuracy"]
    desc = atk["description"]
    chance = infer_chance(desc, category)
    priority = 1 if re.search(r"agi[st]? toujours en premier", desc, re.I) else \
        -1 if re.search(r"(frappe|agit|effet) en dernier", desc, re.I) and "la cible agit" not in desc.lower() else 0
    m = re.search(r"initiative (?:de )?\+?\s*(\d+)", desc, re.I)
    return {
        "name": atk["name"], "type": "attack", "img": "icons/svg/explosion.svg",
        "system": {
            "type": atk["type"], "category": category,
            "energy": int(atk["energy"]) if atk["energy"].isdigit() else 0, "range": atk["range"],
            "accuracy": int(acc) if acc.isdigit() else (100 if category != "status" else 0),
            "sure": (not acc.isdigit()) and category != "status",
            "damage": atk["damage"] if atk["damage"] not in ("", "0", "-") else "",
            "effectChance": chance, "priority": priority, "initiativeBonus": int(m.group(1)) if m else 0,
            "recharge": "", "xpCost": 0,
            "effects": parse_effects(desc, chance, atk["name"]), "special": parse_special(atk["name"], desc),
            "description": para(desc)
        }
    }


def write_doc(folder, doc):
    os.makedirs(folder, exist_ok=True)
    name = re.sub(r"[^A-Za-z0-9]+", "_", slug(doc["name"])).strip("_")
    with open(os.path.join(folder, f"{name}_{doc['_id']}.json"), "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)


def download(entries):
    """Met en cache toutes les pages et images avant toute écriture (relançable : le cache est conservé)."""
    for n, entry in enumerate(entries, 1):
        get(entry["href"])
        get(entry["img"], binary=True)
        if n % 25 == 0:
            print(f"  {n}/{len(entries)} en cache", file=sys.stderr, flush=True)


def main(limit, download_only=False):
    entries = listing(limit)
    print(f"{len(entries)} Pokémon à traiter", file=sys.stderr)
    download(entries)
    if download_only:
        return print("Cache complet.")
    for sub in ("pokedex", "capacites", "talents"):
        reset_folder(os.path.join(SRC, sub))
    os.makedirs(ASSETS, exist_ok=True)
    attacks, talents, pokemons = {}, {}, []
    for entry in entries:
        page = parse_page(get(entry["href"]))
        page.update(entry)
        pokemons.append(page)
        for atk in page["learnset"]:
            attacks.setdefault(atk["name"].lower(), attack_item(atk))
        for t in page["talents"]:
            talents.setdefault(t["name"].lower(), t)

    uuids = {}
    for key, item in attacks.items():
        item["_id"] = make_id("capacite", key)
        item["_key"] = f"!items!{item['_id']}"
        uuids[key] = f"Compendium.{SYSTEM}.capacites.Item.{item['_id']}"
        write_doc(os.path.join(SRC, "capacites"), item)
    talent_uuids = {}
    for key, t in talents.items():
        _id = make_id("talent", key)
        talent_uuids[key] = f"Compendium.{SYSTEM}.talents.Item.{_id}"
        write_doc(os.path.join(SRC, "talents"), {"_id": _id, "_key": f"!items!{_id}", "name": t["name"], "type": "talent",
                                                 "img": "icons/svg/aura.svg", "system": {"hidden": False, "description": para(t["description"])}})

    folder_ids = [make_id("folder", label) for label, _ in GENERATIONS]
    form_folders = {"mega": ("Méga-Évolutions", make_id("folder", "mega")), "regional": ("Formes régionales", make_id("folder", "regional"))}
    used_gens, used_forms = set(), set()
    for p in pokemons:
        num = f"{p['num']:03d}"
        name = title(p["name"])
        gen = next(i for i, (_, last) in enumerate(GENERATIONS) if p["num"] <= last)
        if p["form"]:
            # Une forme partage le numéro de son espèce : identifiant et image propres à la forme.
            key = re.sub(r"[^a-z0-9]+", "-", slug(name)).strip("-")
            actor_id = make_id("pokemon", num, key)
            file = f"{num}-{key}"
            folder = form_folders[p["form"]][1]
            used_forms.add(p["form"])
        else:
            actor_id = make_id("pokemon", num)
            file = num
            folder = folder_ids[gen]
            used_gens.add(gen)
        img = f"systems/{SYSTEM}/assets/pokemon/{file}.png"
        with open(os.path.join(ASSETS, f"{file}.png"), "wb") as f:
            f.write(get(p["img"], binary=True))
        stats = {s: {"base": p["stats"].get(s, 0), "iv": 0, "ev": 0, "temp": 0} for s in STATS}
        stats["ene"] = {"base": 50, "iv": 0, "ev": 0, "temp": 0}
        items = []
        for atk in p["learnset"]:
            if atk["source"] == "level" and normalize_level(atk["level"]).startswith("Départ"):
                item = json.loads(json.dumps(attacks[atk["name"].lower()]))
                item["_id"] = make_id("pokemon-item", num, atk["name"].lower())
                item["_key"] = f"!actors.items!{actor_id}.{item['_id']}"
                item["_stats"] = {"compendiumSource": uuids[atk["name"].lower()]}
                if not any(i["name"] == item["name"] for i in items):
                    items.append(item)
        write_doc(os.path.join(SRC, "pokedex"), {
            "_id": actor_id, "_key": f"!actors!{actor_id}", "name": name, "type": "pokemon", "img": img,
            "system": {
                "species": name, "number": num,
                "types": {"primary": p["types"][0] if p["types"] else "normal", "secondary": p["types"][1] if len(p["types"]) > 1 else ""},
                "stats": stats,
                "vit": {"value": p["stats"].get("vit", 0), "max": p["stats"].get("vit", 0)},
                "ene": {"value": 50, "max": 50},
                "details": {"heightWeight": p["size"]},
                "speciesData": {
                    "category": f"Pokémon {title(p['category'])}" if p["category"] else "",
                    "ratio": p["ratio"], "evolutions": " · ".join(p["evolutions"]),
                    "talents": [{"name": t["name"], "uuid": talent_uuids[t["name"].lower()], "hidden": t["hidden"]} for t in p["talents"]],
                    "learnset": [{"source": a["source"], "level": normalize_level(a["level"]), "name": a["name"],
                                  "type": a["type"], "uuid": uuids[a["name"].lower()]} for a in p["learnset"]]
                }
            },
            "items": items, "effects": [],
            "prototypeToken": {"name": name, "texture": {"src": img}, "actorLink": False, "disposition": 0},
            "folder": folder, "sort": p["num"] * 100 + (1 if p["form"] else 0), "flags": {}
        })
    folders = [(GENERATIONS[i][0], folder_ids[i], (i + 1) * 100000) for i in sorted(used_gens)]
    folders += [(form_folders[k][0], form_folders[k][1], 900000 + n) for n, k in enumerate(sorted(used_forms))]
    for label, fid, sort in folders:
        write_doc(os.path.join(SRC, "pokedex"), {"_id": fid, "_key": f"!folders!{fid}", "name": label, "type": "Actor", "sorting": "m",
                                                 "sort": sort, "color": None, "folder": None, "description": "", "flags": {}})
    print(f"{len(pokemons)} Pokémon, {len(attacks)} capacités, {len(talents)} talents")
    for w in sorted(set(warnings)):
        print("ATTENTION", w)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(int(args[0]) if args else 251, download_only="--download" in sys.argv)
