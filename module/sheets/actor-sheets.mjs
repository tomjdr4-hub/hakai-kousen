import { HK, typeEffectiveness } from "../config.mjs";
import { rollAttack, rollAttribute, rollDressage, rollPool } from "../dice/rolls.mjs";
import { syncCounters, useItemOn } from "../combat/effects.mjs";
import { isSelfAttack, opponentsOf } from "../combat/actions.mjs";
import { openPretires } from "../apps/pretires.mjs";
import { consumeTM, createEgg, fish, giveToPokemon, hatch, incubate, mine, pokemonCenter, returnHeld, sell, shop, work } from "../activities.mjs";
import {
  evolve, learnNextAttack, learnsetStatus, moveBetweenTeamAndPC, raiseRelation, spendEV, spendPokeskill, spendTrainerXP,
  toggleDynamax, toggleMega, toggleTera
} from "../progression.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Base commune aux fiches Dresseur et Pokémon.
 */
class HKActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hakai-kousen", "sheet", "actor"],
    position: { width: 800, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAttribute: HKActorSheet._onRollAttribute,
      createItem: HKActorSheet._onCreateItem,
      editItem: HKActorSheet._onEditItem,
      deleteItem: HKActorSheet._onDeleteItem,
      longRest: HKActorSheet._onLongRest,
      fullHeal: HKActorSheet._onFullHeal,
      toggleStatus: HKActorSheet._onToggleStatus
    }
  };

  /** Champs HTML à enrichir pour l'affichage. */
  static HTML_FIELDS = [];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    Object.assign(context, {
      actor,
      system: actor.system,
      config: HK,
      editable: this.isEditable,
      isGM: game.user.isGM,
      tabs: this._prepareTabs("primary"),
      conditions: this._prepareConditions(),
      enriched: {}
    });
    for ( const field of this.constructor.HTML_FIELDS ) {
      context.enriched[field] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system[field], {
        relativeTo: actor,
        secrets: actor.isOwner
      });
    }
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Édition directe de champs d'objets depuis la fiche (quantité, niveau...).
    this.element.querySelectorAll("[data-item-field]").forEach(input => {
      input.addEventListener("change", event => {
        event.stopPropagation();
        const item = this.actor.items.get(input.closest("[data-item-id]")?.dataset.itemId);
        const value = input.type === "number" ? Number(input.value) : input.value;
        item?.update({ [input.dataset.itemField]: value });
      });
    });
  }

  /** États affichés en en-tête : KO puis altérations et états de combat, avec leurs compteurs. */
  _prepareConditions() {
    const actor = this.actor;
    const conditions = actor.system.conditions;
    const counters = conditions ? {
      toxik: { label: "Tour", name: "system.conditions.toxik", value: conditions.toxik, max: 99,
        tooltip: "Tour de Toxik : dégâts = 1/20 de la VIT max × ce nombre" },
      confusion: { label: "Stade", name: "system.conditions.confusion", value: conditions.confusion, max: 3,
        tooltip: "Stade 1 : sort sur 10 · stade 2 : sur 8-10 · stade 3 : sur 6-10, puis fin" },
      sommeil: { label: "Réveil", name: "system.conditions.sommeil", value: conditions.sommeil, max: 10,
        tooltip: "Seuil de réveil sur 1D10 : 6+ au départ, −1 par tour endormi et à chaque coup reçu" }
    } : {};
    return [
      { id: "dead", label: "KO", img: "icons/svg/skull.svg", rule: "0 VIT ou moins." },
      ...Object.entries(HK.STATUSES).map(([id, s]) => ({ id, ...s }))
    ].map(c => {
      const active = actor.statuses.has(c.id);
      return { ...c, active, counter: active ? counters[c.id] : null };
    });
  }

  /** Objet visé par un bouton d'une ligne d'objet. */
  _getItem(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static async _onRollAttribute(event, target) {
    return rollAttribute(this.actor, target.dataset.attribute);
  }

  static async _onCreateItem(event, target) {
    const type = target.dataset.type;
    const system = target.dataset.category ? { category: target.dataset.category } : {};
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize(`TYPES.Item.${type}`),
      type,
      system
    }]);
    item?.sheet.render(true);
  }

  static _onEditItem(event, target) {
    this._getItem(target)?.sheet.render(true);
  }

  static async _onDeleteItem(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Supprimer" },
      content: `<p>Supprimer <strong>${item.name}</strong> ?</p>`,
      rejectClose: false
    });
    if ( confirmed ) await item.delete();
  }

  static async _onToggleStatus(event, target) {
    const id = target.dataset.status;
    await this.actor.toggleStatusEffect(id);
    await syncCounters(this.actor, id, this.actor.statuses.has(id));
  }

  static async _onLongRest() {
    return this.actor.longRest();
  }

  static async _onFullHeal() {
    return this.actor.fullHeal();
  }
}

/* -------------------------------------------- */

export class TrainerSheet extends HKActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["trainer"],
    actions: {
      rollDomain: TrainerSheet._onRollDomain,
      useGear: TrainerSheet._onUseGear,
      spendXP: TrainerSheet._onSpendXP,
      newEgg: TrainerSheet._onNewEgg,
      incubate: TrainerSheet._onIncubate,
      hatch: TrainerSheet._onHatch,
      fish: TrainerSheet._onFish,
      work: TrainerSheet._onWork,
      pretires: TrainerSheet._onPretires,
      mine: TrainerSheet._onMine,
      center: TrainerSheet._onCenter,
      shop: TrainerSheet._onShop,
      sell: TrainerSheet._onSell,
      giveItem: TrainerSheet._onGiveItem,
      toPC: TrainerSheet._onToPC,
      toTeam: TrainerSheet._onToTeam,
      removeFromPC: TrainerSheet._onRemoveFromPC,
      openMember: TrainerSheet._onOpenMember,
      removeMember: TrainerSheet._onRemoveMember
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/hakai-kousen/templates/actor/trainer-sheet.hbs",
      scrollable: [".tab"]
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "Caractéristiques" },
        { id: "team", label: "Équipe" },
        { id: "inventory", label: "Inventaire" },
        { id: "bio", label: "Background" }
      ],
      initial: "main"
    }
  };

  static HTML_FIELDS = ["biography", "objectives", "badges", "notes"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    // Coûts en XP Dresseur : Caractéristique 4 × valeur ; domaine 2 à l'ouverture puis 2 × Niveau (3.12).
    context.attributes = Object.entries(HK.ATTRIBUTES).map(([key, cfg]) => ({
      key, ...cfg, ...system.attributes[key], cost: 4 * system.attributes[key].total
    }));
    const domains = (group, labels) => Object.entries(labels).map(([key, label]) => {
      const domain = system[group][key];
      return { key, label, group, ...domain, cost: domain.level ? 2 * domain.level : 2, maxed: domain.level >= 5,
        suggestions: HK.SPEC_SUGGESTIONS[key] ?? [] };
    });
    context.skills = domains("skills", HK.SKILLS);
    context.knowledges = domains("knowledges", HK.KNOWLEDGES);

    const member = uuid => {
      const pokemon = fromUuidSync(uuid);
      if ( !pokemon ) return { uuid, missing: true };
      const sys = pokemon.system;
      // États visibles d'un coup d'œil : KO, altérations et états de combat, affaiblissement, Nouveau-né, objet tenu.
      const states = [];
      if ( sys.vit?.value <= 0 ) states.push({ label: "KO", cls: "ko" });
      for ( const id of pokemon.statuses ) if ( HK.STATUSES[id] ) states.push({ label: HK.STATUSES[id].label, cls: "status" });
      if ( sys.weakened ) states.push({ label: "Affaibli", cls: "status" });
      if ( sys.newborn ) states.push({ label: `Nouveau-né ${sys.xp.total}/100`, cls: "info" });
      const held = pokemon.itemTypes.gear.find(i => i.system.quantity > 0);
      return { uuid, pokemon, states, held: held?.name,
        types: [sys.types?.primary, sys.types?.secondary].filter(Boolean).map(t => HK.TYPES[t]).join(" / ") };
    };
    context.team = system.team.map(member).map(m => ({ ...m, role: m.pokemon ? (system.npc.roles?.[m.pokemon.id] ?? "") : "" }));
    context.isNPC = !this.actor.hasPlayerOwner;
    context.npcRoles = HK.NPC_ROLES;
    context.pc = system.pc.map(member);
    context.pcCost = system.pc.length * 50;

    context.mechanics = [
      { key: "mega", label: "Méga-Évolution", item: "Gemme Sésame" },
      { key: "zmove", label: "Capacité Z", item: "Bracelet Z" },
      { key: "tera", label: "Téracristallisation", item: "Orbe Téracristal" },
      { key: "dynamax", label: "Dynamax / Gigamax", item: "Poignet Dynamax" }
    ].map(m => ({ ...m, ...system.mechanics[m.key] }));

    const gear = this.actor.itemTypes.gear;
    context.inventory = Object.entries(HK.GEAR_CATEGORIES).map(([key, label]) => ({
      key, label, items: gear.filter(i => i.system.category === key)
    }));
    context.eggs = this.actor.itemTypes.egg.map(egg => ({ egg, ready: egg.system.progress >= 100 }));
    if ( system.creation ) context.creation = this._creationCheck();
    return context;
  }

  /** Contrôle des règles de création du Dresseur (3.7 à 3.10). */
  _creationCheck() {
    const s = this.actor.system;
    const attrs = Object.values(s.attributes);
    const pts = attrs.reduce((sum, a) => sum + a.pts, 0);
    const skills = Object.values(s.skills);
    const knowledges = Object.values(s.knowledges);
    const sum = list => list.reduce((t, d) => t + d.level, 0);
    const specs = list => list.filter(d => d.spec.trim());
    const ok = (test, label) => ({ ok: test, label });
    return [
      ok(pts === 10, `Caractéristiques : ${pts} / 10 points répartis (base 1 partout)`),
      ok(attrs.every(a => a.total <= 5), "Aucune Caractéristique au-dessus de 5"),
      ok(sum(skills) >= 5, `Compétences : ${sum(skills)} points (5 minimum)`),
      ok(sum(knowledges) >= 5, `Connaissances : ${sum(knowledges)} points (5 minimum)`),
      ok(sum(skills) + sum(knowledges) === 17, `Total : ${sum(skills) + sum(knowledges)} / 17 points`),
      ok([...skills, ...knowledges].every(d => d.level <= 3), "Aucun domaine au-dessus du Niveau 3"),
      ok(specs(skills).length <= 1 && specs(knowledges).length <= 1, "Au plus 1 Spécialisation de Compétence et 1 de Connaissance"),
      ok([...specs(skills), ...specs(knowledges)].every(d => d.level >= 3), "Spécialisations seulement sur un domaine au Niveau 3"),
      ok(s.vit.max === 10, "VIT 10"),
      ok(s.money >= 1500 && s.money <= 2000, `Argent : ${s.money} ₽ (1 500 à 2 000 conseillés)`)
    ];
  }

  static async _onNewEgg() { return createEgg(this.actor); }
  static async _onIncubate(event, target) {
    const egg = this._getItem(target);
    if ( egg ) return incubate(egg, target.dataset.conditions);
  }
  static async _onHatch(event, target) {
    const egg = this._getItem(target);
    if ( egg ) return hatch(egg);
  }
  static async _onGiveItem(event, target) {
    const item = this._getItem(target);
    if ( item ) return giveToPokemon(this.actor, item);
  }
  static async _onFish() { return fish(this.actor); }
  static async _onWork() { return work(this.actor); }
  static async _onPretires() {
    const pokemon = this.actor.system.team.map(u => fromUuidSync(u)).filter(Boolean);
    return openPretires({ pokemon, title: `équipe de ${this.actor.name}` });
  }
  static async _onMine() { return mine(this.actor); }
  static async _onCenter() { return pokemonCenter(this.actor); }
  static async _onShop() { return shop(this.actor); }
  static async _onSell(event, target) {
    const item = this._getItem(target);
    if ( item ) return sell(this.actor, item);
  }

  /** @override */
  async _onDropActor(event, actor) {
    if ( !this.isEditable || (actor.type !== "pokemon") ) return null;
    const team = this.actor.system.team;
    if ( team.includes(actor.uuid) ) return null;
    if ( team.length >= 6 ) ui.notifications.warn("L'équipe active compte déjà 6 Pokémon.");
    await this.actor.update({ "system.team": [...team, actor.uuid] });
    return actor;
  }

  static async _onRollDomain(event, target) {
    const { group, key } = target.dataset;
    const domain = this.actor.system[group][key];
    const label = (group === "skills" ? HK.SKILLS : HK.KNOWLEDGES)[key];
    return rollPool(this.actor, label, domain.level, domain.spec);
  }

  /** Utilise un objet de soin sur un Pokémon de l'équipe (ou sur le Dresseur). */
  static async _onUseGear(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const candidates = [this.actor, ...this.actor.system.team.map(u => fromUuidSync(u)).filter(Boolean)];
    const options = candidates.map((a, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${a.name}</option>`).join("");
    const index = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Utiliser ${item.name}` },
      content: `<div class="form-group"><label>Sur</label><div class="form-fields"><select name="target">${options}</select></div></div>`,
      ok: { label: "Utiliser", callback: (e, button) => Number(button.form.elements.target.value) },
      rejectClose: false
    });
    if ( index === null ) return;
    const actor = candidates[index];
    const result = await useItemOn(item, actor);
    if ( result === null ) return;
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `<div class="hk-card"><header><h3>${this.actor.name} utilise ${item.name}</h3></header>
        <p>Sur <strong>${actor.name}</strong> : ${result}</p></div>`
    });
  }

  static async _onOpenMember(event, target) {
    const pokemon = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    pokemon?.sheet.render(true);
  }

  static async _onRemoveMember(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    await this.actor.update({ "system.team": this.actor.system.team.filter(u => u !== uuid) });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Rôle d'un Pokémon de PNJ : enregistré par id d'acteur.
    for ( const select of this.element.querySelectorAll("select[data-npc-role]") ) {
      select.addEventListener("change", event => {
        event.stopPropagation();
        this.actor.update({ [`system.npc.roles.${select.dataset.npcRole}`]: select.value });
      });
    }
  }

  static async _onSpendXP(event, target) {
    return spendTrainerXP(this.actor, target.dataset.group, target.dataset.key);
  }

  static async _onToPC(event, target) {
    return moveBetweenTeamAndPC(this.actor, target.closest("[data-uuid]").dataset.uuid, true);
  }

  static async _onToTeam(event, target) {
    return moveBetweenTeamAndPC(this.actor, target.closest("[data-uuid]").dataset.uuid, false);
  }

  static async _onRemoveFromPC(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    await this.actor.update({ "system.pc": this.actor.system.pc.filter(u => u !== uuid) });
  }
}

/* -------------------------------------------- */

export class PokemonSheet extends HKActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["pokemon"],
    actions: {
      rollAttack: PokemonSheet._onRollAttack,
      rollPokeskill: PokemonSheet._onRollPokeskill,
      rollDressage: PokemonSheet._onRollDressage,
      resetTemp: PokemonSheet._onResetTemp,
      learnFromCompendium: PokemonSheet._onLearnFromCompendium,
      learnNext: PokemonSheet._onLearnNext,
      useHeld: PokemonSheet._onUseHeld,
      returnHeld: PokemonSheet._onReturnHeld,
      megaFromPokedex: PokemonSheet._onMegaFromPokedex,
      addPhase: PokemonSheet._onAddPhase,
      removePhase: PokemonSheet._onRemovePhase,
      spendEV: PokemonSheet._onSpendEV,
      spendSkill: PokemonSheet._onSpendSkill,
      raiseRelation: PokemonSheet._onRaiseRelation,
      evolve: PokemonSheet._onEvolve,
      toggleMega: PokemonSheet._onToggleMega,
      toggleDynamax: PokemonSheet._onToggleDynamax,
      toggleTera: PokemonSheet._onToggleTera,
      syncAttacks: PokemonSheet._onSyncAttacks
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/hakai-kousen/templates/actor/pokemon-sheet.hbs",
      scrollable: [".tab"]
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", label: "Statistiques" },
        { id: "progression", label: "Progression" },
        { id: "combat", label: "Combat" },
        { id: "attacks", label: "Capacités" },
        { id: "skills", label: "Compétences" },
        { id: "bio", label: "Description" }
      ],
      initial: "stats"
    }
  };

  static HTML_FIELDS = ["description", "mechanics", "sessions", "notes"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.stats = Object.entries(HK.POKEMON_STATS).map(([key, cfg]) => ({
      key, ...cfg, ...system.stats[key],
      rollable: key in HK.ATTRIBUTES,
      modified: (key in HK.ATTRIBUTES) && (system.stats[key].value !== system.stats[key].total)
    }));
    context.natures = Object.fromEntries(Object.entries(HK.NATURES).map(([k, n]) => {
      const mods = n.plus ? ` (+${HK.POKEMON_STATS[n.plus].abbr} / −${HK.POKEMON_STATS[n.minus].abbr})` : "";
      return [k, n.label + mods];
    }));
    context.secondaryTypes = { "": "—", ...HK.TYPES };
    // Effet HK optionnel de la Nature (4.5), au choix du MJ.
    context.natureEffect = HK.NATURES[system.nature]?.hk ?? null;
    context.dressage = system.dressage;
    context.obeys = system.dressage >= 8;
    context.weakened = system.weakened;

    // Sensibilités : multiplicateur de chaque type d'attaque contre ce Pokémon.
    const defTypes = system.defensiveTypes;
    context.sensitivities = Object.entries(HK.TYPES).map(([key, label]) => {
      const mult = typeEffectiveness(key, defTypes);
      const text = { 0: "×0", 0.25: "×¼", 0.5: "×½", 1: "", 2: "×2", 4: "×4" }[mult] ?? `×${mult}`;
      const cls = mult === 0 ? "immune" : mult > 1 ? "weak" : mult < 1 ? "resist" : "neutral";
      return { key, label, text, cls };
    });

    const items = this.actor.itemTypes;
    context.attacks = items.attack.map(item => ({
      item,
      typeLabel: HK.TYPES[item.system.type] ?? item.system.type,
      categoryLabel: HK.ATTACK_CATEGORIES[item.system.category],
      affordable: system.ene.value >= item.system.energy
    }));
    context.pokeskills = items.pokeskill.map(item => ({
      item,
      categoryLabel: HK.POKESKILL_CATEGORIES[item.system.category]?.label,
      nextCost: item.system.nextCost
    }));
    context.talents = items.talent;
    context.gear = items.gear;

    // Capacités et Talents de l'espèce, marqués s'ils sont déjà connus.
    const known = new Set(this.actor.items.map(i => i.name.toLowerCase()));
    // Par niveau : coût = niveau en XP Pokémon, dans l'ordre ; CT, œuf et tutorat : ajout direct.
    context.learnByLevel = learnsetStatus(this.actor).map(e => ({ ...e, typeLabel: HK.TYPES[e.type], byLevel: true }));
    context.learnByCT = system.speciesData.learnset.filter(e => e.source !== "level").map(entry => ({
      ...entry, typeLabel: HK.TYPES[entry.type], known: known.has(entry.name.toLowerCase())
    }));
    context.speciesTalents = system.speciesData.talents.map(t => ({ ...t, known: known.has(t.name.toLowerCase()) }));
    context.rarities = Object.fromEntries(Object.entries(HK.RARITIES).map(([k, r]) => [k, `${r.label} (capture ${r.capture ? `+${r.capture}` : "+0"})`]));
    context.vulnerableChoices = { "": "—", ...Object.fromEntries(Object.entries(HK.STATUSES).filter(([k]) => k !== "blessure").map(([k, s]) => [k, s.label])) };
    context.phases = system.boss.phases.map((p, index) => ({ ...p, index }));
    // Coût du prochain EV : 10 XP à l'ouverture, puis EV actuels × 7 (4.4).
    for ( const s of context.stats ) s.evCost = s.ev === 0 ? 10 : s.ev * 7;
    context.teraTypes = { "": "—", ...HK.TYPES, stellaire: "Stellaire" };
    context.formBonus = Object.entries(system.form.bonus).map(([key, value]) => ({ key, value, abbr: HK.POKEMON_STATS[key].abbr }));
    context.relationCost = system.semiLegendary ? 2 : 1;
    context.autoRarity = system.rarity !== system.encounter.rarity ? HK.RARITIES[system.rarity]?.label : null;
    // Starter (4.1) : 10 IV à répartir, 3 au maximum par statistique ; Confiance + Obéissance = 8.
    // Contrôle affiché pendant la création, tant que le Starter n'a gagné aucune XP.
    if ( system.starter && (system.xp.total === 0) ) {
      const ivs = Object.values(system.stats).map(st => st.iv);
      const total = ivs.reduce((a, b) => a + b, 0);
      context.starterCheck = [
        { ok: total === 10, label: `IV : ${total} / 10` },
        { ok: ivs.every(v => v <= 3), label: "3 IV au maximum par statistique" },
        { ok: system.dressage === 8, label: `Confiance + Obéissance = ${system.dressage} (8 par défaut)` }
      ];
    }
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Phases de Boss : la liste est enregistrée entière à chaque modification.
    for ( const input of this.element.querySelectorAll("[data-phase-field]") ) {
      input.addEventListener("change", event => {
        event.stopPropagation();
        const phases = foundry.utils.deepClone(this.actor.system.toObject().boss.phases);
        const phase = phases[Number(input.closest("[data-phase-index]").dataset.phaseIndex)];
        phase[input.dataset.phaseField] = input.type === "number" ? Number(input.value) : input.value;
        this.actor.update({ "system.boss.phases": phases });
      });
    }
  }

  static async _onSpendEV(event, target) {
    return spendEV(this.actor, target.dataset.stat);
  }

  static async _onSpendSkill(event, target) {
    const item = this._getItem(target);
    if ( item ) return spendPokeskill(this.actor, item);
  }

  static async _onRaiseRelation(event, target) {
    return raiseRelation(this.actor, target.dataset.which);
  }

  static async _onEvolve() {
    return evolve(this.actor);
  }

  static async _onToggleMega() {
    return toggleMega(this.actor);
  }

  static async _onToggleDynamax() {
    return toggleDynamax(this.actor);
  }

  static async _onToggleTera() {
    return toggleTera(this.actor);
  }

  static async _onAddPhase() {
    const phases = [...this.actor.system.toObject().boss.phases, { threshold: 50, label: "" }];
    return this.actor.update({ "system.boss.phases": phases });
  }

  static async _onRemovePhase(event, target) {
    const index = Number(target.closest("[data-phase-index]").dataset.phaseIndex);
    return this.actor.update({ "system.boss.phases": this.actor.system.toObject().boss.phases.filter((p, i) => i !== index) });
  }

  /**
   * Met à jour les capacités de la fiche avec les données du compendium (effets, priorité…),
   * retrouvées par leur source ou, à défaut, par leur nom.
   */
  static async _onSyncAttacks() {
    const pack = game.packs.get("hakai-kousen.capacites");
    if ( !pack ) return;
    const index = await pack.getIndex();
    const updates = [];
    for ( const item of this.actor.itemTypes.attack ) {
      const sourceId = item._stats?.compendiumSource;
      const entry = sourceId?.startsWith(pack.collection) ? index.get(sourceId.split(".").pop())
        : index.find(e => e.name.toLowerCase() === item.name.toLowerCase());
      if ( !entry ) continue;
      const source = await pack.getDocument(entry._id);
      updates.push({ _id: item.id, system: source.system.toObject(), "_stats.compendiumSource": source.uuid });
    }
    await this.actor.updateEmbeddedDocuments("Item", updates);
    ui.notifications.info(`${updates.length} capacité(s) mise(s) à jour depuis le compendium.`);
  }

  /** Apprend la prochaine attaque par expérience (coût = niveau). */
  static async _onLearnNext(event, target) {
    return learnNextAttack(this.actor, Number(target.dataset.index));
  }

  /** Ajoute à la fiche une Capacité ou un Talent du compendium (une CT est retirée de l'inventaire du Dresseur). */
  static async _onLearnFromCompendium(event, target) {
    const source = await fromUuid(target.dataset.uuid);
    if ( !source ) {
      ui.notifications.warn(`« ${target.dataset.name} » est introuvable dans les compendiums.`);
      return;
    }
    if ( (target.dataset.source === "ct") && !await consumeTM(this.actor, source.name) ) return;
    await this.actor.createEmbeddedDocuments("Item", [game.items.fromCompendium(source)]);
  }

  static async _onRollAttack(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const actor = this.actor;
    const targets = await PokemonSheet.#chooseTargets(actor, item);
    if ( targets === null ) return;
    // Chaque ordre demande un test de Dressage sous 8 (4.11), pour un Pokémon de joueur.
    if ( actor.hasPlayerOwner && (actor.system.dressage < 8) ) {
      const roll = (await rollDressage(actor))?.rolls?.[0];
      if ( roll && (roll.total > actor.system.dressage) ) return;
    }
    return rollAttack(actor, item, { targets });
  }

  /**
   * Cibles d'une attaque lancée depuis la fiche : jetons ciblés ; sinon l'adversaire unique du combat ;
   * sinon choix parmi les jetons de la scène. Renvoie null si le joueur annule.
   */
  static async #chooseTargets(actor, item) {
    const targeted = Array.from(game.user.targets).filter(t => t.actor);
    if ( targeted.length || isSelfAttack(actor, item.id) || (item.system.range && /^personnel/i.test(item.system.range)) ) return targeted;
    const combatant = game.combat?.started ? game.combat.combatants.find(c => c.actor?.id === actor.id) : null;
    let candidates = combatant ? opponentsOf(combatant, game.combat).map(c => c.token) : [];
    if ( !candidates.length && canvas.ready ) candidates = canvas.tokens.placeables.filter(t => t.actor && (t.actor.id !== actor.id)).map(t => t.document);
    if ( candidates.length === 1 ) return candidates;
    if ( !candidates.length ) {
      ui.notifications.info("Aucune cible sur la scène : l'attaque est lancée sans Table unique.");
      return [];
    }
    const options = candidates.map((t, i) => `<label class="checkbox"><input type="radio" name="target" value="${i}" ${i === 0 ? "checked" : ""}>
      ${t.name}${t.actor?.system?.vit ? ` <span class="hint">(VIT ${t.actor.system.vit.value}/${t.actor.system.vit.max})</span>` : ""}</label>`).join("");
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: `${item.name} : choisir la cible`, icon: "fa-solid fa-crosshairs" },
      content: `<p class="hint">Aucun jeton ciblé. Choisissez la cible : le toucher passe par la Table unique et les dégâts peuvent être appliqués.</p>
        <fieldset>${options}</fieldset>`,
      buttons: [
        { action: "target", label: "Attaquer", icon: "fa-solid fa-crosshairs", default: true,
          callback: (e, b) => Number(b.form.querySelector("input[name=target]:checked")?.value ?? 0) },
        { action: "none", label: "Sans cible", icon: "fa-solid fa-ban" }
      ],
      rejectClose: false
    });
    if ( (choice === null) || (choice === undefined) ) return null;
    if ( choice === "none" ) return [];
    return [candidates[choice]];
  }

  /** Forme Méga : types et bonus calculés à partir de la fiche Méga du Pokédex (écart avec l'espèce). */
  static async _onMegaFromPokedex() {
    const pack = game.packs.get("hakai-kousen.pokedex");
    const index = await pack.getIndex({ fields: ["system.number"] });
    const megas = [...index].filter(e => (e.system?.number === this.actor.system.number) && /^m[ée]ga/i.test(e.name));
    if ( !megas.length ) return ui.notifications.warn("Aucune forme Méga dans le Pokédex pour cette espèce.");
    let entry = megas[0];
    if ( megas.length > 1 ) {
      const id = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Forme Méga" },
        content: `<select name="mega">${megas.map(m => `<option value="${m._id}">${m.name}</option>`).join("")}</select>`,
        ok: { label: "Choisir", callback: (e, b) => b.form.elements.mega.value },
        rejectClose: false
      });
      if ( !id ) return;
      entry = megas.find(m => m._id === id);
    }
    const mega = await pack.getDocument(entry._id);
    const bonus = {};
    for ( const k of ["dex", "for", "con", "end", "vol"] ) bonus[k] = mega.system.stats[k].base - this.actor.system.stats[k].base;
    const talent = mega.system.speciesData.talents[0] ?? null;
    await this.actor.update({ "system.form": { ...this.actor.system.form.toObject?.() ?? this.actor.system.form, name: mega.name,
      primary: mega.system.types.primary, secondary: mega.system.types.secondary, bonus,
      talent: talent?.name ?? "", talentUuid: talent?.uuid ?? "" } });
    ui.notifications.info(`${mega.name} : types, bonus de statistiques${talent ? ` et Talent (${talent.name})` : ""} renseignés.`);
  }

  /** Objet tenu utilisé par le Pokémon lui-même, sans action du Dresseur (Jus de Baie, Baies). */
  static async _onUseHeld(event, target) {
    const item = this._getItem(target);
    if ( !item ) return;
    const result = await useItemOn(item, this.actor);
    if ( result === null ) return;
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `<div class="hk-card"><header><h3>${this.actor.name} utilise ${item.name}</h3></header><p>${result}</p></div>`
    });
  }

  static async _onReturnHeld(event, target) {
    const item = this._getItem(target);
    if ( item ) return returnHeld(this.actor, item);
  }

  static async _onRollPokeskill(event, target) {
    const item = this._getItem(target);
    if ( item ) return rollPool(this.actor, item.name, item.system.level);
  }

  static async _onRollDressage() {
    return rollDressage(this.actor);
  }

  static async _onResetTemp() {
    const updates = {};
    for ( const k of Object.keys(this.actor.system.stats) ) updates[`system.stats.${k}.temp`] = 0;
    updates["system.accuracyMod"] = 0;
    return this.actor.update(updates);
  }
}
