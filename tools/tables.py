"""Compendium de tables aléatoires (Manuel du Joueur 4.5, 4.8, 6.7 ; Manuel du MJ 4.5 ; écran du MJ).

Usage : python tools/tables.py [--voyage <Aide_MJ_Voyage_Sevaro_Porto_Marinada.pdf>]
Écrit packs-src/tables. Avec --voyage, ajoute les tables D100 des sous-zones de l'aide de voyage (dossier dédié).
"""
import glob, hashlib, html, json, os, re, sys, unicodedata

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packs-src", "tables")


def make_id(*parts):
    return hashlib.sha1(":".join(parts).encode("utf8")).hexdigest()[:16]


def slug(text):
    text = unicodedata.normalize("NFD", text)
    return re.sub(r"[^a-z0-9]+", "_", "".join(c for c in text if unicodedata.category(c) != "Mn").lower()).strip("_")


def table(name, formula, description, rows, img="icons/svg/d20-black.svg"):
    tid = make_id("table", name)
    results = []
    for i, (lo, hi, text) in enumerate(rows):
        rid = make_id("result", name, str(i))
        results.append({"_id": rid, "_key": f"!tables.results!{tid}.{rid}", "type": "text", "name": text[:250],
                        "description": text, "img": img, "weight": 1, "range": [lo, hi], "drawn": False, "flags": {}})
    return {"_id": tid, "_key": f"!tables!{tid}", "name": name, "img": img, "description": description, "formula": formula,
            "replacement": True, "displayRoll": True, "results": results, "folder": None, "sort": 0, "flags": {}}


NATURES = [("Hardi", None, None), ("Solo", "FOR", "END"), ("Brave", "FOR", "DEX"), ("Rigide", "FOR", "CON"),
           ("Mauvais", "FOR", "VOL"), ("Assuré", "END", "FOR"), ("Docile", None, None), ("Relax", "END", "DEX"),
           ("Malin", "END", "CON"), ("Lâche", "END", "VOL"), ("Timide", "DEX", "FOR"), ("Pressé", "DEX", "END"),
           ("Sérieux", None, None), ("Jovial", "DEX", "CON"), ("Naïf", "DEX", "VOL"), ("Modeste", "CON", "FOR"),
           ("Doux", "CON", "END"), ("Discret", "CON", "DEX"), ("Pudique", None, None), ("Foufou", "CON", "VOL"),
           ("Calme", "VOL", "FOR"), ("Gentil", "VOL", "END"), ("Malpoli", "VOL", "DEX"), ("Prudent", "VOL", "CON"),
           ("Bizarre", None, None)]

OLIVERAIES = """01–08|Olivini - 1D4 près d’une exploitation
09–15|Granivol - 1D4 portés par le vent
16–20|ÉVÉNEMENT - Pokémon blessé : relancer jusqu’à obtenir une espèce ordinaire
21–26|Pâtachiot
27–30|ÉVÉNEMENT - Pokémon affamé qui commence à suivre le groupe
31–35|Pohm
36–41|Rongourmand
42–44|BRACONNIERS - La Reine volée : Apireine capturée pour sa Gelée royale
45–50|Manglouton
51–55|Wattouat - petit troupeau
56–57|HORDE - Wattouat traversant un chemin agricole
58–62|Passerouge
63–67|Étourmi
68–69|HORDE - Apitrini en panique
70–73|Crikzik
74–75|NID - Ruche ancienne installée dans un olivier creux
76–79|Tournicoton
80–82|Apitrini
83–84|NID - Terrier de Rocabot en lisière rocheuse
85–86|Grondogue
87–88|Makuhita
89–90|DOMINANT - Apireine des Grandes Oliveraies
91–92|Pichu ou Toudoudou
93|Pikachu
94–95|ABERRANT - Gribouraigne aux pigments instables
96|Ptiravi
97|Pokémon Téracristallisé
98|Apireine
99|Évoli - très rare
100|Pokémon chromatique : relancer jusqu’à obtenir une espèce ordinaire"""


VOYAGE_FOLDER = "Voyage Sévaro → Porto Marinada"
RANGE = re.compile(r"^(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?$")
NOISE = re.compile(r"^(=== p\d+|HAKAI KOUSEN\s+•|© 20\d\d)")


def zone_title(text):
    """« ZONE SUD N°2 » → « Zone Sud n°2 » ; « DÉSERT RÔTISSABLE » → « Désert Rôtissable »."""
    words = text.strip().title().split()
    return " ".join(w.replace("N°", "n°") for w in words)


def voyage_tables(pdf):
    """Tables D100 de l'aide « Voyage de Sévaro à Porto Marinada » : une table par sous-zone (A., B., C.…)."""
    import fitz
    lines = []
    for page in fitz.open(pdf):
        lines += [l.strip() for l in page.get_text().splitlines()]
    lines = [l for l in lines if l and not NOISE.match(l)]
    tables, zone, i = [], "", 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^FICHE \d+\s*[—-]\s*(.+)$", line)
        if m:
            zone = zone_title(m.group(1))
            i += 1
            continue
        m = re.match(r"^([A-H])\.\s+(.+)$", line)
        if not (m and zone):
            i += 1
            continue
        sub = m.group(2).strip()
        i += 1
        intro = []
        while i < len(lines) and lines[i].lower() != "d100":
            intro.append(lines[i])
            i += 1
        i += 2  # « d100 » puis « RENCONTRE / ÉVÉNEMENT »
        rows = []
        while i < len(lines):
            r = RANGE.match(lines[i])
            if not r:
                break
            lo = int(r.group(1))
            hi = int(r.group(2) or lo)
            i += 1
            text = []
            while i < len(lines) and not RANGE.match(lines[i]) and lines[i] != "Notes MJ"                     and not re.match(r"^([A-H])\.\s+", lines[i]) and not lines[i].startswith("FICHE "):
                text.append(lines[i])
                i += 1
            label = " ".join(text).replace(" — ", " - ")
            rows.append((lo, hi, label))
            if hi >= 100:
                break
        notes = []
        if i < len(lines) and lines[i] == "Notes MJ":
            i += 1
            while i < len(lines) and not re.match(r"^([A-H])\.\s+", lines[i]) and not lines[i].startswith("FICHE "):
                notes.append(lines[i])
                i += 1
        if not rows or rows[-1][1] != 100:
            print(f"  table incomplète ignorée : {zone} / {sub}")
            continue
        description = f"<p><strong>{html.escape(zone)}</strong> — {html.escape(' '.join(intro))}</p>"
        description += "<p>Aide du MJ « Voyage de Sévaro à Porto Marinada ». Sur un 100 : Pokémon chromatique, relancer pour l’espèce.</p>"
        if notes:
            description += "<p><strong>Notes MJ</strong></p>" + "".join(f"<p>{html.escape(n)}</p>" for n in notes)
        tables.append(table(f"Rencontres : {zone} — {sub}", "1d100", description, rows))
    return tables


def ranges(text):
    rows = []
    for line in text.splitlines():
        r, label = line.split("|")
        parts = [int(x) for x in re.split(r"[–-]", r)]
        rows.append((parts[0], parts[-1], label))
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.json")):
        os.remove(f)
    tables = [
        table("Nature du Pokémon", "1d100",
              "<p>Manuel du Joueur 4.5 : les 25 Natures occupent chacune quatre résultats. +1 à la statistique favorisée, −1 à la défavorisée.</p>",
              [(i * 4 + 1, i * 4 + 4, f"{n} ({'+' + p + ' / −' + m if p else 'neutre'})") for i, (n, p, m) in enumerate(NATURES)]),
        table("Compétence initiale", "1d10",
              "<p>Manuel du Joueur 4.8.1 : la Compétence obtenue commence au niveau 1. Le choix précis se fait dans l’Annexe 1 en respectant l’espèce.</p>",
              [(1, 1, "Aucune Compétence initiale."), (2, 4, "Une Compétence Standard."), (5, 8, "Une Compétence Intermédiaire."),
               (9, 9, "Une Compétence Rare, de préférence une Résistance : [Type]."), (10, 10, "Une Compétence Rare, de préférence une Augmentation : [Type].")]),
        table("Attaque supplémentaire inhabituelle", "1d10",
              "<p>Manuel du Joueur 4.8.2 : le MJ choisit ensuite la source (CT, reproduction, Maître de Capacités…) puis l’attaque parmi celles compatibles avec l’espèce.</p>",
              [(1, 7, "Aucune attaque supplémentaire."), (8, 10, "Le Pokémon connaît une attaque supplémentaire.")]),
        table("Réaction rapide d’un Pokémon", "1d10",
              "<p>Écran du MJ : le comportement doit rester cohérent avec l’espèce, l’environnement et la scène. Cette table sert seulement lorsque le MJ hésite.</p>",
              [(1, 2, "Fuit ou se cache"), (3, 4, "Observe avec méfiance"), (5, 6, "Protège ressource, petit ou territoire"),
               (7, 8, "Curieux, approche prudemment"), (9, 9, "En difficulté, cherche de l’aide"), (10, 10, "Situation particulière liée au lieu")]),
        table("Minage : trouvaille", "1d100",
              "<p>Manuel du Joueur 6.7 : une session demande une demi-journée et produit une seule trouvaille. "
              "Niv. 1 : 1D100 · Niv. 2 : minimum 11 · Niv. 3 : 2D100, garder le meilleur · Niv. 4 : 2D100, minimum 21 · Niv. 5 : 3D100, minimum 31.</p>",
              [(1, 10, "Gravats ou roche sans valeur notable"), (11, 20, "Minerais communs"), (21, 30, "Quartz, petits cristaux ou minéraux décoratifs"),
               (31, 40, "Minerais métalliques exploitables"), (41, 50, "Minerais ou cristaux de bonne qualité"),
               (51, 60, "Matériaux recherchés par certains artisans"), (61, 69, "Fragment de gemme ou matériau particulièrement intéressant"),
               (70, 79, "Pierre précieuse"), (80, 89, "Pierre évolutive brute à raffiner"), (90, 100, "Fossile")]),
        table("Rencontres : Grandes Oliveraies (exemple)", "1d100",
              "<p>Manuel du MJ 4.5 : exemple de table de sous-zone. Environ 74 résultats de Pokémon ordinaires, environ 25 événements répartis sur 01–99, "
              "et le 100 toujours réservé au Pokémon chromatique (relancer pour l’espèce). Dupliquez cette table pour créer vos zones.</p>",
              ranges(OLIVERAIES)),
        table("Activité professionnelle : type", "1d20",
              "<p>Manuel du MJ 6.10 : le joueur peut lancer 1D20 pour sélectionner une proposition. Le personnage reste libre de refuser.</p>",
              [(1, 5, "Travail courant et relativement sûr."), (6, 10, "Contrat ordinaire avec difficulté."),
               (11, 14, "Occasion avantageuse ou client important."), (15, 17, "Complication ou demande inhabituelle."),
               (18, 19, "Proposition risquée ou douteuse."), (20, 20, "Occasion exceptionnelle ou aventure.")]),
        table("Activités du Dresseur", "1d20",
              "<p>Manuel du MJ 6.10 (exemple) : proposition · difficulté · gain brut. Les frais de Balls, soins, transport et matériel "
              "sont retirés ; l’activité n’accorde pas automatiquement d’XP Pokémon.</p>",
              [(i + 1, i + 1, f"{p} · difficulté {d} · {g}") for i, (p, d, g) in enumerate([
                  ("Initier un enfant au combat Pokémon", "4", "200 ₽"), ("Superviser un combat amical", "4", "250 ₽"),
                  ("Organiser une séance d’exercice", "5", "300 ₽"), ("Retrouver un Pokémon domestique égaré", "5", "300–400 ₽"),
                  ("Enseigner l’approche d’un Pokémon sauvage", "5", "300 ₽"), ("Accompagner un groupe sur une route locale", "5", "400 ₽"),
                  ("Remplacer l’animateur d’un club", "6", "500 ₽"), ("Socialiser un Pokémon récemment adopté", "6", "400–500 ₽"),
                  ("Préparer un premier combat officiel", "6", "500 ₽"), ("Arbitrer un tournoi amateur", "6", "400–600 ₽"),
                  ("Rechercher une espèce commune", "6", "500–700 ₽"), ("Examiner une équipe et sa stratégie", "7", "600 ₽"),
                  ("Guider l’observation d’une espèce peu commune", "7", "600–800 ₽"), ("Tester du matériel d’entraînement", "7", "700 ₽"),
                  ("Le client cache l’agressivité de son Pokémon", "7", "700–900 ₽"), ("Combat clandestin bien rémunéré", "7", "1 000–1 500 ₽"),
                  ("Fausse annonce, piège ou escroquerie", "8", "0 ₽, sauf récupération"), ("Capture douteuse d’une espèce protégée", "8", "jusqu’à 1 500 ₽"),
                  ("Tournoi local avec prix", "variable", "jusqu’à 1 500 ₽"), ("Pokémon affolé menaçant des habitants", "8 à 10", "1 000–2 000 ₽ ou autre")])]),
    ]
    if "--voyage" in sys.argv:
        pdf = sys.argv[sys.argv.index("--voyage") + 1]
        fid = make_id("dossier-tables", VOYAGE_FOLDER)
        folder = {"_id": fid, "_key": f"!folders!{fid}", "name": VOYAGE_FOLDER, "type": "RollTable", "sorting": "a",
                  "sort": 0, "color": None, "folder": None, "description": "", "flags": {}}
        with open(os.path.join(OUT, f"dossier_voyage_{fid}.json"), "w", encoding="utf8") as f:
            json.dump(folder, f, ensure_ascii=False, indent=2)
        for t in voyage_tables(pdf):
            t["folder"] = fid
            tables.append(t)
    for t in tables:
        with open(os.path.join(OUT, f"{slug(t['name'])}_{t['_id']}.json"), "w", encoding="utf8") as f:
            json.dump(t, f, ensure_ascii=False, indent=2)
    print(len(tables), "tables")


if __name__ == "__main__":
    main()
