import { HK, typeEffectiveness } from "../config.mjs";
import { rollAttack, rollAttribute, rollDressage, rollPool } from "../dice/rolls.mjs";

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
      fullHeal: HKActorSheet._onFullHeal
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
      tabs: this._prepareTabs("primary"),
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

    context.attributes = Object.entries(HK.ATTRIBUTES).map(([key, cfg]) => ({ key, ...cfg, ...system.attributes[key] }));
    const domains = (group, labels) => Object.entries(labels).map(([key, label]) => ({
      key, label, group, ...system[group][key]
    }));
    context.skills = domains("skills", HK.SKILLS);
    context.knowledges = domains("knowledges", HK.KNOWLEDGES);

    context.team = system.team.map(uuid => {
      const pokemon = fromUuidSync(uuid);
      return pokemon ? { uuid, pokemon, types: [pokemon.system.types?.primary, pokemon.system.types?.secondary]
        .filter(Boolean).map(t => HK.TYPES[t]).join(" / ") } : { uuid, missing: true };
    });

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
    return context;
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

  static async _onOpenMember(event, target) {
    const pokemon = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    pokemon?.sheet.render(true);
  }

  static async _onRemoveMember(event, target) {
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    await this.actor.update({ "system.team": this.actor.system.team.filter(u => u !== uuid) });
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
      learnFromCompendium: PokemonSheet._onLearnFromCompendium
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
    context.dressage = system.dressage;
    context.obeys = system.dressage >= 8;
    context.weakened = system.weakened;

    // Sensibilités : multiplicateur de chaque type d'attaque contre ce Pokémon.
    const defTypes = [system.types.primary, system.types.secondary].filter(Boolean);
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
    const learnset = system.speciesData.learnset.map(entry => ({
      ...entry, typeLabel: HK.TYPES[entry.type], known: known.has(entry.name.toLowerCase())
    }));
    context.learnByLevel = learnset.filter(e => e.source === "level");
    context.learnByCT = learnset.filter(e => e.source !== "level");
    context.speciesTalents = system.speciesData.talents.map(t => ({ ...t, known: known.has(t.name.toLowerCase()) }));
    return context;
  }

  /** Ajoute à la fiche une Capacité ou un Talent du compendium. */
  static async _onLearnFromCompendium(event, target) {
    const source = await fromUuid(target.dataset.uuid);
    if ( !source ) {
      ui.notifications.warn(`« ${target.dataset.name} » est introuvable dans les compendiums.`);
      return;
    }
    await this.actor.createEmbeddedDocuments("Item", [game.items.fromCompendium(source)]);
  }

  static async _onRollAttack(event, target) {
    const item = this._getItem(target);
    if ( item ) return rollAttack(this.actor, item);
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
    return this.actor.update(updates);
  }
}
