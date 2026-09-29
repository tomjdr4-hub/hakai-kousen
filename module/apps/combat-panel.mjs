/**
 * Panneau de combat : phase de réflexion chronométrée avec choix secrets, puis résolution dans l'ordre.
 */
import { ACTION_KINDS, describeChoice, executeChoice, getActionOptions, isChoiceComplete, setChoice } from "../combat/actions.mjs";
import { EMPTY_CHOICE, SCOPE } from "../documents/combat.mjs";
import { TYPES } from "../config.mjs";

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
      reveal: CombatPanel.#onReveal
    }
  };

  static PARTS = {
    panel: { template: "systems/hakai-kousen/templates/apps/combat-panel.hbs", scrollable: [".hk-panel-body"] }
  };

  /** Choix en cours d'édition, non encore enregistrés : combatantId -> choix. */
  #drafts = new Map();

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
    const current = combat.combatant;

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
      return {
        id: c.id,
        name: c.name,
        img: c.img,
        init: c.turnInitiative ?? "—",
        bonus: c.roundBonus,
        priority: c.priority,
        ko: c.isKO,
        done: choice.done,
        current: isCurrent,
        status,
        canExecute: isCurrent && c.isOwner && !choice.done,
        canSkip: isCurrent && isGM
      };
    });

    return {
      isGM,
      round: combat.round,
      started: combat.started,
      state,
      planning,
      resolution,
      paused: planning && Number.isNumeric(phase.paused),
      phaseLabel: { planning: "Réflexion : choisissez votre action", resolution: "Résolution dans l'ordre", idle: combat.started ? "En attente du MJ" : "Combat non commencé" }[state],
      mine: planning ? mine : [],
      readyCount: combat.combatants.filter(c => c.needsChoice && c.choice.ready).length,
      activeCount: combat.combatants.filter(c => c.needsChoice).length,
      order
    };
  }

  /** Données d'une carte de choix. */
  #prepareChoice(combatant, combat) {
    const saved = combatant.choice;
    const choice = this.#drafts.get(combatant.id) ?? saved;
    const options = getActionOptions(combatant, combat);
    const single = choice.kind === "ball";
    return {
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
      const event = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(event, () => {
        const draft = this.#draft(id);
        if ( input.dataset.draftField === "target" ) draft.targets = input.value ? [input.value] : [];
        else draft[input.dataset.draftField] = input.value;
        if ( input.tagName === "SELECT" ) this.render();
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

  /** Vide les brouillons à chaque nouvelle phase de réflexion. */
  resetDrafts() {
    this.#drafts.clear();
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
  for ( const hook of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "updateActor", "updateItem"] ) {
    Hooks.on(hook, refresh);
  }
  Hooks.on("updateCombat", (combat, changed) => {
    const phase = changed.flags?.[SCOPE]?.phase;
    if ( phase?.state === "planning" ) {
      panel?.resetDrafts();
      // Ouverture automatique pour les participants au début de chaque réflexion.
      const participates = game.user.isGM || combat.combatants.some(c => c.isOwner);
      if ( participates && game.settings.get(SCOPE, "autoOpenPanel") && !panel?.rendered ) openCombatPanel();
    }
    refresh();
  });
}
