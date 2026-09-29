/**
 * Compétences Pokémon qui modifient le combat (Annexe 1) : Esquive, Augmentation, Résistance, Blindage naturel.
 * Les compétences sont reconnues par leur nom : « Augmentation Feu », « Résistance Type Eau », « Esquive »…
 */
import { TYPES } from "../config.mjs";

/** Coût en ENE d'une Esquive selon le niveau (Annexe 1, écran du MJ). */
export const DODGE_COST = { 1: 12, 2: 10, 3: 8, 4: 6, 5: 2 };

function slug(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Clé de Type à partir d'un texte libre (« Électrik », « type feu »…). */
function typeKey(text) {
  const s = slug(text).replace(/^type\s+/, "");
  return Object.entries(TYPES).find(([k, label]) => (k === s) || (slug(label) === s))?.[0] ?? null;
}

/** Plus haut niveau parmi les Compétences Pokémon dont le nom correspond. */
function level(actor, test) {
  if ( actor?.type !== "pokemon" ) return 0;
  return actor.itemTypes.pokeskill.filter(i => test(slug(i.name))).reduce((max, i) => Math.max(max, i.system.level), 0);
}

export function dodgeLevel(actor) {
  return level(actor, n => n === "esquive");
}

/** Bonus de dégâts de l'attaquant : Augmentation Type, Crocs, Griffes, Poings, objet tenu (+2). */
export function damageBonuses(actor, item) {
  const bonuses = [];
  const type = item.system.type;
  const name = slug(item.name);
  const typed = level(actor, n => n.startsWith("augmentation") && (typeKey(n.replace(/^augmentation\s+/, "")) === type));
  if ( typed ) bonuses.push({ label: `Augmentation ${TYPES[type]}`, value: typed });
  const body = [
    ["augmentation crocs", /croc|morsure|machouille/, "Augmentation Crocs"],
    ["augmentation griffes", /griffe/, "Augmentation Griffes"],
    ["augmentation poings", /poing/, "Augmentation Poings"]
  ];
  for ( const [skill, pattern, label] of body ) {
    const lvl = level(actor, n => n === skill);
    if ( lvl && pattern.test(name) ) bonuses.push({ label, value: lvl });
  }
  // Un seul objet renforçant le Type de l'attaque (8.7).
  const held = actor?.itemTypes?.gear?.filter(g => (g.system.category === "held") && g.system.boostType && (g.system.boostType === type)) ?? [];
  const best = held.sort((a, b) => b.system.boost - a.system.boost)[0];
  if ( best?.system.boost ) bonuses.push({ label: best.name, value: best.system.boost });
  return bonuses;
}

/** Réduction du multiplicateur de Type : 0 au niveau 1, puis −0,25 par niveau jusqu'à −1 au niveau 5. */
export function resistanceReduction(actor, attackType) {
  const lvl = level(actor, n => n.startsWith("resistance") && (typeKey(n.replace(/^resistance\s+/, "")) === attackType));
  return lvl > 1 ? Math.min((lvl - 1) * 0.25, 1) : 0;
}

/** Blindage naturel : réduit de 1 par niveau les dégâts physiques reçus. */
export function armorReduction(actor) {
  return level(actor, n => n.startsWith("blindage"));
}
