/**
 * Combat de Dresseurs : mise en place (type, format, Dresseurs), envoi des Pokémon de départ,
 * suivi des Pokémon engagés et fin du combat avec XP (Manuel du Joueur 4.10, 5.12, 5.14 ; MJ 5.12, 6.2).
 */
import { COMBAT_FORMATS, COMBAT_TYPES } from "../config.mjs";

const SCOPE = "hakai-kousen";
const SOCKET = `system.${SCOPE}`;
const { DialogV2 } = foundry.applications.api;

/** Configuration du combat : { type, format, maxTeam, trainers: [uuid], deploy: {id: [uuid]}, used: {id: [uuid]} }. */
export function getSetup(combat) {
  return foundry.utils.mergeObject({ type: "officiel", format: 1, maxTeam: 0, trainers: [], deploy: {}, used: {} },
    combat?.getFlag(SCOPE, "setup") ?? {}, { inplace: false });
}

/** Pokémon valides d'un Dresseur : dans son équipe, pas KO. */
export function validTeam(trainer) {
  return trainer.system.team.map(uuid => fromUuidSync(uuid)).filter(p => p && (p.system.vit.value > 0));
}

/**
 * Pokémon qu'un Dresseur peut encore envoyer : valides, pas déjà en jeu, et dans la limite
 * du nombre de Pokémon autorisés par le règlement (les Pokémon déjà engagés restent disponibles).
 */
export function availableReserve(combat, trainer) {
  const setup = getSetup(combat);
  const inCombat = new Set(combat.combatants.map(c => c.actorId));
  const used = setup.used[trainer.id] ?? [];
  const full = setup.maxTeam && (used.length >= setup.maxTeam);
  return validTeam(trainer).filter(p => !inCombat.has(p.id) && (!full || used.includes(p.uuid)));
}

/* -------------------------------------------- */
/*  Mise en place                               */
/* -------------------------------------------- */

/** Fenêtre de création d'un combat de Dresseurs (MJ). */
export async function openSetupDialog() {
  const trainers = game.actors.filter(a => (a.type === "trainer") && a.system.team.length);
  if ( !trainers.length ) return ui.notifications.warn("Aucun Dresseur avec une équipe : remplissez l'onglet Équipe des fiches Dresseur.");
  const options = obj => Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.label ?? v}</option>`).join("");
  const content = `
    <div class="form-group"><label>Type de combat</label>
      <div class="form-fields"><select name="type">${options(COMBAT_TYPES)}</select></div></div>
    <div class="form-group"><label>Format</label>
      <div class="form-fields"><select name="format">${options(COMBAT_FORMATS)}</select></div>
      <p class="hint">Pokémon en jeu en même temps pour chaque Dresseur.</p></div>
    <div class="form-group"><label>Pokémon autorisés par Dresseur</label>
      <div class="form-fields"><input type="number" name="maxTeam" value="0" min="0" max="6"></div>
      <p class="hint">0 = toute l'équipe.</p></div>
    <fieldset><legend>Dresseurs</legend>
      ${trainers.map(t => `<label class="checkbox"><input type="checkbox" name="trainer" value="${t.uuid}">
        ${t.name} <span class="hint">(${t.system.team.length} Pokémon)</span></label>`).join("")}
    </fieldset>`;
  const data = await DialogV2.prompt({
    window: { title: "Nouveau combat de Dresseurs", icon: "fa-solid fa-people-arrows" },
    content,
    ok: {
      label: "Préparer le combat",
      callback: (event, button) => {
        const form = button.form;
        return {
          type: form.elements.type.value,
          format: Number(form.elements.format.value),
          maxTeam: Number(form.elements.maxTeam.value) || 0,
          trainers: [...form.querySelectorAll("input[name=trainer]:checked")].map(i => i.value)
        };
      }
    },
    rejectClose: false
  });
  if ( !data ) return null;
  if ( data.trainers.length < 1 ) return ui.notifications.warn("Choisissez au moins un Dresseur.");

  const combat = await Combat.implementation.create({
    scene: canvas.scene?.id ?? null,
    active: true,
    flags: { [SCOPE]: {
      setup: { ...data, deploy: {}, used: {} },
      phase: { state: "deploy", round: 0 }
    } }
  });
  await ChatMessage.implementation.create({
    speaker: { alias: "Combat" },
    content: `<div class="hk-card"><header><h3>Combat ${COMBAT_TYPES[data.type].label.toLowerCase()} (${COMBAT_FORMATS[data.format]})</h3></header>
      <p>${data.trainers.map(u => fromUuidSync(u)?.name).join(" contre ")}</p>
      <p class="hk-detail">Chaque Dresseur choisit son ou ses Pokémon de départ dans le panneau de combat.</p></div>`
  });
  return combat;
}

/** Enregistre le choix des Pokémon de départ d'un Dresseur (passe par le MJ pour un joueur). */
export async function setDeployChoice(combat, trainer, uuids) {
  if ( game.user.isGM ) return storeDeployChoice(combat, trainer, uuids);
  if ( !game.users.activeGM ) return ui.notifications.warn("Un MJ doit être connecté.");
  game.socket.emit(SOCKET, { type: "deploy", combatId: combat.id, trainerUuid: trainer.uuid, uuids, userId: game.user.id });
}

export async function storeDeployChoice(combat, trainer, uuids) {
  await combat.setFlag(SCOPE, `setup.deploy.${trainer.id}`, uuids);
  const setup = getSetup(combat);
  const ready = setup.trainers.every(u => {
    const t = fromUuidSync(u);
    return t && setup.deploy[t.id]?.length;
  });
  if ( ready && game.user.isActiveGM ) await deploy(combat);
}

/** Case libre proche d'un point, en partant d'un décalage donné. */
function place(origin, index, direction) {
  const size = canvas.grid.size;
  return { x: origin.x + (size * (index + 1) * direction), y: origin.y };
}

/**
 * Envoie les Pokémon de départ sur la scène, lance l'initiative et démarre le combat (MJ).
 * Les Pokémon apparaissent à côté du jeton de leur Dresseur, sinon au centre de la scène.
 */
export async function deploy(combat) {
  const scene = combat.scene ?? canvas.scene;
  if ( !scene ) return ui.notifications.warn("Aucune scène pour placer les Pokémon.");
  const setup = getSetup(combat);
  const rect = scene.dimensions.sceneRect;
  const size = canvas.grid.size;
  const tokens = [];
  const used = {};

  for ( const [k, uuid] of setup.trainers.entries() ) {
    const trainer = await fromUuid(uuid);
    if ( !trainer ) continue;
    const chosen = (setup.deploy[trainer.id] ?? []).map(u => fromUuidSync(u)).filter(Boolean);
    used[trainer.id] = chosen.map(p => p.uuid);
    const trainerToken = scene.tokens.find(t => t.actorId === trainer.id);
    // Camp de gauche (Dresseurs pairs) et de droite (impairs), faute de jeton Dresseur.
    const direction = (k % 2) ? -1 : 1;
    const origin = trainerToken
      ? { x: trainerToken.x, y: trainerToken.y }
      : { x: rect.x + (rect.width / 2) - (direction * size * 3), y: rect.y + (rect.height / 2) + (Math.floor(k / 2) * size * 2) };
    const disposition = trainer.hasPlayerOwner ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE;
    for ( const [i, pokemon] of chosen.entries() ) {
      const doc = await pokemon.getTokenDocument({ ...place(origin, i, direction), actorLink: true, disposition });
      tokens.push(doc.toObject());
    }
  }

  const created = await scene.createEmbeddedDocuments("Token", tokens);
  await combat.createEmbeddedDocuments("Combatant", created.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
  await combat.setFlag(SCOPE, "setup.used", used);
  await combat.unsetFlag(SCOPE, "phase");
  await combat.rollAll();
  await combat.startCombat();
}

/** Mémorise qu'un Pokémon a été engagé par son Dresseur (limite du règlement). */
export async function markUsed(combat, trainer, pokemonUuid) {
  const used = getSetup(combat).used[trainer.id] ?? [];
  if ( !used.includes(pokemonUuid) ) await combat.setFlag(SCOPE, `setup.used.${trainer.id}`, [...used, pokemonUuid]);
}

/* -------------------------------------------- */
/*  Fin du combat                               */
/* -------------------------------------------- */

const XP_PRESETS = {
  5: "Rencontre faible (5)",
  10: "Rencontre faible (10)",
  15: "Combat classique (15)",
  20: "Combat classique (20)",
  30: "Combat difficile (30)",
  50: "Événement exceptionnel (50)"
};

/**
 * Termine le combat : XP Pokémon aux participants (montant complet pour chacun, 4.10), puis suppression.
 * @param {Combat} combat
 */
export async function endCombatWithXP(combat) {
  const participants = combat.getFlag(SCOPE, "participants") ?? {};
  const entries = Object.values(participants)
    .map(p => ({ ...p, actor: fromUuidSync(p.uuid) }))
    .filter(p => p.actor?.type === "pokemon");
  const rows = entries.map(p => `<label class="checkbox"><input type="checkbox" name="pokemon" value="${p.uuid}"
    ${p.actor.hasPlayerOwner ? "checked" : ""}> <img src="${p.actor.img}" width="24" height="24" style="border:none"> ${p.actor.name}</label>`).join("");
  const presets = Object.entries(XP_PRESETS).map(([v, l]) => `<option value="${v}" ${v === "15" ? "selected" : ""}>${l}</option>`).join("");
  const content = `
    <p>Chaque Pokémon ayant réellement participé reçoit le montant complet ; l'XP n'est pas partagée.</p>
    <div class="form-group"><label>XP Pokémon</label>
      <div class="form-fields"><select name="preset">${presets}</select>
      <input type="number" name="custom" placeholder="Autre" min="0" style="max-width:80px"></div></div>
    <fieldset><legend>Participants</legend>${rows || `<p class="hint">Aucune action enregistrée pendant ce combat.</p>`}</fieldset>
    <p class="hint">XP Dresseur (première capture, Champion vaincu…) : à ajouter sur les fiches Dresseur.</p>`;
  const data = await DialogV2.prompt({
    window: { title: "Fin du combat", icon: "fa-solid fa-flag-checkered" },
    content,
    ok: {
      label: "Distribuer l'XP et terminer",
      callback: (event, button) => ({
        amount: Number(button.form.elements.custom.value) || Number(button.form.elements.preset.value),
        uuids: [...button.form.querySelectorAll("input[name=pokemon]:checked")].map(i => i.value)
      })
    },
    rejectClose: false
  });
  if ( !data ) return;

  const names = [];
  for ( const uuid of data.uuids ) {
    const actor = await fromUuid(uuid);
    if ( !actor ) continue;
    await actor.update({ "system.xp.value": actor.system.xp.value + data.amount, "system.xp.total": actor.system.xp.total + data.amount });
    names.push(actor.name);
  }
  await ChatMessage.implementation.create({
    speaker: { alias: "Combat" },
    content: `<div class="hk-card"><header><h3>Fin du combat</h3></header>
      ${names.length ? `<p>+${data.amount} XP Pokémon : ${names.join(", ")}.</p>` : "<p>Aucune XP distribuée.</p>"}</div>`
  });
  await combat.delete();
}
