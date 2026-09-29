/**
 * Données de règles Hakai Kousen (Manuel du Joueur v16).
 */

/** Caractéristiques testables (la VIT ne sert pas aux tests de Caractéristique). */
export const ATTRIBUTES = {
  dex: { label: "Dextérité", abbr: "DEX" },
  for: { label: "Force", abbr: "FOR" },
  con: { label: "Concentration", abbr: "CON" },
  end: { label: "Endurance", abbr: "END" },
  vol: { label: "Volonté", abbr: "VOL" }
};

/** Statistiques Pokémon et gain par IV / EV (4.3, 4.4). */
export const POKEMON_STATS = {
  dex: { label: "Dextérité", abbr: "DEX", gain: 1 },
  for: { label: "Force", abbr: "FOR", gain: 1 },
  con: { label: "Concentration", abbr: "CON", gain: 1 },
  end: { label: "Endurance", abbr: "END", gain: 1 },
  vol: { label: "Volonté", abbr: "VOL", gain: 1 },
  vit: { label: "Vitalité", abbr: "VIT", gain: 2 },
  ene: { label: "Énergie", abbr: "ENE", gain: 3 }
};

/** Compétences du Dresseur (3.9.1). */
export const SKILLS = {
  adresse: "Adresse",
  art: "Art",
  artisanat: "Artisanat",
  athletisme: "Athlétisme",
  bricolage: "Bricolage",
  charisme: "Charisme",
  combat: "Combat",
  cuisine: "Cuisine",
  detection: "Détection",
  discretion: "Discrétion",
  minage: "Minage",
  peche: "Pêche",
  perspicacite: "Perspicacité",
  pilotage: "Pilotage",
  survie: "Survie"
};

/** Connaissances du Dresseur (3.9.2). */
export const KNOWLEDGES = {
  chimie: "Chimie & Pharmacie",
  droit: "Droit & Société",
  economie: "Économie & Commerce",
  histoire: "Histoire & Légendes",
  informatique: "Informatique",
  medecineHumaine: "Médecine Humaine",
  medecinePokemon: "Médecine Pokémon",
  nature: "Nature",
  technologie: "Technologie",
  zoologie: "Zoologie"
};

/** Difficulté d'un test de Caractéristique : taille du dé (2.2). */
export const ATTRIBUTE_DIFFICULTIES = {
  6: "Normale (D6)",
  8: "Difficile (D8)",
  10: "Très difficile (D10)",
  12: "Extrême (D12)",
  20: "Exceptionnelle (D20)"
};

/** Difficulté d'un test de Compétence / Connaissance : seuil (2.4). */
export const POOL_DIFFICULTIES = {
  3: "Très facile (3+)",
  4: "Facile (4+)",
  5: "Standard (5+)",
  6: "Soutenue (6+)",
  7: "Difficile (7+)",
  8: "Très difficile (8+)",
  9: "Extrême (9+)",
  10: "Exceptionnelle (10)"
};

export const TYPES = {
  normal: "Normal",
  feu: "Feu",
  eau: "Eau",
  plante: "Plante",
  electrik: "Électrik",
  glace: "Glace",
  combat: "Combat",
  poison: "Poison",
  sol: "Sol",
  vol: "Vol",
  psy: "Psy",
  insecte: "Insecte",
  roche: "Roche",
  spectre: "Spectre",
  dragon: "Dragon",
  tenebres: "Ténèbres",
  acier: "Acier",
  fee: "Fée"
};

/** Efficacité des types : attaquant -> défenseur -> multiplicateur (1 si absent). */
export const TYPE_CHART = {
  normal: { roche: 0.5, spectre: 0, acier: 0.5 },
  feu: { feu: 0.5, eau: 0.5, plante: 2, glace: 2, insecte: 2, roche: 0.5, dragon: 0.5, acier: 2 },
  eau: { feu: 2, eau: 0.5, plante: 0.5, sol: 2, roche: 2, dragon: 0.5 },
  electrik: { eau: 2, electrik: 0.5, plante: 0.5, sol: 0, vol: 2, dragon: 0.5 },
  plante: { feu: 0.5, eau: 2, plante: 0.5, poison: 0.5, sol: 2, vol: 0.5, insecte: 0.5, roche: 2, dragon: 0.5, acier: 0.5 },
  glace: { feu: 0.5, eau: 0.5, plante: 2, glace: 0.5, sol: 2, vol: 2, dragon: 2, acier: 0.5 },
  combat: { normal: 2, glace: 2, poison: 0.5, vol: 0.5, psy: 0.5, insecte: 0.5, roche: 2, spectre: 0, tenebres: 2, acier: 2, fee: 0.5 },
  poison: { plante: 2, poison: 0.5, sol: 0.5, roche: 0.5, spectre: 0.5, acier: 0, fee: 2 },
  sol: { feu: 2, electrik: 2, plante: 0.5, poison: 2, vol: 0, insecte: 0.5, roche: 2, acier: 2 },
  vol: { electrik: 0.5, plante: 2, combat: 2, insecte: 2, roche: 0.5, acier: 0.5 },
  psy: { combat: 2, poison: 2, psy: 0.5, tenebres: 0, acier: 0.5 },
  insecte: { feu: 0.5, plante: 2, combat: 0.5, poison: 0.5, vol: 0.5, psy: 2, spectre: 0.5, tenebres: 2, acier: 0.5, fee: 0.5 },
  roche: { feu: 2, glace: 2, combat: 0.5, sol: 0.5, vol: 2, insecte: 2, acier: 0.5 },
  spectre: { normal: 0, psy: 2, spectre: 2, tenebres: 0.5 },
  dragon: { dragon: 2, acier: 0.5, fee: 0 },
  tenebres: { combat: 0.5, psy: 2, spectre: 2, tenebres: 0.5, fee: 0.5 },
  acier: { feu: 0.5, eau: 0.5, electrik: 0.5, glace: 2, roche: 2, acier: 0.5, fee: 2 },
  fee: { feu: 0.5, combat: 2, poison: 0.5, dragon: 2, tenebres: 2, acier: 0.5 }
};

/** Natures (4.5) : stat favorisée / défavorisée. */
export const NATURES = {
  hardi: { label: "Hardi" },
  solo: { label: "Solo", plus: "for", minus: "end" },
  brave: { label: "Brave", plus: "for", minus: "dex" },
  rigide: { label: "Rigide", plus: "for", minus: "con" },
  mauvais: { label: "Mauvais", plus: "for", minus: "vol" },
  assure: { label: "Assuré", plus: "end", minus: "for" },
  docile: { label: "Docile" },
  relax: { label: "Relax", plus: "end", minus: "dex" },
  malin: { label: "Malin", plus: "end", minus: "con" },
  lache: { label: "Lâche", plus: "end", minus: "vol" },
  timide: { label: "Timide", plus: "dex", minus: "for" },
  presse: { label: "Pressé", plus: "dex", minus: "end" },
  serieux: { label: "Sérieux" },
  jovial: { label: "Jovial", plus: "dex", minus: "con" },
  naif: { label: "Naïf", plus: "dex", minus: "vol" },
  modeste: { label: "Modeste", plus: "con", minus: "for" },
  doux: { label: "Doux", plus: "con", minus: "end" },
  discret: { label: "Discret", plus: "con", minus: "dex" },
  pudique: { label: "Pudique" },
  foufou: { label: "Foufou", plus: "con", minus: "vol" },
  calme: { label: "Calme", plus: "vol", minus: "for" },
  gentil: { label: "Gentil", plus: "vol", minus: "end" },
  malpoli: { label: "Malpoli", plus: "vol", minus: "dex" },
  prudent: { label: "Prudent", plus: "vol", minus: "con" },
  bizarre: { label: "Bizarre" }
};

export const ATTACK_CATEGORIES = {
  physical: "Physique",
  special: "Spéciale",
  status: "Statut"
};

/** Catégories de Compétences Pokémon et coût XP par niveau actuel (4.8). */
export const POKESKILL_CATEGORIES = {
  standard: { label: "Standard", cost: 10 },
  intermediate: { label: "Intermédiaire", cost: 20 },
  rare: { label: "Rare", cost: 30 }
};

export const GEAR_CATEGORIES = {
  equipment: "Équipement & voyage",
  professional: "Matériel professionnel",
  consumable: "Soins & consommables",
  ball: "Balls & objets libres",
  held: "Objet tenu",
  other: "Divers"
};

/**
 * Altérations d'état et états de combat (5.9, 5.10).
 * `major` : un seul problème de statut majeur à la fois. `immune` : types qui ne peuvent pas le subir.
 */
export const STATUSES = {
  brulure: { label: "Brûlure", img: "icons/svg/fire.svg", major: true, immune: ["feu"],
    rule: "Perd 1/20 de sa VIT max par tour (minimum 1). FOR divisée par 2." },
  paralysie: { label: "Paralysie", img: "icons/svg/lightning.svg", major: true, immune: ["electrik"],
    rule: "DEX divisée par 2. Chaque tour, 1-2-3 sur 1D10 : ne peut pas agir." },
  poison: { label: "Poison", img: "icons/svg/poison.svg", major: true, immune: ["poison", "acier"],
    rule: "Perd 1/10 de sa VIT max par tour (minimum 1)." },
  toxik: { label: "Toxik", img: "icons/svg/biohazard.svg", major: true, immune: ["poison", "acier"],
    rule: "Perd 1/20 de sa VIT max (minimum 1) × le nombre de tours : ×1, ×2, ×3…" },
  gel: { label: "Gel", img: "icons/svg/frozen.svg", major: true, immune: ["glace"],
    rule: "Chaque tour, 9-10 sur 1D10 : dégèle. Une attaque Feu adaptée peut aussi le dégeler." },
  sommeil: { label: "Sommeil", img: "icons/svg/sleep.svg", major: true, immune: [],
    rule: "Endormi : suit le fonctionnement HK du Sommeil." },
  confusion: { label: "Confusion", img: "icons/svg/daze.svg", major: false, immune: [],
    rule: "Sort sur 10, puis 8-10, puis 6-10, puis fin. Tant que confus, 1-2-3 sur 1D10 : se frappe (1/10 de sa VIT actuelle) et perd son action." },
  peur: { label: "Apeuré", img: "icons/svg/terror.svg", major: false, immune: [],
    rule: "Ne peut pas agir ce tour-ci." }
};

/** Réaction d'un Pokémon qui échoue son test de Dressage (4.11). */
export const DRESSAGE_FAILURES = [
  { max: 2, text: "Cherche à fuir ou peut attaquer son Dresseur." },
  { max: 4, text: "Ne fait rien." },
  { max: 7, text: "Peut utiliser une attaque au hasard de sa liste, surtout s'il est menacé." }
];

/** Colonnes de la Table unique (précision en %). */
export const TABLE_UNIQUE_COLUMNS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15];

/** Table unique (2.8) : marge -> seuil à atteindre sur 1D10, par colonne de précision. */
export const TABLE_UNIQUE = {
  "-10": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-9": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-8": [9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-7": [9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-6": [8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-5": [8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  "-4": [7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10],
  "-3": [7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10],
  "-2": [6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10],
  "-1": [6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10],
  "0": [6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9],
  "1": [6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9],
  "2": [5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8],
  "3": [5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8],
  "4": [4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7],
  "5": [4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7],
  "6": [3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6],
  "7": [3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6],
  "8": [2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
  "9": [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6],
  "10": [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5],
  "11": [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5],
  "12": [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
  "13": [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  "14": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
  "15": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3],
  "16": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
  "17": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  "18": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  "19": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
};

/**
 * Seuil de la Table unique pour une marge et une précision données.
 * Marges hors tableau ramenées à -10 / +19, précisions à 15 % / 100 %.
 * @param {number} margin    Caractéristique offensive - défensive
 * @param {number} accuracy  Précision en %
 * @returns {number}
 */
export function tableUniqueThreshold(margin, accuracy) {
  const m = Math.min(Math.max(Math.trunc(margin), -10), 19);
  const acc = Math.min(Math.max(accuracy, 15), 100);
  // Une précision intermédiaire utilise la colonne de 5 % inférieure.
  const column = TABLE_UNIQUE_COLUMNS.findIndex(c => c <= acc);
  return TABLE_UNIQUE[m][column];
}

/**
 * Multiplicateur d'efficacité d'un type d'attaque contre les types du défenseur.
 * @param {string} attackType
 * @param {string[]} defenderTypes
 * @returns {number}
 */
export function typeEffectiveness(attackType, defenderTypes) {
  const row = TYPE_CHART[attackType] ?? {};
  return defenderTypes.filter(Boolean).reduce((mult, t) => mult * (row[t] ?? 1), 1);
}

export const HK = {
  ATTRIBUTES, POKEMON_STATS, SKILLS, KNOWLEDGES, ATTRIBUTE_DIFFICULTIES, POOL_DIFFICULTIES,
  TYPES, TYPE_CHART, NATURES, ATTACK_CATEGORIES, POKESKILL_CATEGORIES, GEAR_CATEGORIES,
  STATUSES, DRESSAGE_FAILURES, TABLE_UNIQUE_COLUMNS, TABLE_UNIQUE
};
