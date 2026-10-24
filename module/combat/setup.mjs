/**
 * Combat de Dresseurs : mise en place (type, format, Dresseurs), envoi des Pokémon de départ,
 * suivi des Pokémon engagés et fin du combat avec XP (Manuel du Joueur 4.10, 5.12, 5.14 ; MJ 5.12, 6.2).
 */
import { COMBAT_FORMATS, COMBAT_TYPES } from "../config.mjs";

const SCOPE = "hakai-kousen";
const SOCKET = `system.${SCOPE}`;
const { DialogV2 } = foundry.applications.api;

/**
 * Configuration du combat : { type, format, maxTeam, trainers: [uuid], sides: {id: camp}, sideNames: {camp: nom},
 * deploy: {id: [uuid]}, used: {id: [uuid]} }.
 */
export function getSetup(combat) {
  return foundry.utils.mergeObject({ type: "officiel", format: 1, maxTeam: 0, trainers: [], sides: {}, sideNames: {}, deploy: {}, used: {} },
    combat?.getFlag(SCOPE, "setup") ?? {}, { inplace: false });
}

/** Nombre de camps proposés à la mise en place. */
const SIDE_COUNT = 4;

/**
 * Camp d'un Dresseur : les Dresseurs d'un même camp combattent ensemble (alliés).
 * Sans camp défini (anciens combats), chaque Dresseur forme son propre camp.
 */
export function sideOf(combat, trainer) {
  if ( !trainer ) return null;
  return getSetup(combat).sides[trainer.id] ?? `solo-${trainer.id}`;
}

/** Nom affiché d'un camp. */
export function sideLabel(combat, side) {
  const setup = getSetup(combat);
  if ( String(side).startsWith("solo-") ) return null;
  return setup.sideNames[side] || `Camp ${side}`;
}

/** Dresseurs de la mise en place, regroupés par camp dans l'ordre des camps. */
export function trainersBySide(combat) {
  const groups = new Map();
  for ( const uuid of getSetup(combat).trainers ) {
    const trainer = fromUuidSync(uuid);
    if ( !trainer ) continue;
    const side = sideOf(combat, trainer);
    if ( !groups.has(side) ) groups.set(side, []);
    groups.get(side).push(trainer);
  }
  return [...groups].sort(([a], [b]) => String(a).localeCompare(String(b), "fr", { numeric: true }));
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
    <fieldset><legend>Camps</legend>
      <p class="hint">Les Dresseurs d'un même camp combattent ensemble. Exemple : trois PNJ au camp 1 contre la Team Rocket au camp 2.</p>
      <div class="hk-side-names">${Array.from({ length: SIDE_COUNT }, (_, i) => `<label>Camp ${i + 1}
        <input type="text" name="sideName${i + 1}" placeholder="${["Héros", "Adversaires", "", ""][i]}"></label>`).join("")}</div>
    </fieldset>
    <fieldset><legend>Dresseurs</legend>
      ${trainers.map(t => `<div class="hk-side-row"><label class="checkbox"><input type="checkbox" name="trainer" value="${t.uuid}">
        ${t.name} <span class="hint">(${t.system.team.length} Pokémon)</span></label>
        <select name="side-${t.id}" data-tooltip="Camp de ce Dresseur">${Array.from({ length: SIDE_COUNT }, (_, i) =>
          `<option value="${i + 1}" ${(t.hasPlayerOwner ? 1 : 2) === i + 1 ? "selected" : ""}>Camp ${i + 1}</option>`).join("")}</select></div>`).join("")}
    </fieldset>`;
  const data = await DialogV2.prompt({
    window: { title: "Nouveau combat de Dresseurs", icon: "fa-solid fa-people-arrows" },
    content,
    ok: {
      label: "Préparer le combat",
      callback: (event, button) => {
        const form = button.form;
        const trainersChosen = [...form.querySelectorAll("input[name=trainer]:checked")].map(i => i.value);
        const sides = {};
        for ( const uuid of trainersChosen ) {
          const id = fromUuidSync(uuid)?.id;
          if ( id ) sides[id] = form.elements[`side-${id}`]?.value ?? "1";
        }
        const sideNames = {};
        for ( let i = 1; i <= SIDE_COUNT; i++ ) {
          const name = form.elements[`sideName${i}`]?.value.trim();
          if ( name ) sideNames[i] = name;
        }
        return {
          type: form.elements.type.value,
          format: Number(form.elements.format.value),
          maxTeam: Number(form.elements.maxTeam.value) || 0,
          trainers: trainersChosen,
          sides,
          sideNames
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
  const camps = trainersBySide(combat).map(([side, list]) => `<strong>${sideLabel(combat, side)}</strong> : ${list.map(t => t.name).join(", ")}`);
  await ChatMessage.implementation.create({
    speaker: { alias: "Combat" },
    content: `<div class="hk-card"><header><h3>Combat ${COMBAT_TYPES[data.type].label.toLowerCase()} (${COMBAT_FORMATS[data.format]})</h3></header>
      <p>${camps.join("<br>contre<br>")}</p>
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

  // Camps : le premier à gauche, le deuxième à droite, les suivants en dessous ; un camp avec des joueurs est allié.
  const camps = trainersBySide(combat);
  const friendlyCamp = camps.find(([, list]) => list.some(t => t.hasPlayerOwner))?.[0] ?? camps[0]?.[0];
  for ( const [c, [side, list]] of camps.entries() ) {
    // Faute de jeton Dresseur : chaque camp de son côté de la scène, ses Dresseurs les uns sous les autres.
    const direction = (c % 2) ? -1 : 1;
    const disposition = side === friendlyCamp ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE;
    for ( const [k, trainer] of list.entries() ) {
      const chosen = (setup.deploy[trainer.id] ?? []).map(u => fromUuidSync(u)).filter(Boolean);
      used[trainer.id] = chosen.map(p => p.uuid);
      const trainerToken = scene.tokens.find(t => t.actorId === trainer.id);
      const row = (Math.floor(c / 2) * list.length) + k;
      const origin = trainerToken
        ? { x: trainerToken.x, y: trainerToken.y }
        : { x: rect.x + (rect.width / 2) - (direction * size * 3), y: rect.y + (rect.height / 2) + (row * size * 2) };
      for ( const [i, pokemon] of chosen.entries() ) {
        const doc = await pokemon.getTokenDocument({ ...place(origin, i, direction), actorLink: true, disposition });
        tokens.push(doc.toObject());
      }
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
    await actor.update({ "system.xp.value": actor.system.xp.value + data.amount });
    names.push(actor.name);
  }
  await ChatMessage.implementation.create({
    speaker: { alias: "Combat" },
    content: `<div class="hk-card"><header><h3>Fin du combat</h3></header>
      ${names.length ? `<p>+${data.amount} XP Pokémon : ${names.join(", ")}.</p>` : "<p>Aucune XP distribuée.</p>"}</div>`
  });
  await combat.delete();
}
