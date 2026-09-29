/**
 * Actions de tour du panneau de combat (Manuel du Joueur 5.4, 5.13, 5.15, 5.16, 5.18).
 * Un Pokémon agit avec une capacité, ou son Dresseur consacre l'action à une action personnelle :
 * changer de Pokémon, utiliser un objet, lancer une Poké Ball, fuir ou abandonner.
 */
import { rollAttack, rollDressage } from "../dice/rolls.mjs";
import { handleEffectRequest } from "./effects.mjs";

const SCOPE = "hakai-kousen";
const SOCKET = `system.${SCOPE}`;

export const ACTION_KINDS = {
  attack: { label: "Attaque", icon: "fa-burst" },
  switch: { label: "Changer de Pokémon", icon: "fa-arrows-rotate" },
  item: { label: "Objet", icon: "fa-flask" },
  ball: { label: "Poké Ball", icon: "fa-circle-dot" },
  flee: { label: "Fuir / abandonner", icon: "fa-person-running" },
  other: { label: "Autre", icon: "fa-comment" }
};

/** Altérations d'état qui modifient la capture (5.16). */
const CAPTURE_STATUSES = ["brulure", "paralysie", "poison", "toxik", "gel", "sommeil"];

/* -------------------------------------------- */
/*  Options disponibles                         */
/* -------------------------------------------- */

/** Combattant qui a remplacé un autre après un switch (les attaques le visent à sa place). */
function resolveCombatant(combat, id) {
  const replaced = combat.getFlag(SCOPE, "replaced") ?? {};
  let current = id;
  for ( let i = 0; (i < 10) && replaced[current]; i++ ) current = replaced[current];
  return combat.combatants.get(current) ?? null;
}

/**
 * Actions possibles pour un combattant ce tour-ci.
 * @param {Combatant} combatant
 * @param {Combat} combat
 */
export function getActionOptions(combatant, combat) {
  const actor = combatant.actor;
  const trainer = combatant.trainer;
  const kinds = [];
  const options = { kinds, attacks: [], team: [], items: [], balls: [], targets: [], allies: [] };
  if ( !actor ) return options;

  if ( actor.type === "pokemon" ) {
    kinds.push("attack");
    options.attacks = actor.itemTypes.attack.map(item => ({
      id: item.id,
      name: item.name,
      type: item.system.type,
      energy: item.system.energy,
      affordable: actor.system.ene.value >= item.system.energy,
      priority: item.system.priority,
      initiativeBonus: item.system.initiativeBonus
    }));
  }

  if ( trainer ) {
    // Changer de Pokémon : membres de l'équipe qui ne sont ni KO ni déjà en combat.
    const inCombat = new Set(combat.combatants.map(c => c.actorId));
    options.team = trainer.system.team.map(uuid => fromUuidSync(uuid))
      .filter(p => p && (p.id !== actor.id) && !inCombat.has(p.id) && (p.system.vit.value > 0))
      .map(p => ({ uuid: p.uuid, name: p.name, img: p.img, vit: p.system.vit.value, vitMax: p.system.vit.max }));
    if ( (actor.type === "pokemon") && options.team.length ) kinds.push("switch");

    const gear = trainer.itemTypes.gear.filter(i => i.system.quantity > 0);
    options.items = gear.filter(i => ["consumable", "held", "other"].includes(i.system.category))
      .map(i => ({ id: i.id, name: i.name, quantity: i.system.quantity }));
    options.balls = gear.filter(i => i.system.category === "ball")
      .map(i => ({ id: i.id, name: i.name, quantity: i.system.quantity }));
    if ( options.items.length ) kinds.push("item");
    if ( options.balls.length ) kinds.push("ball");

    // Cibles d'un objet : l'équipe du Dresseur (y compris un Pokémon KO à ranimer).
    options.allies = trainer.system.team.map(uuid => fromUuidSync(uuid)).filter(Boolean)
      .map(p => ({ uuid: p.uuid, name: p.name }));
  }
  kinds.push("flee", "other");

  // Cibles d'attaque ou de capture : les autres combattants visibles.
  options.targets = combat.combatants
    .filter(c => (c.id !== combatant.id) && c.token && (game.user.isGM || !c.hidden))
    .map(c => ({ id: c.id, name: c.name, img: c.img, wild: !c.trainer && (c.actor?.type === "pokemon"), ko: c.isKO }));
  return options;
}

/* -------------------------------------------- */
/*  Libellés                                    */
/* -------------------------------------------- */

/** Description lisible du choix d'un combattant. */
export function describeChoice(combatant, combat) {
  const choice = combatant.choice;
  const actor = combatant.actor;
  const trainer = combatant.trainer;
  const names = ids => ids.map(id => resolveCombatant(combat, id)?.name ?? "?").join(", ");
  switch ( choice.kind ) {
    case "attack": {
      const item = actor?.items.get(choice.itemId);
      const targets = choice.targets.length ? ` → ${names(choice.targets)}` : "";
      return `${item?.name ?? "Attaque"}${targets}`;
    }
    case "switch": return `Rappel, envoie ${fromUuidSync(choice.switchTo)?.name ?? "?"}`;
    case "item": {
      const item = trainer?.items.get(choice.itemId);
      const target = choice.targets[0] ? fromUuidSync(choice.targets[0])?.name : null;
      return `${item?.name ?? "Objet"}${target ? ` sur ${target}` : ""}`;
    }
    case "ball": {
      const item = trainer?.items.get(choice.itemId);
      return `${item?.name ?? "Poké Ball"} → ${names(choice.targets)}`;
    }
    case "flee": return "Fuite / abandon";
    case "other": return choice.note || "Autre action";
    default: return "<em>Aucune action</em>";
  }
}

/** Le choix est complet et peut être validé. */
export function isChoiceComplete(choice) {
  switch ( choice.kind ) {
    case "attack": return !!choice.itemId;
    case "switch": return !!choice.switchTo;
    case "item": return !!choice.itemId;
    case "ball": return !!choice.itemId && (choice.targets.length === 1);
    case "flee": return true;
    case "other": return !!choice.note.trim();
    default: return false;
  }
}

/* -------------------------------------------- */
/*  Écriture des choix                          */
/* -------------------------------------------- */

/**
 * Enregistre le choix d'un combattant. Si le joueur ne peut pas modifier le combattant lui-même,
 * la demande passe par le MJ actif.
 */
export async function setChoice(combatant, choice) {
  const data = { flags: { [SCOPE]: { choice } } };
  if ( combatant.canUserModify(game.user, "update", data) ) return combatant.update(data);
  if ( !game.users.activeGM ) return ui.notifications.warn("Aucun MJ connecté pour enregistrer ce choix.");
  game.socket.emit(SOCKET, { type: "setChoice", combatId: combatant.combat.id, combatantId: combatant.id, choice, userId: game.user.id });
}

/* -------------------------------------------- */
/*  Exécution                                   */
/* -------------------------------------------- */

async function card(actor, title, body, options = {}) {
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="hk-card"><header><h3>${title}</h3></header>${body}</div>`,
    ...options
  });
}

/**
 * Exécute l'action choisie par le combattant dont c'est le tour, puis passe au suivant.
 * @param {Combatant} combatant
 */
export async function executeChoice(combatant) {
  const combat = combatant.combat;
  const choice = combatant.choice;
  const actor = combatant.actor;
  const trainer = combatant.trainer;
  let advance = true;

  if ( combatant.isKO ) {
    await card(actor, combatant.name, `<p>KO : son action est annulée.</p>`);
  }
  else switch ( choice.kind ) {
    case "attack": {
      const item = actor.items.get(choice.itemId);
      if ( !item ) break;
      // Chaque ordre demande un test de Dressage sous 8 (4.11), sauf Pokémon sauvage.
      if ( combatant.hasPlayerOwner && (actor.system.dressage < 8) ) {
        const roll = (await rollDressage(actor))?.rolls?.[0];
        if ( roll && (roll.total > actor.system.dressage) ) break;
      }
      const targets = choice.targets.map(id => resolveCombatant(combat, id)?.token).filter(Boolean);
      const message = await rollAttack(actor, item, { targets });
      if ( !message ) return false;
      break;
    }
    case "switch":
      advance = false;
      await requestSwitch(combatant, choice.switchTo);
      break;
    case "item": {
      const item = trainer?.items.get(choice.itemId);
      if ( !item ) break;
      const target = choice.targets[0] ? fromUuidSync(choice.targets[0]) : null;
      await item.update({ "system.quantity": Math.max(item.system.quantity - 1, 0) });
      await card(trainer, `${trainer.name} utilise ${item.name}`,
        `${target ? `<p>Sur <strong>${target.name}</strong>.</p>` : ""}${item.system.description}
         <p class="hk-detail">Reste : ${item.system.quantity}. Appliquez l'effet de l'objet sur la fiche.</p>`);
      break;
    }
    case "ball":
      await throwBall(trainer, trainer?.items.get(choice.itemId), resolveCombatant(combat, choice.targets[0]));
      break;
    case "flee":
      await card(actor, `${trainer?.name ?? combatant.name} tente de fuir ou abandonne`,
        `<p class="hk-detail">Combat officiel : le Dresseur est déclaré vaincu. Face à un adversaire hostile, abandonner ne l'oblige pas à s'arrêter (5.18).</p>`);
      break;
    case "other":
      await card(actor, combatant.name, `<p>${Handlebars.escapeExpression(choice.note)}</p>`);
      break;
    default:
      await card(actor, combatant.name, `<p>Ne fait rien ce tour-ci.</p>`);
  }

  // Après un switch, le combattant rappelé a disparu : le suivant devient actif de lui-même.
  if ( !advance ) return true;
  await setChoice(combatant, { ...choice, done: true });
  if ( combat.combatant?.id === combatant.id ) {
    try { await combat.nextTurn(); }
    catch(err) { console.warn(err); }
  }
  return true;
}

/* -------------------------------------------- */
/*  Capture (5.16)                              */
/* -------------------------------------------- */

async function throwBall(trainer, ball, target) {
  if ( !trainer || !ball || !target?.actor ) return;
  await ball.update({ "system.quantity": Math.max(ball.system.quantity - 1, 0) });

  // Test de DEX du Dresseur pour atteindre la cible.
  const dex = trainer.system.attributes.dex.value;
  const throwRoll = await new foundry.dice.Roll("1d6").evaluate();
  const hit = throwRoll.total <= dex;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    rolls: [throwRoll],
    content: `<div class="hk-card"><header><h3>${trainer.name} lance une ${ball.name}</h3>
      <span class="subtitle">sur ${target.name}</span></header>
      <p class="hk-detail">Test de DEX : 1D6 ≤ ${dex} → ${throwRoll.total}</p>
      <div class="hk-outcome ${hit ? "success" : "failure"}">${hit ? "La Ball atteint sa cible" : "La Ball manque sa cible"}</div>
      ${hit ? `<p class="hk-detail">Le MJ effectue le jet de capture en secret.</p>` : ""}</div>`
  });
  if ( !hit ) return;

  // Seuil de capture : 6 + modificateurs connus ; rareté et Balls spéciales restent au MJ.
  const actor = target.actor;
  const vit = actor.system.vit;
  const mods = [];
  if ( vit.value <= 0 ) mods.push(["Pokémon KO", 0]);
  else if ( vit.value <= Math.floor(vit.max / 4) ) mods.push(["1/4 de VIT ou moins", 3]);
  else mods.push(["Plus de 1/4 de VIT", 4]);
  if ( CAPTURE_STATUSES.some(s => actor.statuses.has(s)) ) mods.push(["Altération d'état", -1]);
  if ( actor.system.baby ) mods.push(["Bébé", -1]);
  const ballName = ball.name.toLowerCase();
  const master = ballName.includes("master");
  if ( ballName.includes("hyper") ) mods.push(["Hyper Ball", -2]);
  else if ( ballName.includes("super") ) mods.push(["Super Ball", -1]);
  const threshold = 6 + mods.reduce((sum, [, v]) => sum + v, 0);

  const roll = await new foundry.dice.Roll("1d10").evaluate();
  const captured = master || (roll.total >= threshold);
  const list = mods.map(([label, v]) => `<li>${label} : ${v >= 0 ? "+" : ""}${v}</li>`).join("");
  const data = {
    speaker: { alias: "Capture" },
    rolls: [roll],
    content: `<div class="hk-card"><header><h3>Capture de ${target.name}</h3>
      <span class="subtitle">${ball.name}</span></header>
      <p class="hk-detail">Seuil 6</p><ul>${list}</ul>
      <p>Seuil final : <strong>${threshold}</strong>${master ? " (Master Ball : capture automatique)" : ""} · 1D10 : <strong>${roll.total}</strong></p>
      <div class="hk-outcome ${captured ? "success" : "failure"}">${captured ? "Capturé !" : "Le Pokémon s'échappe"}</div>
      <p class="hk-detail">À ajouter par le MJ : Rare +1, Semi-légendaire +2 (+3 au stade final), Aberrant +1, Dominant +2, Ball spéciale dont la condition est remplie −3.</p></div>`
  };
  ChatMessage.implementation.applyRollMode(data, "blindroll");
  await ChatMessage.implementation.create(data);
}

/* -------------------------------------------- */
/*  Changement de Pokémon (5.13)                */
/* -------------------------------------------- */

async function requestSwitch(combatant, actorUuid) {
  if ( game.user.isActiveGM ) return performSwitch(combatant, actorUuid);
  if ( !game.users.activeGM ) return ui.notifications.warn("Un MJ doit être connecté pour changer de Pokémon.");
  game.socket.emit(SOCKET, { type: "switch", combatId: combatant.combat.id, combatantId: combatant.id, actorUuid, userId: game.user.id });
}

/**
 * Rappelle le Pokémon et envoie le remplaçant à la même place (MJ).
 * Le switch retire les modifications temporaires et la Confusion ; le nouveau venu lance 1D10 + DEX.
 */
async function performSwitch(combatant, actorUuid) {
  const combat = combatant.combat;
  const oldToken = combatant.token;
  const scene = oldToken?.parent;
  const incoming = await fromUuid(actorUuid);
  if ( !scene || !incoming ) return;

  const outgoing = combatant.actor;
  if ( outgoing?.type === "pokemon" ) {
    const reset = {};
    for ( const k of Object.keys(outgoing.system.stats) ) reset[`system.stats.${k}.temp`] = 0;
    await outgoing.update(reset);
    if ( outgoing.statuses.has("confusion") ) await outgoing.toggleStatusEffect("confusion", { active: false });
  }

  const tokenData = (await incoming.getTokenDocument({
    x: oldToken.x, y: oldToken.y, elevation: oldToken.elevation, actorLink: true, disposition: oldToken.disposition
  })).toObject();
  const [newToken] = await scene.createEmbeddedDocuments("Token", [tokenData]);
  const [newCombatant] = await combat.createEmbeddedDocuments("Combatant", [{
    tokenId: newToken.id, sceneId: scene.id, actorId: incoming.id, hidden: combatant.hidden
  }]);

  // Les attaques qui visaient le Pokémon rappelé visent désormais le remplaçant.
  await combat.setFlag(SCOPE, "replaced", { ...(combat.getFlag(SCOPE, "replaced") ?? {}), [combatant.id]: newCombatant.id });
  await ChatMessage.implementation.create({
    speaker: { alias: combatant.trainer?.name ?? "Combat" },
    content: `<div class="hk-card"><header><h3>${combatant.name}, reviens !</h3></header>
      <p>${combatant.trainer?.name ?? ""} envoie <strong>${incoming.name}</strong>.</p></div>`
  });
  await combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
  await scene.deleteEmbeddedDocuments("Token", [oldToken.id]);
}

/* -------------------------------------------- */
/*  Socket : demandes des joueurs au MJ         */
/* -------------------------------------------- */

export function registerSocket() {
  game.socket.on(SOCKET, async data => {
    if ( !game.user.isActiveGM ) return;
    // Dégâts et effets demandés depuis une carte de chat par un joueur qui ne possède pas la cible.
    if ( ["applyDamage", "applyEffect"].includes(data.type) ) return handleEffectRequest(data);
    const user = game.users.get(data.userId);
    const combatant = game.combats.get(data.combatId)?.combatants.get(data.combatantId);
    if ( !user || !combatant?.actor?.testUserPermission(user, "OWNER") ) return;
    if ( data.type === "setChoice" ) await combatant.update({ [`flags.${SCOPE}.choice`]: data.choice });
    if ( data.type === "switch" ) {
      await performSwitch(combatant, data.actorUuid);
    }
  });
}
