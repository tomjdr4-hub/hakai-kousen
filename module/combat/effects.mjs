/**
 * Application des dégâts, des modifications de stats et des altérations d'état.
 * Si l'utilisateur ne possède pas la cible, la demande est transmise au MJ actif.
 */
import { ATTRIBUTES, CURABLE, STATUSES } from "../config.mjs";

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

/** Dépense de l'ENE (Esquive…), transmise au MJ si nécessaire. */
export async function spendEnergy(actor, amount) {
  if ( relayToGM(actor, { type: "spendEnergy", uuid: actor.uuid, amount }) ) return;
  await actor.update({ "system.ene.value": Math.max(actor.system.ene.value - amount, 0) });
}

/** Nature du combat en cours : officiel (par défaut), sauvage ou mortel. */
export function currentCombatType() {
  return game.combat?.getFlag("hakai-kousen", "setup")?.type ?? "officiel";
}

/** VIT à laquelle l'acteur meurt : −10 pour un Pokémon, −5 pour un humain (3.8, 4.16). */
export function deathThreshold(actor) {
  return actor.type === "trainer" ? -5 : -10;
}

/** Dresseur dont l'équipe contient ce Pokémon. */
export function trainerOf(actor) {
  if ( actor?.type !== "pokemon" ) return null;
  const uuid = actor.isToken ? actor.token?.baseActor?.uuid : actor.uuid;
  return game.actors.find(a => (a.type === "trainer") && a.system.team.includes(uuid)) ?? null;
}

/**
 * Retire de la VIT. En combat officiel, la VIT ne descend pas sous 0 ; ailleurs elle peut devenir
 * négative, avec blessure grave et mort possibles.
 * @param {Actor} actor
 * @param {number} amount
 */
export async function applyDamage(actor, amount) {
  if ( relayToGM(actor, { type: "applyDamage", uuid: actor.uuid, amount }) ) return;
  const before = actor.system.vit.value;
  const official = currentCombatType() === "officiel";
  const after = official ? Math.max(before - amount, 0) : before - amount;
  await actor.update({ "system.vit.value": after });
  ui.notifications.info(`${actor.name} perd ${amount} VIT.`);
  const fatal = !official && (after <= deathThreshold(actor)) && (before > deathThreshold(actor));
  if ( ((before > 0) && (after <= 0)) || fatal ) await announceKO(actor, after, official);
}

/** Carte de KO : blessure grave et coup fatal hors combat officiel (4.16, 3.12). */
async function announceKO(actor, vit, official) {
  const fatal = !official && (vit <= deathThreshold(actor));
  const trainer = trainerOf(actor);
  const buttons = [];
  if ( !official && !fatal ) {
    const effect = encodeURIComponent(JSON.stringify({ kind: "status", status: "blessure" }));
    buttons.push(`<button type="button" class="hk-apply" data-hk-action="applyEffect" data-uuid="${actor.uuid}"
      data-effect="${effect}"><i class="fa-solid fa-droplet"></i> Blessure grave</button>`);
  }
  if ( fatal && trainer ) {
    buttons.push(`<button type="button" class="hk-apply" data-hk-action="saveFatal" data-uuid="${actor.uuid}"
      data-trainer="${trainer.uuid}"><i class="fa-solid fa-life-ring"></i> ${trainer.name} dépense 1 XP Dresseur : rappelé juste à temps</button>`);
  }
  let text;
  if ( fatal ) text = `Coup fatal : ${actor.name} tombe à ${vit} VIT.`;
  else if ( official ) text = `${actor.name} est KO. Les sécurités du combat officiel empêchent toute blessure grave.`;
  else text = `${actor.name} est KO (${vit} VIT). Une blessure suffisamment grave peut mettre sa vie en danger.`;
  await ChatMessage.implementation.create({
    speaker: { alias: "Combat" },
    content: `<div class="hk-card"><header><h3>${fatal ? "Coup fatal" : "KO"}</h3></header>
      <div class="hk-outcome failure">${text}</div>${buttons.join("")}</div>`
  });
}

/** Rappel juste à temps : 1 XP Dresseur, le Pokémon survit avec une blessure grave (3.12). */
export async function saveFromFatal(actor, trainer) {
  if ( !trainer?.isOwner ) return ui.notifications.warn("Seul le propriétaire du Dresseur peut dépenser son XP.");
  if ( trainer.system.xp.value < 1 ) return ui.notifications.warn(`${trainer.name} n'a plus d'XP Dresseur.`);
  await trainer.update({ "system.xp.value": trainer.system.xp.value - 1 });
  if ( !relayToGM(actor, { type: "saveFatal", uuid: actor.uuid }) ) await survive(actor);
  await ChatMessage.implementation.create({
    speaker: { alias: trainer.name },
    content: `<div class="hk-card"><header><h3>Rappelé juste à temps !</h3></header>
      <p>${trainer.name} rappelle ${actor.name} dans sa Ball au dernier moment. Blessure grave : soins nécessaires.</p></div>`
  });
}

async function survive(actor) {
  await actor.update({ "system.vit.value": deathThreshold(actor) + 1 });
  if ( !actor.statuses.has("blessure") ) await actor.toggleStatusEffect("blessure", { active: true });
}

/**
 * Utilise un objet de soin sur un acteur (Annexe 4) et décompte l'objet.
 * Renvoie le texte du résultat, ou null si l'utilisation est refusée.
 * @param {Item} item
 * @param {Actor} actor
 */
export async function useItemOn(item, actor) {
  const use = item.system.use;
  const vit = actor.system.vit;
  const ene = actor.system.ene;
  const ko = vit.value <= 0;
  const lines = [];
  const updates = {};

  if ( ko && !use.revive ) {
    if ( !(use.vit || use.vitFull) ) {
      ui.notifications.warn(`${actor.name} est KO : cet objet ne peut pas le relever.`);
      return null;
    }
    if ( (currentCombatType() === "officiel") && game.combat?.started ) {
      ui.notifications.warn("En combat officiel, seul un Rappel autorisé ramène un Pokémon KO.");
      return null;
    }
  }

  let newVit = vit.value;
  if ( use.revive && ko ) newVit = Math.max(Math.floor(vit.max * use.revive / 100), 1);
  else if ( use.vitFull ) newVit = vit.max;
  else if ( use.vit ) newVit = Math.min(vit.value + use.vit, vit.max);
  if ( newVit !== vit.value ) {
    updates["system.vit.value"] = newVit;
    lines.push(ko ? `${actor.name} est relevé avec ${newVit} VIT.` : `VIT : ${vit.value} → ${newVit}.`);
  }
  if ( ene && (use.ene || use.eneFull) ) {
    const newEne = use.eneFull ? ene.max : Math.min(ene.value + use.ene, ene.max);
    updates["system.ene.value"] = newEne;
    lines.push(`ENE : ${ene.value} → ${newEne}.`);
  }
  if ( Object.keys(updates).length ) await actor.update(updates);

  const cures = use.cures.includes("all") ? CURABLE : use.cures;
  for ( const id of cures ) {
    if ( !actor.statuses.has(id) ) continue;
    await actor.toggleStatusEffect(id, { active: false });
    await syncCounters(actor, id, false);
    lines.push(`${STATUSES[id]?.label ?? id} guéri.`);
  }
  if ( (newVit > 0) && actor.statuses.has("dead") ) await actor.toggleStatusEffect("dead", { active: false });
  await item.update({ "system.quantity": Math.max(item.system.quantity - 1, 0) });
  return lines.join(" ") || "Aucun effet.";
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
  // Boss : immunisé à toutes les altérations sauf une, annoncé clairement (5.20).
  const boss = actor.system.boss;
  if ( boss?.enabled && (effect.status !== boss.vulnerable) && (effect.status !== "blessure") ) {
    return ChatMessage.implementation.create({
      speaker: { alias: "Combat" },
      content: `<div class="hk-card"><header><h3>${actor.name} est immunisé</h3></header>
        <div class="hk-outcome failure">${status.label} n'a aucun effet sur ce Boss.</div>
        <p class="hk-detail">L'action est perdue, mais l'information est fiable : ce n'est pas son point faible.</p></div>`
    });
  }
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
  if ( data.type === "saveFatal" ) return survive(actor);
  if ( data.type === "spendEnergy" ) return spendEnergy(actor, Number(data.amount));
}

/** Boutons des cartes de chat Hakai Kousen. */
export function onRenderChatMessage(message, html) {
  html.querySelectorAll("[data-hk-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.uuid);
      if ( !actor ) return;
      button.classList.add("applied");
      switch ( button.dataset.hkAction ) {
        case "applyDamage": return applyDamage(actor, Number(button.dataset.amount));
        case "applyEffect": return applyEffect(actor, JSON.parse(decodeURIComponent(button.dataset.effect)));
        case "saveFatal": return saveFromFatal(actor, await fromUuid(button.dataset.trainer));
      }
    });
  });
}
