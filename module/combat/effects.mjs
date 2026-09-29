/**
 * Application des dégâts, des modifications de stats et des altérations d'état.
 * Si l'utilisateur ne possède pas la cible, la demande est transmise au MJ actif.
 */
import { ATTRIBUTES, STATUSES } from "../config.mjs";

const SOCKET = "system.hakai-kousen";

/** Libellé court d'un effet : « FOR −1 », « Toxik ». */
export function effectLabel(effect) {
  if ( effect.kind === "status" ) return STATUSES[effect.status]?.label ?? effect.status;
  const sign = effect.value > 0 ? "+" : "−";
  return `${ATTRIBUTES[effect.stat]?.abbr ?? effect.stat} ${sign}${Math.abs(effect.value)}`;
}

/** Transmet au MJ actif si l'utilisateur ne possède pas l'acteur. Renvoie true si transmis. */
function relayToGM(actor, payload) {
  if ( actor.isOwner ) return false;
  if ( !game.users.activeGM ) {
    ui.notifications.warn("Aucun MJ connecté pour appliquer cet effet.");
    return true;
  }
  game.socket.emit(SOCKET, { ...payload, userId: game.user.id });
  ui.notifications.info(`Demande envoyée au MJ pour ${actor.name}.`);
  return true;
}

/**
 * Retire de la VIT.
 * @param {Actor} actor
 * @param {number} amount
 */
export async function applyDamage(actor, amount) {
  if ( relayToGM(actor, { type: "applyDamage", uuid: actor.uuid, amount }) ) return;
  await actor.update({ "system.vit.value": Math.max(actor.system.vit.value - amount, 0) });
  ui.notifications.info(`${actor.name} perd ${amount} VIT.`);
}

/**
 * Applique un effet de capacité.
 * @param {Actor} actor
 * @param {{kind: string, stat?: string, value?: number, status?: string}} effect
 */
export async function applyEffect(actor, effect) {
  if ( relayToGM(actor, { type: "applyEffect", uuid: actor.uuid, effect }) ) return;

  // Modification temporaire de statistique, limitée de −6 à +6 (5.11).
  if ( effect.kind === "stat" ) {
    const stat = actor.system.stats?.[effect.stat];
    if ( !stat ) return ui.notifications.warn(`${actor.name} n'a pas de modification temporaire de ${effect.stat.toUpperCase()}.`);
    const temp = Math.clamp(stat.temp + effect.value, -6, 6);
    if ( temp === stat.temp ) return ui.notifications.info(`${actor.name} : ${effectLabel(effect)} sans effet (limite ±6 atteinte).`);
    await actor.update({ [`system.stats.${effect.stat}.temp`]: temp });
    return ui.notifications.info(`${actor.name} : ${effectLabel(effect)} (modification temporaire ${temp > 0 ? "+" : ""}${temp}).`);
  }

  // Altération d'état : immunités de type et un seul problème de statut majeur.
  const status = STATUSES[effect.status];
  if ( !status ) return;
  if ( actor.statuses.has(effect.status) ) return ui.notifications.info(`${actor.name} est déjà atteint : ${status.label}.`);
  const types = [actor.system.types?.primary, actor.system.types?.secondary].filter(Boolean);
  const immune = types.find(t => status.immune.includes(t));
  if ( immune ) return ui.notifications.warn(`${actor.name} est immunisé : ${status.label} (type ${immune}).`);
  if ( status.major ) {
    const current = Object.entries(STATUSES).find(([id, s]) => s.major && actor.statuses.has(id));
    if ( current ) return ui.notifications.warn(`${actor.name} souffre déjà d'un problème de statut majeur : ${current[1].label}.`);
  }
  await actor.toggleStatusEffect(effect.status, { active: true });
  await syncCounters(actor, effect.status, true);
  ui.notifications.info(`${actor.name} : ${status.label}.`);
}

/**
 * Compteurs liés aux états : Toxik commence au tour 1, la Confusion au stade 1.
 * @param {Actor} actor
 * @param {string} statusId
 * @param {boolean} active
 */
export async function syncCounters(actor, statusId, active) {
  if ( actor.type !== "pokemon" ) return;
  if ( statusId === "toxik" ) await actor.update({ "system.conditions.toxik": active ? 1 : 0 });
  if ( statusId === "confusion" ) await actor.update({ "system.conditions.confusion": active ? 1 : 0 });
}

/** Traitement des demandes transmises au MJ actif. */
export async function handleEffectRequest(data) {
  const actor = await fromUuid(data.uuid);
  if ( !actor ) return;
  if ( data.type === "applyDamage" ) return applyDamage(actor, Number(data.amount));
  if ( data.type === "applyEffect" ) return applyEffect(actor, data.effect);
}
