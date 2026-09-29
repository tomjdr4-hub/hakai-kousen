/**
 * Initiative Hakai Kousen (Manuel du Joueur 5.2, 5.3, 5.13).
 * - Initiative : 1D10 + DEX effective.
 * - Les actions prioritaires, annoncées en début de tour, sont résolues avant l'ordre normal ;
 *   à priorité égale, l'Initiative départage.
 * - Égalité d'Initiative : la meilleure DEX agit d'abord ; à DEX égale, on relance 1D10.
 */

const SCOPE = "hakai-kousen";

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

  /** Relance 1D10 utilisée pour départager une égalité parfaite. */
  get tiebreak() {
    return this.getFlag(SCOPE, "tiebreak") ?? 0;
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
    const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
    if ( ia !== ib ) return ib - ia;
    if ( a.dex !== b.dex ) return b.dex - a.dex;
    if ( a.tiebreak !== b.tiebreak ) return b.tiebreak - a.tiebreak;
    return a.id.localeCompare(b.id);
  }

  /**
   * Recalcule l'ordre quand une priorité ou un départage change.
   * @override
   */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( (collection !== "combatants") || !changes.some(c => c.flags?.[SCOPE]) ) return;
    this.setupTurns();
    if ( ui.combat?.viewed === this ) ui.combat.render();
  }

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

function onUpdateCombatant(combatant, changed) {
  if ( ("initiative" in changed) && game.user.isActiveGM ) resolveTiesSoon(combatant.combat);
}

/** Les priorités sont annoncées pour un tour : elles sont effacées au tour suivant. */
function onUpdateCombat(combat, changed) {
  if ( !("round" in changed) || !game.user.isActiveGM ) return;
  const updates = combat.combatants.filter(c => c.priority !== 0)
    .map(c => ({ _id: c.id, [`flags.${SCOPE}.priority`]: 0 }));
  if ( updates.length ) combat.updateEmbeddedDocuments("Combatant", updates);
}

/** Un Pokémon qui entre en cours de combat lance 1D10 + DEX pour rejoindre l'ordre (5.13). */
function onCreateCombatant(combatant, options, userId) {
  if ( (userId !== game.user.id) || !combatant.combat?.started ) return;
  if ( combatant.initiative === null ) combatant.combat.rollInitiative([combatant.id]);
}

/** Bouton de priorité sur chaque ligne du suivi de combat. */
function onRenderCombatTracker(app, html) {
  const combat = app.viewed;
  if ( !combat ) return;
  const root = html instanceof HTMLElement ? html : html[0];
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

export function registerCombatHooks() {
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("updateCombatant", onUpdateCombatant);
  Hooks.on("createCombatant", onCreateCombatant);
  Hooks.on("renderCombatTracker", onRenderCombatTracker);
}
