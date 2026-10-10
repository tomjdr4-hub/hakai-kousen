"""Extraction des effets et mécaniques des capacités à partir des descriptions du site Hakai Kousen.

- parse_effects(description, effect_chance) : modifications de stats, de précision et altérations d'état.
- parse_special(name, description) : +X au dé de toucher, recul, drain, frappes multiples, charge / repos,
  KO direct, lanceur KO.
Les formulations conditionnelles (« si… », « sinon… ») sont volontairement laissées au MJ.
"""
import re

STATS = {"force": "for", "dextérité": "dex", "dexterité": "dex", "concentration": "con", "endurance": "end", "volonté": "vol"}
# Ordre important : Toxik (empoisonne gravement) avant Poison.
STATUS_PATTERNS = [
    ("toxik", r"empoisonne\w*\s+gravement|gravement empoisonn"),
    ("poison", r"empoisonn"),
    ("brulure", r"\bbrûl(e|er|es|ée|é|ées|és|ure)\b"),
    ("paralysie", r"paralys"),
    ("gel", r"\bgel(er|é|ée)\b|\bgèle\b"),
    ("sommeil", r"\bendor|s'endort"),
    ("confusion", r"\bconfus"),
    ("peur", r"\bapeur"),
]
# Capacités dont l'état n'apparaît pas dans une formulation reconnaissable.
NAMED_STATUS = {"vampigraine": "vampigraine", "attraction": "attraction", "malédiction": "malediction"}
# Phrases conditionnelles ou négatives : effet non automatisable, laissé au MJ.
SKIP = re.compile(r"\bsi\b|s'il|sinon|à chaque|lorsque|ne fonctionne|ne pourra|empêche|\bsur 1d|\bsur \d+\b|céder|"
                  r"immunis|soigne|guérit|annule|protège|\bdouble\b|au lieu", re.I)
VERB = re.compile(r"\b(baiss|diminu|réduit|augment|hauss)\w*", re.I)


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def effect(kind, target, stat="for", value=0, status="", secondary=False):
    return {"kind": kind, "target": target, "stat": stat, "value": value, "status": status, "secondary": secondary}


def parse_effects(description, effect_chance, name=""):
    effects = []
    named = NAMED_STATUS.get(name.lower())
    if named:
        return [effect("status", "target", status=named)]
    for sentence in sentences(description):
        sentence = re.split(r"\s(?:sauf|s'ils? ne)\b", sentence, flags=re.I)[0]
        low = sentence.lower()
        secondary = ("%" in low) and effect_chance > 0

        # Précision : « Baisse la précision de la cible de 10 % », « sa Précision de 10 % ».
        for m in re.finditer(r"(baiss|augment)\w*[^.]*?précision[^.]*?de\s*(\d+)\s*%", low):
            if SKIP.search(low):
                break
            clause = m.group(0)
            sign = 1 if m.group(1).startswith("augment") else -1
            target = "self" if ("lanceur" in clause or " sa précision" in clause) and "cible" not in clause else "target"
            effects.append(effect("accuracy", target, value=sign * int(m.group(2)), secondary=secondary))

        if SKIP.search(low):
            continue

        for m in VERB.finditer(low):
            rest = low[m.start():]
            num = re.search(r"\bde\s*\+?\s*(\d+)\b(?!\s*%)", rest)
            if not num:
                continue
            clause = rest[:num.start()]
            if VERB.search(clause, 1):
                continue
            stats = [code for word, code in STATS.items() if word in clause]
            if "toutes" in clause:
                stats = ["dex", "for", "con", "end", "vol"]
            if not stats:
                continue
            sign = 1 if m.group(1).startswith(("augment", "hauss")) else -1
            target = "self" if "lanceur" in clause else "target"
            for code in dict.fromkeys(stats):
                effects.append(effect("stat", target, stat=code, value=sign * int(num.group(1)), secondary=secondary))

        for status, pattern in STATUS_PATTERNS:
            if re.search(pattern, low):
                target = "self" if "lanceur" in low else "target"
                effects.append(effect("status", target, status=status, secondary=secondary))
                if status == "toxik":
                    break
    return effects


def infer_chance(description, category):
    """Chance d'effet secondaire : « 30% de chance de… », ou « 30% de baisser… » (verbe à l'infinitif)."""
    if category == "status":
        return 0
    m = (re.search(r"(\d+)\s*%\s*de chances?", description, re.I)
         or re.search(r"(\d+)\s*%\s*de (?!chance)[a-zéèêâîôû]+(?:er|ir|re)\b", description, re.I))
    return min(int(m.group(1)), 100) if m else 0


def fraction(text):
    """« 1/4 », « un dixième », « la moitié », « 75 % » -> nombre."""
    t = text.lower()
    m = re.search(r"(\d+)\s*/\s*(\d+)", t)
    if m:
        return int(m.group(1)) / int(m.group(2))
    m = re.search(r"(\d+)\s*%", t)
    if m:
        return int(m.group(1)) / 100
    words = {"moitié": 0.5, "tiers": 1 / 3, "quart": 0.25, "dixième": 0.1, "huitième": 0.125}
    return next((v for w, v in words.items() if w in t), 0)


def parse_special(name, description):
    """Mécaniques particulières d'une capacité (champ system.special)."""
    d = description.lower()
    special = {"hitBonus": 0, "recoilDamage": 0, "recoilVit": 0, "drain": 0, "hits": "", "charge": "", "ohko": False, "selfKO": False}

    m = re.search(r"ajoute \+(\d+) sur le résultat du dé 10 pour cette attaque", d)
    if m:
        special["hitBonus"] = int(m.group(1))

    # Recul : part des dégâts infligés, ou part de la VIT du lanceur à chaque coup.
    m = re.search(r"subit ([^.]*?) des dégâts infligés[^.]*recul", d)
    if m:
        special["recoilDamage"] = round(fraction(m.group(1)), 4)
    m = re.search(r"(?:perdre|retire) (un dixième|1/10)[^.]*vitalité du lanceur à chaque coup", d)
    if m:
        special["recoilVit"] = 0.1

    # Drain : le lanceur récupère une part des dégâts / de la VIT perdue par la cible.
    m = re.search(r"(récupère|regagne en vitalité|soigne le lanceur de) ([^.]*?)(?:de la vitalité (?:qu'a perdu|perdue par) la cible|des dégâts infligés)", d)
    if m and "si " not in d.split(".")[0][:12]:
        special["drain"] = round(fraction(m.group(2)), 4)

    # Frappes multiples.
    if re.search(r"(de|entre) 2 (à|et) 5 fois|2 à 5 fois", d):
        special["hits"] = "1d4+1"
    elif re.search(r"\bdeux fois\b|\b2 fois\b", d) and not re.search(r"si |dégâts subit|deux fois de suite", d):
        special["hits"] = "2"

    # Deux tours : charge au premier tour, ou repos obligatoire au tour suivant.
    if re.search(r"au premier tour[^.]*(?:attaque|frappe|envoie)[^.]*second|(?:s'envole|bondit|creuse|plonge|se recule|accumule)[^.]*premier tour"
                 r"|au premier tour le lanceur (?:plonge|s'envole|creuse|bondit)", d):
        special["charge"] = "charge"
    elif re.search(r"(?:doit|oblige le lanceur à) se reposer au tour suivant", d):
        special["charge"] = "rest-unless-miss" if "sauf si" in d else "rest"

    if re.fullmatch(r"met (les cibles|la cible) ko\.?", d.strip()):
        special["ohko"] = True
    if re.match(r"(le lanceur est mis ko|le lanceur tombe ko)", d.strip()):
        special["selfKO"] = True
    return special
