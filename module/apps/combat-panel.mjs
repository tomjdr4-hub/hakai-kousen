/**
 * Panneau de combat : phase de réflexion chronométrée avec choix secrets, puis résolution dans l'ordre.
 */
import {
  ACTION_KINDS, describeChoice, executeChoice, getActionOptions, isChoiceComplete, requestReplacement, setChoice
} from "../combat/actions.mjs";
import { deploy, endCombatWithXP, getSetup, openSetupDialog, setDeployChoice, validTeam } from "../combat/setup.mjs";
import { blockedReason } from "../combat/turn-start.mjs";
import { EMPTY_CHOICE, SCOPE } from "../documents/combat.mjs";
import { COMBAT_FORMATS, COMBAT_TYPES, STATUSES, TYPES } from "../config.mjs";
import { dodgeLevel, DODGE_COST } from "../combat/skills.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class CombatPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hk-combat-panel",
    classes: ["hakai-kousen", "hk-combat-panel"],
    window: { title: "Combat Pokémon", icon: "fa-solid fa-gamepad", resizable: true },
    position: { width: 580, height: 720 },
    actions: {
      selectKind: CombatPanel.#onSelectKind,
      selectAttack: CombatPanel.#onSelectAttack,
      toggleTarget: CombatPanel.#onToggleTarget,
      selectSwitch: CombatPanel.#onSelectSwitch,
      validateChoice: CombatPanel.#onValidateChoice,
      editChoice: CombatPanel.#onEditChoice,
      executeChoice: CombatPanel.#onExecuteChoice,
      skipTurn: CombatPanel.#onSkipTurn,
      startPlanning: CombatPanel.#onStartPlanning,
      togglePause: CombatPanel.#onTogglePause,
      addTime: CombatPanel.#onAddTime,
      reveal: CombatPanel.#onReveal,
      newCombat: CombatPanel.#onNewCombat,
      toggleDeploy: CombatPanel.#onToggleDeploy,
      validateDeploy: CombatPanel.#onValidateDeploy,
      deployNow: CombatPanel.#onDeployNow,
      replace: CombatPanel.#onReplace,
      endCombat: CombatPanel.#onEndCombat,
      groupInitiative: CombatPanel.#onGroupInitiative
    }
  };

  static PARTS = {
    panel: { template: "systems/hakai-kousen/templates/apps/combat-panel.hbs", scrollable: [".hk-panel-body"] }
  };

  /** Choix en cours d'édition, non encore enregistrés : combatantId -> choix. */
  #drafts = new Map();

  /** Pokémon de départ en cours de sélection : trainerId -> Set d'UUID. */
  #deployDrafts = new Map();

  #interval = null;

  /** Phase pour laquelle la fin du chrono a déjà été traitée (son, révélation). */
  #expiredFor = null;

  /** Champ de saisie actif, restauré après un nouveau rendu. */
  #focus = null;

  get combat() {
    return game.combat;
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const combat = this.combat;
    const isGM = game.user.isGM;
    if ( !combat ) return { noCombat: true, isGM };

    const phase = combat.phase;
    const state = phase?.state ?? "idle";
    const planning = state === "planning";
    const resolution = state === "resolution";
    const deploying = state === "deploy";
    const current = combat.combatant;
    const setup = getSetup(combat);
    // Dresseurs que cet utilisateur dirige : les siens (joueur) ou ceux sans joueur (MJ).
    const controls = actor => actor.isOwner && (isGM ? !actor.hasPlayerOwner : true);

    // Combattants que cet utilisateur dirige : les siens (joueur) ou ceux sans joueur (MJ).
    const mine = combat.combatants.filter(c => c.actor && (isGM ? !c.hasPlayerOwner : c.isOwner))
      .map(c => this.#prepareChoice(c, combat));

    const order = combat.turns.filter(c => isGM || !c.hidden).map(c => {
      const choice = c.choice;
      const own = c.isOwner && (isGM ? !c.hasPlayerOwner : true);
      let status;
      if ( c.isKO ) status = "<em>KO</em>";
      else if ( resolution || (planning && own) ) status = describeChoice(c, combat);
      else if ( planning ) status = choice.ready ? `<i class="fa-solid fa-check"></i> Prêt` : `<i class="fa-solid fa-hourglass-half"></i> Réfléchit…`;
      else status = "";
      const isCurrent = resolution && (current?.id === c.id);
      const blocked = resolution ? blockedReason(c) : null;
      if ( blocked && !c.isKO ) status = `<span class="hk-blocked">${blocked} : ne peut pas agir</span> · ${status}`;
      return {
        id: c.id,
        name: c.name,
        img: c.img,
        init: c.turnInitiative ?? "—",
        bonus: c.roundBonus,
        priority: c.priority,
        pack: c.getFlag(SCOPE, "pack"),
        ko: c.isKO,
        done: choice.done,
        current: isCurrent,
        status,
        canExecute: isCurrent && c.isOwner && !choice.done,
        canSkip: isCurrent && isGM
      };
    });

    // Remplacements après KO (gratuits) que cet utilisateur doit choisir.
    const replacements = combat.pendingReplacements.filter(r => controls(r.trainer)).map(r => ({
      combatantId: r.combatant.id,
      name: r.combatant.name,
      trainer: r.trainer.name,
      reserve: r.reserve.map(p => ({ uuid: p.uuid, name: p.name, img: p.img, vit: p.system.vit.value, vitMax: p.system.vit.max }))
    }));

    // Envoi des Pokémon de départ.
    const deployCards = [];
    const deployStatus = [];
    if ( deploying ) {
      for ( const uuid of setup.trainers ) {
        const trainer = fromUuidSync(uuid);
        if ( !trainer ) continue;
        const saved = setup.deploy[trainer.id] ?? [];
        deployStatus.push({ name: trainer.name, ready: saved.length > 0 });
        if ( !controls(trainer) ) continue;
        const draft = this.#deployDrafts.get(trainer.id) ?? new Set(saved);
        deployCards.push({
          id: trainer.id,
          name: trainer.name,
          img: trainer.img,
          ready: saved.length > 0,
          count: draft.size,
          format: setup.format,
          complete: draft.size === Math.min(setup.format, validTeam(trainer).length),
          team: validTeam(trainer).map(p => ({
            uuid: p.uuid, name: p.name, img: p.img, vit: p.system.vit.value, vitMax: p.system.vit.max,
            obedience: p.system.relation.obedience,
            lowObedience: (setup.format > 1) && (p.system.relation.obedience < 6),
            selected: draft.has(p.uuid)
          }))
        });
      }
    }

    return {
      isGM,
      round: combat.round,
      started: combat.started,
      state,
      planning,
      resolution,
      deploying,
      combatType: COMBAT_TYPES[setup.type],
      format: COMBAT_FORMATS[setup.format],
      paused: planning && Number.isNumeric(phase.paused),
      phaseLabel: {
        deploy: "Envoi des Pokémon de départ",
        planning: "Réflexion : choisissez votre action",
        resolution: "Résolution dans l'ordre",
        idle: combat.started ? "En attente du MJ" : "Combat non commencé"
      }[state],
      mine: planning ? mine : [],
      replacements,
      deployCards,
      deployStatus,
      teams: this.#prepareTeams(combat, isGM),
      readyCount: combat.combatants.filter(c => c.needsChoice && c.choice.ready).length,
      activeCount: combat.combatants.filter(c => c.needsChoice).length,
      order
    };
  }

  /**
   * Bandeaux d'équipe (fiche de suivi, MJ 7.3). Le propriétaire et le MJ voient les valeurs ;
   * les adversaires voient seulement les jauges et les KO.
   */
  #prepareTeams(combat, isGM) {
    const inCombat = new Set(combat.combatants.map(c => c.actorId));
    return combat.trainers.map(trainer => {
      const detailed = isGM || trainer.isOwner;
      const members = trainer.system.team.map(uuid => fromUuidSync(uuid)).filter(Boolean).map(p => {
        const vit = p.system.vit;
        const ene = p.system.ene;
        const ko = vit.value <= 0;
        return {
          name: p.name,
          img: p.img,
          ko,
          active: inCombat.has(p.id) && !ko,
          detailed,
          vit: vit.value, vitMax: vit.max, quarter: Math.floor(vit.max / 4),
          ene: ene.value, eneMax: ene.max,
          vitPct: vit.max ? Math.clamp(Math.round(vit.value / vit.max * 100), 0, 100) : 0,
          enePct: ene.max ? Math.clamp(Math.round(ene.value / ene.max * 100), 0, 100) : 0,
          weakened: !ko && (vit.value <= Math.floor(vit.max / 4)),
          statuses: [...p.statuses].filter(s => STATUSES[s]).map(s => ({ img: STATUSES[s].img, label: STATUSES[s].label }))
        };
      });
      return {
        name: trainer.name,
        img: trainer.img,
        members,
        remaining: members.filter(m => !m.ko).length,
        defeated: combat.started && combat.isTrainerDefeated(trainer)
      };
    });
  }

  /** Données d'une carte de choix. */
  #prepareChoice(combatant, combat) {
    const saved = combatant.choice;
    const choice = this.#drafts.get(combatant.id) ?? saved;
    const options = getActionOptions(combatant, combat);
    const single = choice.kind === "ball";
    // Duo : commander deux Pokémon demande Obéissance 6 avec chacun (5.14).
    const trainer = combatant.trainer;
    const partners = trainer ? combat.combatants.filter(c => (c.trainer?.id === trainer.id) && !c.isKO).length : 0;
    const obedience = combatant.actor.system.relation?.obedience;
    const dodge = dodgeLevel(combatant.actor);
    // Capacité Z : mécanique débloquée, une par Dresseur et par combat, Pokémon obéissant, ENE ≥ moitié du max.
    const ene = combatant.actor.system.ene;
    const zAvailable = !!trainer?.system.mechanics.zmove.unlocked && (combatant.actor.type === "pokemon")
      && !combat.getFlag(SCOPE, "zUsed")?.[trainer.id] && (combatant.actor.system.dressage >= 8)
      && (ene.value >= Math.floor(ene.max / 2));
    return {
      zAvailable,
      zCost: Math.floor((ene?.max ?? 0) / 2),
      zmove: choice.zmove,
      dodgeLevel: dodge,
      dodgeCost: dodge ? DODGE_COST[Math.min(dodge, 5)] : 0,
      dodge: choice.dodge,
      duoWarning: (partners > 1) && Number.isNumeric(obedience) && (obedience < 6),
      obedience,
      trainerActionTakenBy: options.trainerActionTakenBy,
      id: combatant.id,
      name: combatant.name,
      img: combatant.img,
      ko: combatant.isKO,
      ready: saved.ready,
      summary: describeChoice(combatant, combat),
      ene: combatant.actor.type === "pokemon" ? `${combatant.actor.system.ene.value} / ${combatant.actor.system.ene.max}` : null,
      dressage: combatant.actor.system.dressage,
      is: { [choice.kind]: true },
      complete: isChoiceComplete(choice),
      note: choice.note,
      kinds: options.kinds.map(k => ({ key: k, ...ACTION_KINDS[k], active: choice.kind === k })),
      attacks: options.attacks.map(a => ({ ...a, typeLabel: TYPES[a.type], selected: a.id === choice.itemId })),
      targets: options.targets
        .filter(t => !single || t.wild)
        .map(t => ({ ...t, selected: choice.targets.includes(t.id) })),
      team: options.team.map(p => ({ ...p, selected: p.uuid === choice.switchTo })),
      items: options.items.map(i => ({ ...i, selected: i.id === choice.itemId })),
      balls: options.balls.map(i => ({ ...i, selected: i.id === choice.itemId })),
      allies: options.allies.map(a => ({ ...a, selected: a.uuid === choice.targets[0] }))
    };
  }

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    const active = this.element?.contains(document.activeElement) ? document.activeElement : null;
    this.#focus = active?.dataset.draftField
      ? { field: active.dataset.draftField, combatant: active.closest("[data-combatant]")?.dataset.combatant, pos: active.selectionStart }
      : null;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Listes déroulantes et texte libre : mise à jour du brouillon.
    for ( const input of this.element.querySelectorAll("[data-draft-field]") ) {
      const id = input.closest("[data-combatant]").dataset.combatant;
      const event = ((input.tagName === "SELECT") || (input.type === "checkbox")) ? "change" : "input";
      input.addEventListener(event, () => {
        const draft = this.#draft(id);
        if ( input.dataset.draftField === "target" ) draft.targets = input.value ? [input.value] : [];
        else if ( input.type === "checkbox" ) draft[input.dataset.draftField] = input.checked;
        else draft[input.dataset.draftField] = input.value;
        if ( (input.tagName === "SELECT") || (input.type === "checkbox") ) this.render();
        else this.element.querySelector(`[data-combatant="${id}"] [data-action=validateChoice]`)
          ?.toggleAttribute("disabled", !isChoiceComplete(draft));
      });
    }
    if ( this.#focus ) {
      const selector = `[data-combatant="${this.#focus.combatant}"] [data-draft-field="${this.#focus.field}"]`;
      const input = this.element.querySelector(selector);
      input?.focus();
      if ( Number.isNumeric(this.#focus.pos) ) input?.setSelectionRange?.(this.#focus.pos, this.#focus.pos);
    }
    this.#interval ??= setInterval(() => this.#tick(), 250);
    this.#tick();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    clearInterval(this.#interval);
    this.#interval = null;
  }

  /** Chrono : barre, texte et alerte sonore (la révélation est faite par le MJ actif, voir combat.mjs). */
  #tick() {
    const combat = this.combat;
    const phase = combat?.phase;
    const timer = this.element?.querySelector(".hk-timer");
    if ( !timer || (phase?.state !== "planning") ) return;
    const remaining = combat.remaining;
    const seconds = Math.ceil(remaining / 1000);
    const ratio = phase.duration ? Math.clamp(remaining / (phase.duration * 1000), 0, 1) : 0;
    timer.querySelector(".hk-timer-fill").style.width = `${ratio * 100}%`;
    timer.querySelector(".hk-timer-text").textContent = remaining > 0
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : "Temps écoulé !";
    timer.classList.toggle("warning", seconds <= 10);
    timer.classList.toggle("danger", seconds <= 5);

    if ( (remaining > 0) || Number.isNumeric(phase.paused) ) return;
    const key = `${combat.id}-${phase.round}-${phase.endsAt}`;
    if ( this.#expiredFor === key ) return;
    this.#expiredFor = key;
    foundry.audio.AudioHelper.play({ src: CONFIG.sounds.notification, volume: 0.8 }, false);
  }

  /* -------------------------------------------- */
  /*  Brouillons                                  */
  /* -------------------------------------------- */

  #draft(combatantId) {
    if ( !this.#drafts.has(combatantId) ) {
      const combatant = this.combat.combatants.get(combatantId);
      this.#drafts.set(combatantId, foundry.utils.deepClone(combatant?.choice ?? EMPTY_CHOICE));
    }
    return this.#drafts.get(combatantId);
  }

  static #combatantId(target) {
    return target.closest("[data-combatant]").dataset.combatant;
  }

  static #onSelectKind(event, target) {
    const id = CombatPanel.#combatantId(target);
    this.#drafts.set(id, { ...foundry.utils.deepClone(EMPTY_CHOICE), kind: target.dataset.kind });
    const options = getActionOptions(this.combat.combatants.get(id), this.combat);
    // Présélections pratiques : premier objet, première Ball.
    const draft = this.#drafts.get(id);
    if ( draft.kind === "item" ) draft.itemId = options.items[0]?.id ?? "";
    if ( draft.kind === "ball" ) draft.itemId = options.balls[0]?.id ?? "";
    this.render();
  }

  static #onSelectAttack(event, target) {
    this.#draft(CombatPanel.#combatantId(target)).itemId = target.dataset.item;
    this.render();
  }

  static #onToggleTarget(event, target) {
    const draft = this.#draft(CombatPanel.#combatantId(target));
    const id = target.dataset.target;
    if ( draft.kind === "ball" ) draft.targets = [id];
    else draft.targets = draft.targets.includes(id) ? draft.targets.filter(t => t !== id) : [...draft.targets, id];
    this.render();
  }

  static #onSelectSwitch(event, target) {
    this.#draft(CombatPanel.#combatantId(target)).switchTo = target.dataset.uuid;
    this.render();
  }

  static async #onValidateChoice(event, target) {
    const id = CombatPanel.#combatantId(target);
    const combatant = this.combat.combatants.get(id);
    const draft = this.#draft(id);
    if ( !combatant || !isChoiceComplete(draft) ) return;
    await setChoice(combatant, { ...draft, ready: true, done: false });
    this.#drafts.delete(id);
  }

  static async #onEditChoice(event, target) {
    const id = CombatPanel.#combatantId(target);
    const combatant = this.combat.combatants.get(id);
    if ( this.combat.phase?.state !== "planning" ) return;
    this.#drafts.set(id, foundry.utils.deepClone(combatant.choice));
    await setChoice(combatant, { ...combatant.choice, ready: false });
  }

  static async #onExecuteChoice(event, target) {
    const combatant = this.combat.combatants.get(CombatPanel.#combatantId(target));
    if ( !combatant ) return;
    target.disabled = true;
    await executeChoice(combatant);
  }

  static async #onSkipTurn() {
    return this.combat?.nextTurn();
  }

  /* -------------------------------------------- */
  /*  Contrôles du MJ                             */
  /* -------------------------------------------- */

  static async #onStartPlanning() {
    const combat = this.combat;
    if ( !combat ) return;
    this.#drafts.clear();
    if ( !combat.started ) return combat.startCombat();
    return combat.startPlanning();
  }

  static async #onTogglePause() {
    return this.combat?.togglePause();
  }

  static async #onAddTime() {
    return this.combat?.addTime(10);
  }

  static async #onReveal() {
    return this.combat?.reveal();
  }

  /* -------------------------------------------- */
  /*  Combat de Dresseurs                         */
  /* -------------------------------------------- */

  static async #onNewCombat() {
    await openSetupDialog();
    this.render();
  }

  static #onToggleDeploy(event, target) {
    const trainerId = target.closest("[data-trainer]").dataset.trainer;
    const setup = getSetup(this.combat);
    const draft = this.#deployDrafts.get(trainerId) ?? new Set(setup.deploy[trainerId] ?? []);
    const uuid = target.dataset.uuid;
    if ( draft.has(uuid) ) draft.delete(uuid);
    else {
      // Au-delà du format, le plus ancien choix est remplacé.
      if ( draft.size >= setup.format ) draft.delete(draft.values().next().value);
      draft.add(uuid);
    }
    this.#deployDrafts.set(trainerId, draft);
    this.render();
  }

  static async #onValidateDeploy(event, target) {
    const trainerId = target.closest("[data-trainer]").dataset.trainer;
    const trainer = game.actors.get(trainerId);
    const draft = this.#deployDrafts.get(trainerId);
    if ( !trainer || !draft?.size ) return;
    await setDeployChoice(this.combat, trainer, [...draft]);
    this.#deployDrafts.delete(trainerId);
  }

  /** Le MJ déploie sans attendre : les Dresseurs sans choix envoient leurs premiers Pokémon valides. */
  static async #onDeployNow() {
    const combat = this.combat;
    const setup = getSetup(combat);
    for ( const uuid of setup.trainers ) {
      const trainer = fromUuidSync(uuid);
      if ( trainer && !setup.deploy[trainer.id]?.length ) {
        const first = validTeam(trainer).slice(0, setup.format).map(p => p.uuid);
        await combat.setFlag(SCOPE, `setup.deploy.${trainer.id}`, first);
      }
    }
    return deploy(combat);
  }

  static async #onReplace(event, target) {
    const combatant = this.combat.combatants.get(target.closest("[data-combatant]").dataset.combatant);
    if ( combatant ) await requestReplacement(combatant, target.dataset.uuid);
  }

  static async #onEndCombat() {
    if ( this.combat ) await endCombatWithXP(this.combat);
  }

  /**
   * Meute : les combattants cochés partagent la meilleure initiative du groupe et agissent à la suite,
   * en conservant VIT, ENE et actions individuelles (MJ 5.9).
   */
  static async #onGroupInitiative() {
    const combat = this.combat;
    const ids = [...this.element.querySelectorAll("input[data-pack]:checked")].map(i => i.dataset.pack);
    if ( ids.length < 2 ) return ui.notifications.warn("Cochez au moins deux combattants à grouper.");
    const members = ids.map(id => combat.combatants.get(id)).filter(Boolean);
    const initiative = Math.max(...members.map(c => c.initiative ?? 0));
    const pack = foundry.utils.randomID();
    await combat.updateEmbeddedDocuments("Combatant", members.map((c, i) => ({
      _id: c.id, initiative, [`flags.${SCOPE}.pack`]: pack, [`flags.${SCOPE}.tiebreak`]: 1000 - i
    })));
  }

  /** Vide les brouillons à chaque nouvelle phase de réflexion. */
  resetDrafts() {
    this.#drafts.clear();
    this.#deployDrafts.clear();
  }
}

/* -------------------------------------------- */
/*  Ouverture et mises à jour                   */
/* -------------------------------------------- */

let panel = null;

export function openCombatPanel() {
  panel ??= new CombatPanel();
  return panel.render({ force: true });
}

const refresh = foundry.utils.debounce(() => {
  if ( panel?.rendered ) panel.render();
}, 100);

export function registerCombatPanelHooks() {
  for ( const hook of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant",
    "updateActor", "updateItem", "createActiveEffect", "deleteActiveEffect"] ) {
    Hooks.on(hook, refresh);
  }
  // Nouveau combat de Dresseurs : ouverture chez les participants.
  Hooks.on("createCombat", combat => {
    const trainers = combat.getFlag(SCOPE, "setup")?.trainers ?? [];
    const participates = game.user.isGM || trainers.some(u => fromUuidSync(u)?.isOwner);
    if ( participates && game.settings.get(SCOPE, "autoOpenPanel") && !panel?.rendered ) openCombatPanel();
  });
  Hooks.on("updateCombat", (combat, changed) => {
    const phase = changed.flags?.[SCOPE]?.phase;
    if ( ["planning", "deploy"].includes(phase?.state) ) {
      panel?.resetDrafts();
      // Ouverture automatique pour les participants au début de chaque réflexion.
      const participates = game.user.isGM || combat.combatants.some(c => c.isOwner);
      if ( participates && game.settings.get(SCOPE, "autoOpenPanel") && !panel?.rendered ) openCombatPanel();
    }
    refresh();
  });
}
