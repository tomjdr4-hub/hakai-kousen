/**
 * Combat Hakai Kousen (Manuel du Joueur 5.2 à 5.4, 5.13).
 * - Initiative : 1D10 + DEX effective.
 * - Chaque tour commence par une phase de réflexion chronométrée : chacun choisit son action en secret.
 *   À la fin du chrono (ou quand tout le monde est prêt), les choix sont révélés et appliquent
 *   priorités et bonus d'initiative du tour, puis la résolution suit l'ordre.
 * - Les actions prioritaires passent avant l'ordre normal ; à priorité égale, l'Initiative départage.
 * - Égalité d'Initiative : la meilleure DEX agit d'abord ; à DEX égale, on relance 1D10.
 */
import { describeChoice } from "../combat/actions.mjs";
import { processTurnStart } from "../combat/turn-start.mjs";
import { availableReserve, getSetup, validTeam } from "../combat/setup.mjs";

export const SCOPE = "hakai-kousen";

/** Choix vide d'un combattant pour le tour. */
export const EMPTY_CHOICE = Object.freeze({
  kind: "", itemId: "", targets: [], switchTo: "", note: "", ready: false, done: false
});

export class HKCombatant extends Combatant {
  /** DEX effective (modifications temporaires, Paralysie, affaiblissement compris). */
  get dex() {
    const system = this.actor?.system;
    return system?.stats?.dex.value ?? system?.attributes?.dex.value ?? 0;
  }

  /** Priorité du tour : 1 = action prioritaire, 0 = normale, -1 = agit en dernier. */
  get priority() {
    return this.getFlag(SCOPE, "priority") ?? 0;
  }

  /** Bonus d'initiative du tour donné par la capacité choisie (Vive-Attaque : +10…). */
  get roundBonus() {
    return this.getFlag(SCOPE, "roundBonus") ?? 0;
  }

  /** Relance 1D10 utilisée pour départager une égalité parfaite. */
  get tiebreak() {
    return this.getFlag(SCOPE, "tiebreak") ?? 0;
  }

  /** Action choisie pour le tour. */
  get choice() {
    return { ...EMPTY_CHOICE, ...(this.getFlag(SCOPE, "choice") ?? {}) };
  }

  /** Initiative du tour, bonus de capacité compris. */
  get turnInitiative() {
    return Number.isNumeric(this.initiative) ? this.initiative + this.roundBonus : null;
  }

  /** KO : VIT à 0 ou moins, ou marqué vaincu. */
  get isKO() {
    return this.isDefeated || ((this.actor?.system.vit?.value ?? 1) <= 0);
  }

  /** Doit choisir une action ce tour-ci. */
  get needsChoice() {
    return !this.isKO && !!this.actor;
  }

  /** Dresseur de ce combattant : lui-même, ou le Dresseur dont l'équipe contient ce Pokémon. */
  get trainer() {
    const actor = this.actor;
    if ( !actor ) return null;
    if ( actor.type === "trainer" ) return actor;
    const uuid = `Actor.${this.actorId}`;
    return game.actors.find(a => (a.type === "trainer") && a.system.team.includes(uuid)) ?? null;
  }

  /** Cycle clic gauche : normale <-> prioritaire ; clic droit : normale <-> en dernier. */
  async togglePriority(value) {
    return this.setFlag(SCOPE, "priority", this.priority === value ? 0 : value);
  }
}

/* -------------------------------------------- */

export class HKCombat extends Combat {
  /**
   * Ordre des tours. Appelée sans liaison à l'instance par Combat#setupTurns.
   * @override
   */
  _sortCombatants(a, b) {
    if ( a.priority !== b.priority ) return b.priority - a.priority;
    const ia = a.turnInitiative ?? -Infinity;
    const ib = b.turnInitiative ?? -Infinity;
    if ( ia !== ib ) return ib - ia;
    if ( a.dex !== b.dex ) return b.dex - a.dex;
    if ( a.tiebreak !== b.tiebreak ) return b.tiebreak - a.tiebreak;
    return a.id.localeCompare(b.id);
  }

  /**
   * Recalcule l'ordre quand une priorité, un bonus ou un départage change.
   * @override
   */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( (collection !== "combatants") || !changes.some(c => c.flags?.[SCOPE]) ) return;
    this.setupTurns();
    if ( ui.combat?.viewed === this ) ui.combat.render();
  }

  /* -------------------------------------------- */
  /*  Phases du tour                              */
  /* -------------------------------------------- */

  /**
   * Phase courante : { state: "planning" | "resolution", round, endsAt, paused, duration } ou null.
   * `endsAt` est une heure serveur (ms) ; `paused` est le temps restant (ms) pendant une pause.
   */
  get phase() {
    const phase = this.getFlag(SCOPE, "phase");
    return phase?.round === this.round ? phase : null;
  }

  /** Temps restant de réflexion en millisecondes. */
  get remaining() {
    const phase = this.phase;
    if ( phase?.state !== "planning" ) return 0;
    if ( Number.isNumeric(phase.paused) ) return phase.paused;
    return Math.max(phase.endsAt - game.time.serverTime, 0);
  }

  /** Ouvre la phase de réflexion du tour et efface les choix du tour précédent (MJ). */
  async startPlanning(seconds = game.settings.get(SCOPE, "planningDuration")) {
    const reset = { [`flags.${SCOPE}.priority`]: 0, [`flags.${SCOPE}.roundBonus`]: 0, [`flags.${SCOPE}.choice`]: { ...EMPTY_CHOICE } };
    await this.updateEmbeddedDocuments("Combatant", this.combatants.map(c => ({ _id: c.id, ...reset })));
    await this.setFlag(SCOPE, "phase", {
      state: "planning",
      round: this.round,
      duration: seconds,
      endsAt: game.time.serverTime + (seconds * 1000),
      paused: null
    });
  }

  async togglePause() {
    const phase = this.phase;
    if ( phase?.state !== "planning" ) return;
    if ( Number.isNumeric(phase.paused) ) {
      return this.setFlag(SCOPE, "phase", { ...phase, endsAt: game.time.serverTime + phase.paused, paused: null });
    }
    return this.setFlag(SCOPE, "phase", { ...phase, paused: this.remaining });
  }

  async addTime(seconds) {
    const phase = this.phase;
    if ( phase?.state !== "planning" ) return;
    const ms = seconds * 1000;
    if ( Number.isNumeric(phase.paused) ) return this.setFlag(SCOPE, "phase", { ...phase, paused: phase.paused + ms });
    return this.setFlag(SCOPE, "phase", { ...phase, endsAt: Math.max(phase.endsAt, game.time.serverTime) + ms });
  }

  /** Tous les combattants actifs ont validé leur choix. */
  get allReady() {
    const active = this.combatants.filter(c => c.needsChoice);
    return active.length > 0 && active.every(c => c.choice.ready);
  }

  /**
   * Révèle les choix (MJ) : applique priorités et bonus d'initiative du tour, annonce les actions
   * dans l'ordre et démarre la résolution au premier combattant.
   */
  async reveal() {
    const phase = this.phase;
    if ( phase?.state !== "planning" ) return;
    await this.setFlag(SCOPE, "phase", { ...phase, state: "resolution", paused: null });

    const updates = [];
    for ( const c of this.combatants ) {
      const choice = c.choice;
      let priority = c.priority;
      let bonus = 0;
      if ( choice.kind === "switch" ) priority = 1;
      if ( choice.kind === "attack" ) {
        const item = c.actor?.items.get(choice.itemId);
        if ( item?.system.priority ) priority = item.system.priority;
        bonus = item?.system.initiativeBonus ?? 0;
      }
      updates.push({ _id: c.id, [`flags.${SCOPE}.priority`]: priority, [`flags.${SCOPE}.roundBonus`]: bonus });
    }
    await this.updateEmbeddedDocuments("Combatant", updates);
    this.setupTurns();
    await this.update({ turn: 0 });

    const lines = this.turns.map(c => {
      const label = c.isKO ? "<em>KO</em>" : describeChoice(c, this);
      const init = c.roundBonus ? `${c.initiative} + ${c.roundBonus}` : (c.initiative ?? "—");
      const prio = c.priority > 0 ? " ⚡" : c.priority < 0 ? " ⏳" : "";
      return `<li><strong>${c.name}</strong>${prio} <span class="hk-detail">(init. ${init})</span> : ${label}</li>`;
    });
    await ChatMessage.implementation.create({
      speaker: { alias: "Combat" },
      content: `<div class="hk-card"><header><h3>Tour ${this.round} : actions annoncées</h3>
        <span class="subtitle">Dans l'ordre de résolution</span></header><ol class="hk-announce">${lines.join("")}</ol></div>`
    });
    await processTurnStart(this);
  }

  /** Configuration du combat de Dresseurs (type, format, Dresseurs engagés). */
  get setup() {
    return getSetup(this);
  }

  /** Dresseurs engagés : ceux de la mise en place et ceux des combattants. */
  get trainers() {
    const trainers = new Map();
    for ( const uuid of this.setup.trainers ) {
      const t = fromUuidSync(uuid);
      if ( t ) trainers.set(t.id, t);
    }
    for ( const c of this.combatants ) {
      const t = c.trainer;
      if ( t ) trainers.set(t.id, t);
    }
    return [...trainers.values()];
  }

  /**
   * Combattants KO dont le Dresseur peut envoyer un remplaçant (gratuit, 5.13).
   * @returns {{combatant: Combatant, trainer: Actor, reserve: Actor[]}[]}
   */
  get pendingReplacements() {
    return this.combatants.filter(c => c.isKO && c.trainer && (c.actor?.type === "pokemon"))
      .map(c => ({ combatant: c, trainer: c.trainer, reserve: availableReserve(this, c.trainer) }))
      .filter(r => r.reserve.length);
  }

  /** Un Dresseur est vaincu quand aucun de ses Pokémon valides ne reste disponible. */
  isTrainerDefeated(trainer) {
    const active = this.combatants.some(c => (c.trainer?.id === trainer.id) && !c.isKO && (c.actor?.type === "pokemon"));
    return !active && !availableReserve(this, trainer).length;
  }

  /* -------------------------------------------- */

  /**
   * Relance 1D10 entre combattants à égalité d'Initiative et de DEX, jusqu'à les départager.
   * Exécutée par le MJ actif, qui peut modifier tous les combattants.
   */
  async resolveTies() {
    const groups = new Map();
    for ( const c of this.combatants ) {
      if ( !Number.isNumeric(c.initiative) ) continue;
      const key = `${c.initiative}|${c.dex}`;
      if ( !groups.has(key) ) groups.set(key, []);
      groups.get(key).push(c);
    }

    const updates = [];
    const lines = [];
    for ( const group of groups.values() ) {
      if ( group.length < 2 ) continue;
      // Meute : initiative partagée volontairement.
      const pack = group[0].getFlag(SCOPE, "pack");
      if ( pack && group.every(c => c.getFlag(SCOPE, "pack") === pack) ) continue;
      // Déjà départagés (valeurs toutes différentes) : rien à faire.
      if ( new Set(group.map(c => c.tiebreak)).size === group.length ) continue;

      const results = new Map(group.map(c => [c, []]));
      let tied = group;
      for ( let attempt = 0; (tied.length > 1) && (attempt < 20); attempt++ ) {
        const rolls = await Promise.all(tied.map(() => new foundry.dice.Roll("1d10").evaluate()));
        tied.forEach((c, i) => results.get(c).push(rolls[i].total));
        // Ceux qui partagent encore la même suite de résultats relancent.
        const seen = new Map();
        for ( const c of tied ) {
          const k = results.get(c).join(",");
          seen.set(k, [...(seen.get(k) ?? []), c]);
        }
        tied = [...seen.values()].filter(g => g.length > 1).flat();
      }

      // Valeur de départage : les relances successives comparées dans l'ordre. Les suites sont
      // complétées par des 0 : un combattant départagé tôt garde l'avantage de son premier jet.
      const length = Math.max(...[...results.values()].map(d => d.length));
      for ( const [c, dice] of results ) {
        const padded = [...dice, ...Array(length - dice.length).fill(0)];
        const value = padded.reduce((acc, d) => (acc * 11) + d, 0);
        updates.push({ _id: c.id, [`flags.${SCOPE}.tiebreak`]: value });
      }
      const names = group.map(c => `${c.name} (${results.get(c).join(", ")})`).join(" · ");
      lines.push(`<p>Initiative ${group[0].initiative}, DEX ${group[0].dex} : ${names}</p>`);
    }

    if ( !updates.length ) return;
    await this.updateEmbeddedDocuments("Combatant", updates);
    await ChatMessage.implementation.create({
      speaker: { alias: "Initiative" },
      content: `<div class="hk-card"><header><h3>Égalité d'initiative</h3>
        <span class="subtitle">Même Initiative et même DEX : relance de 1D10</span></header>${lines.join("")}</div>`
    });
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** Départage les égalités une fois les jets d'initiative terminés (plusieurs jets simultanés). */
const resolveTiesSoon = foundry.utils.debounce(combat => combat.resolveTies(), 250);

/** Révèle dès que tout le monde est prêt. */
const revealIfReady = foundry.utils.debounce(combat => {
  if ( (combat.phase?.state === "planning") && combat.allReady ) combat.reveal();
}, 300);

function onUpdateCombatant(combatant, changed) {
  if ( !game.user.isActiveGM ) return;
  if ( "initiative" in changed ) resolveTiesSoon(combatant.combat);
  const choice = changed.flags?.[SCOPE]?.choice;
  if ( choice ) revealIfReady(combatant.combat);
  // Participation : une attaque ou une action du Pokémon lui donne droit à l'XP du combat (4.10).
  if ( choice?.done && ["attack", "other"].includes(combatant.choice.kind) && combatant.actor ) {
    const actor = combatant.actor;
    const participants = combatant.combat.getFlag(SCOPE, "participants") ?? {};
    if ( !participants[actor.id] ) combatant.combat.setFlag(SCOPE, `participants.${actor.id}`, { uuid: actor.uuid, name: actor.name });
  }
}

/** KO : le combattant est marqué vaincu ; s'il se relève, il revient (MJ actif). */
async function onUpdateActor(actor, changed) {
  if ( !game.user.isActiveGM || !foundry.utils.hasProperty(changed, "system.vit.value") ) return;
  const ko = actor.system.vit.value <= 0;
  for ( const combat of game.combats ) {
    const combatants = combat.combatants.filter(c => c.actor === actor);
    if ( !combatants.length ) continue;
    const updates = combatants.filter(c => c.defeated !== ko).map(c => ({ _id: c.id, defeated: ko }));
    if ( updates.length ) await combat.updateEmbeddedDocuments("Combatant", updates);
    if ( ko !== actor.statuses.has("dead") ) await actor.toggleStatusEffect("dead", { active: ko, overlay: true });
    if ( !ko ) continue;
    const trainer = combatants[0].trainer;
    if ( trainer && combat.started && combat.isTrainerDefeated(trainer) ) {
      await ChatMessage.implementation.create({
        speaker: { alias: "Combat" },
        content: `<div class="hk-card"><header><h3>${trainer.name} est vaincu</h3></header>
          <p>Plus aucun Pokémon en état de combattre.</p></div>`
      });
    }
  }
}

/** Nouveau tour : phase de réflexion automatique, sinon simple remise à zéro des priorités. */
async function onUpdateCombat(combat, changed) {
  if ( !game.user.isActiveGM ) return;
  if ( ("turn" in changed) && !("round" in changed) && (combat.phase?.state === "resolution") ) {
    return processTurnStart(combat);
  }
  if ( !("round" in changed) || (combat.round < 1) ) return;
  // « Apeuré » ne dure que le tour où il est infligé.
  for ( const c of combat.combatants ) {
    if ( c.actor?.statuses.has("peur") ) await c.actor.toggleStatusEffect("peur", { active: false });
  }
  if ( game.settings.get(SCOPE, "autoPlanning") ) return combat.startPlanning();
  const updates = combat.combatants.filter(c => c.priority || c.roundBonus)
    .map(c => ({ _id: c.id, [`flags.${SCOPE}.priority`]: 0, [`flags.${SCOPE}.roundBonus`]: 0 }));
  if ( updates.length ) return combat.updateEmbeddedDocuments("Combatant", updates);
}

/** Un Pokémon qui entre en cours de combat lance 1D10 + DEX pour rejoindre l'ordre (5.13). */
function onCreateCombatant(combatant, options, userId) {
  if ( (userId !== game.user.id) || !combatant.combat?.started ) return;
  if ( combatant.initiative === null ) combatant.combat.rollInitiative([combatant.id]);
}

/** Bouton de priorité sur chaque ligne du suivi de combat, et accès au panneau de combat. */
function onRenderCombatTracker(app, html) {
  const combat = app.viewed;
  const root = html instanceof HTMLElement ? html : html[0];
  if ( !root.querySelector(".hk-open-panel") ) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "hk-open-panel";
    open.innerHTML = `<i class="fa-solid fa-gamepad"></i> Panneau de combat`;
    open.addEventListener("click", () => game.hakaiKousen.openCombatPanel());
    const header = root.querySelector(".combat-tracker-header, header");
    if ( header ) header.append(open);
    else root.prepend(open);
  }
  if ( !combat ) return;

  for ( const li of root.querySelectorAll("[data-combatant-id]") ) {
    const combatant = combat.combatants.get(li.dataset.combatantId);
    if ( !combatant ) continue;
    const button = document.createElement("button");
    button.type = "button";
    const state = { 1: "priority", "-1": "last" }[combatant.priority] ?? "normal";
    button.className = `inline-control combatant-control icon fa-solid hk-priority ${state}`;
    button.classList.add(combatant.priority < 0 ? "fa-hourglass-end" : "fa-bolt");
    button.dataset.tooltip = {
      priority: "Action prioritaire ce tour (clic pour annuler)",
      last: "Agit en dernier ce tour (clic droit pour annuler)",
      normal: "Clic : action prioritaire ce tour · Clic droit : agit en dernier"
    }[state];
    button.disabled = !combatant.isOwner;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      combatant.togglePriority(1);
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      combatant.togglePriority(-1);
    });
    const controls = li.querySelector(".combatant-controls");
    if ( controls ) controls.prepend(button);
    else li.querySelector(".token-name, .name")?.append(button);
  }
}

/** Fin du chrono : le MJ actif révèle les choix, que son panneau soit ouvert ou non. */
function watchPlanningTimers() {
  const revealed = new Set();
  setInterval(() => {
    if ( !game.user.isActiveGM ) return;
    for ( const combat of game.combats ) {
      const phase = combat.phase;
      if ( (phase?.state !== "planning") || Number.isNumeric(phase.paused) || (combat.remaining > 0) ) continue;
      const key = `${combat.id}-${phase.round}-${phase.endsAt}`;
      if ( revealed.has(key) ) continue;
      revealed.add(key);
      combat.reveal();
    }
  }, 500);
}

export function registerCombatHooks() {
  Hooks.once("ready", watchPlanningTimers);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("updateCombatant", onUpdateCombatant);
  Hooks.on("updateActor", onUpdateActor);
  Hooks.on("createCombatant", onCreateCombatant);
  Hooks.on("renderCombatTracker", onRenderCombatTracker);
}
