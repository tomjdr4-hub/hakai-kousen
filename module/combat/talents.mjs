/**
 * Talents dont la description du site Hakai Kousen est sans ambiguïté et chiffrée.
 * Les Talents liés au climat, au combat double ou aux situations particulières restent au MJ.
 */

/** Talents d'un acteur (noms en minuscules). */
export function talentNames(actor) {
  return actor?.type === "pokemon" ? actor.itemTypes.talent.map(t => t.name.toLowerCase()) : [];
}

/** « Augmente la puissance des attaques de type X de 50 % lorsque le Pokémon a moins d'1/3 de sa Vitalité max. » */
const PINCH = { engrais: "plante", brasier: "feu", torrent: "eau", essaim: "insecte" };

/**
 * Multiplicateur de dégâts dû aux Talents de l'attaquant, avec le libellé à afficher.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {{mult: number, label: string}[]}
 */
export function attackerTalentMultipliers(actor, item) {
  const talents = talentNames(actor);
  const out = [];
  const vit = actor.system.vit;
  for ( const [talent, type] of Object.entries(PINCH) ) {
    if ( talents.includes(talent) && (item.system.type === type) && (vit.value < vit.max / 3) ) {
      out.push({ mult: 1.5, label: talent[0].toUpperCase() + talent.slice(1) });
    }
  }
  if ( talents.includes("prognathe") && /croc|morsure|m[âa]chouille/i.test(item.name) ) out.push({ mult: 1.5, label: "Prognathe" });
  const flat = Number(item.system.damage);
  if ( talents.includes("technicien") && Number.isFinite(flat) && (flat > 0) && (flat <= 6) ) out.push({ mult: 1.5, label: "Technicien" });
  return out;
}

/**
 * Immunité de la cible due à un Talent : renvoie le nom du Talent, ou null.
 * @param {Actor} target
 * @param {Item} item
 */
export function defenderTalentImmunity(target, item) {
  const talents = talentNames(target);
  if ( talents.includes("lévitation") && (item.system.type === "sol") ) return "Lévitation";
  if ( talents.includes("torche") && (item.system.type === "feu") ) return "Torche";
  if ( talents.includes("fermeté") && item.system.special?.ohko ) return "Fermeté";
  return null;
}

/** Talents qui empêchent une altération ou un état. */
const STATUS_TALENTS = {
  brulure: "ignifu-voile", poison: "vaccin", toxik: "vaccin", paralysie: "échauffement",
  confusion: "tempo perso", peur: "attention", gel: "armumagma"
};

/** Talent qui immunise contre cet état, ou null. */
export function statusTalentImmunity(actor, status) {
  const talent = STATUS_TALENTS[status];
  return talent && talentNames(actor).includes(talent) ? talent : null;
}

/**
 * Multiplicateurs de statistiques dus aux Talents (Cran, Pied Véloce, Écaille Spéciale, Rage Poison, Agitation).
 * @param {string[]} talents
 * @param {Set<string>} statuses
 * @returns {{[stat: string]: number}}
 */
export function statTalentMultipliers(talents, statuses) {
  const major = ["brulure", "paralysie", "poison", "toxik", "gel", "sommeil"].some(s => statuses.has(s));
  const mult = {};
  if ( talents.includes("cran") && major ) mult.for = 1.5;
  if ( talents.includes("pied véloce") && major ) mult.dex = 1.5;
  if ( talents.includes("écaille spéciale") && major ) mult.end = 1.5;
  if ( talents.includes("rage poison") && (statuses.has("poison") || statuses.has("toxik")) ) mult.for = 1.5;
  if ( talents.includes("agitation") ) mult.for = 1.5;
  return mult;
}
