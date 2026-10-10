import { ATTRIBUTES, BABY_SPECIES, POKEMON_STATS, SKILLS, KNOWLEDGES, NATURES } from "../config.mjs";
import { statTalentMultipliers } from "../combat/talents.mjs";

const {
  ArrayField, BooleanField, DocumentUUIDField, HTMLField, NumberField, SchemaField, StringField
} = foundry.data.fields;

const int = (initial = 0, options = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...options });

/** Ressource { value, max } exploitable comme barre de jeton. */
const resource = (value, max) => new SchemaField({ value: int(value), max: int(max, { min: 0 }) });

/** Domaine à Niveau (Compétence / Connaissance) avec Spécialisation. */
const domains = keys => new SchemaField(Object.fromEntries(Object.keys(keys).map(k => [k, new SchemaField({
  level: int(0, { min: 0 }),
  spec: new StringField({ required: true, blank: true })
})])));

/* -------------------------------------------- */

export class TrainerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: new SchemaField(Object.fromEntries(Object.keys(ATTRIBUTES).map(k => [k, new SchemaField({
        base: int(1, { min: 0 }),
        pts: int(0)
      })]))),
      vit: resource(10, 10),
      xp: new SchemaField({ value: int(0, { min: 0 }), total: int(0, { min: 0 }) }),
      money: int(1500, { min: 0 }),
      skills: domains(SKILLS),
      knowledges: domains(KNOWLEDGES),
      details: new SchemaField({
        player: new StringField({ required: true, blank: true }),
        vocation: new StringField({ required: true, blank: true }),
        origin: new StringField({ required: true, blank: true }),
        build: new StringField({ required: true, blank: true }),
        skin: new StringField({ required: true, blank: true }),
        eyesHair: new StringField({ required: true, blank: true }),
        heightWeight: new StringField({ required: true, blank: true }),
        age: new StringField({ required: true, blank: true }),
        nature: new StringField({ required: true, blank: true }),
        gender: new StringField({ required: true, blank: true })
      }),
      team: new ArrayField(new DocumentUUIDField({ type: "Actor" })),
      // Boîte PC : 30 places, Pokémon hébergés en Pension (7.1).
      pc: new ArrayField(new DocumentUUIDField({ type: "Actor" })),
      firstCapture: new BooleanField(),
      // Dresseur PNJ (MJ 5.6, 5.13) : rôle de chaque Pokémon (clé : id de l'acteur), tactique et retrait.
      npc: new SchemaField({
        roles: new foundry.data.fields.ObjectField(),
        tactic: new StringField({ required: true, blank: true }),
        change: new StringField({ required: true, blank: true }),
        retreat: new StringField({ required: true, blank: true })
      }),
      // Affiche le contrôle des règles de création (3.7 à 3.10).
      creation: new BooleanField(),
      mechanics: new SchemaField(Object.fromEntries(["mega", "zmove", "tera", "dynamax"].map(k => [k, new SchemaField({
        unlocked: new BooleanField(),
        item: new StringField({ required: true, blank: true })
      })]))),
      biography: new HTMLField(),
      objectives: new HTMLField(),
      badges: new HTMLField(),
      notes: new HTMLField()
    };
  }

  prepareDerivedData() {
    for ( const attr of Object.values(this.attributes) ) attr.value = attr.base + attr.pts;
  }

  getRollData() {
    const data = { vit: this.vit.value };
    for ( const [k, attr] of Object.entries(this.attributes) ) data[k] = attr.value;
    return data;
  }
}

/* -------------------------------------------- */

export class PokemonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      species: new StringField({ required: true, blank: true }),
      number: new StringField({ required: true, blank: true }),
      types: new SchemaField({
        primary: new StringField({ required: true, blank: false, initial: "normal" }),
        secondary: new StringField({ required: true, blank: true })
      }),
      stats: new SchemaField(Object.fromEntries(Object.keys(POKEMON_STATS).map(k => [k, new SchemaField({
        base: int(k === "ene" ? 50 : 0, { min: 0 }),
        iv: int(0, { min: 0 }),
        ev: int(0, { min: 0, max: 30 }),
        // Modification temporaire de combat, de -6 à +6 (5.11).
        temp: int(0, { min: -6, max: 6 })
      })]))),
      vit: resource(0, 0),
      ene: resource(50, 50),
      xp: new SchemaField({ value: int(0, { min: 0 }), total: int(0, { min: 0 }) }),
      // Starter en création (4.1) : 10 IV, 3 au maximum par statistique.
      starter: new BooleanField(),
      // Nouveau-né (7.8) : caractéristiques et VIT ÷2 jusqu'à 100 XP Pokémon cumulés, XP bloquée jusque-là.
      baby: new BooleanField(),
      // Modification temporaire de précision (Jet de Sable, Flash…), en points de pourcentage.
      accuracyMod: int(0, { min: -100, max: 100 }),
      // Compteurs d'états : tours de Toxik (×1, ×2…) et stade de sortie de la Confusion.
      conditions: new SchemaField({
        toxik: int(0, { min: 0 }),
        confusion: int(0, { min: 0, max: 3 })
      }),
      nature: new StringField({ required: true, blank: false, initial: "hardi", choices: Object.keys(NATURES) }),
      relation: new SchemaField({
        confidence: int(4, { min: 0, max: 9 }),
        obedience: int(4, { min: 0, max: 9 })
      }),
      details: new SchemaField({
        player: new StringField({ required: true, blank: true }),
        trainer: new StringField({ required: true, blank: true }),
        provenance: new StringField({ required: true, blank: true }),
        heightWeight: new StringField({ required: true, blank: true }),
        family: new StringField({ required: true, blank: true }),
        gender: new StringField({ required: true, blank: true }),
        ball: new StringField({ required: true, blank: true }),
        heldItem: new StringField({ required: true, blank: true }),
        likedTaste: new StringField({ required: true, blank: true }),
        dislikedTaste: new StringField({ required: true, blank: true })
      }),
      // Données d'espèce (Pokédex Hakai Kousen).
      speciesData: new SchemaField({
        category: new StringField({ required: true, blank: true }),
        ratio: new StringField({ required: true, blank: true }),
        evolutions: new StringField({ required: true, blank: true }),
        talents: new ArrayField(new SchemaField({
          name: new StringField({ required: true, blank: false }),
          uuid: new StringField({ required: true, blank: true }),
          hidden: new BooleanField()
        })),
        // Capacités apprises : par niveau (« Départ », « 7 »…) ou par CT.
        learnset: new ArrayField(new SchemaField({
          source: new StringField({ required: true, initial: "level", choices: ["level", "ct", "egg", "tutor", "other"] }),
          level: new StringField({ required: true, blank: true }),
          name: new StringField({ required: true, blank: false }),
          type: new StringField({ required: true, blank: true }),
          uuid: new StringField({ required: true, blank: true })
        }))
      }),
      // Mécaniques régionales (5.19) : forme Méga (ou autre forme), Dynamax, Téracristallisation.
      form: new SchemaField({
        active: new BooleanField(),
        name: new StringField({ required: true, blank: true }),
        primary: new StringField({ required: true, blank: true }),
        secondary: new StringField({ required: true, blank: true }),
        bonus: new SchemaField(Object.fromEntries(["dex", "for", "con", "end", "vol"].map(k => [k, int(0)])))
      }),
      dynamax: new SchemaField({ active: new BooleanField(), endsRound: int(0) }),
      tera: new SchemaField({ type: new StringField({ required: true, blank: true }), active: new BooleanField() }),
      // Jour (temps du monde) de la dernière dépense d'XP Dresseur pour la relation : une par jour (4.13).
      relationDay: new NumberField({ required: false, nullable: true, integer: true, initial: null }),
      // Jour de la dernière augmentation : temps du monde, ou date réelle si le MJ ne fait pas avancer le temps.
      relationKey: new StringField({ required: true, blank: true }),
      // Rencontre et capture (5.16 ; MJ 4.6, 5.1).
      encounter: new SchemaField({
        rarity: new StringField({ required: true, initial: "commun", choices: ["commun", "rare", "semi", "semiFinal"] }),
        dominant: new BooleanField(),
        aberrant: new BooleanField(),
        shiny: new BooleanField(),
        intention: new StringField({ required: true, blank: true }),
        retreat: new StringField({ required: true, blank: true })
      }),
      // Boss (5.20) : immunisé à toutes les altérations sauf une, phases à des seuils de VIT.
      boss: new SchemaField({
        enabled: new BooleanField(),
        vulnerable: new StringField({ required: true, blank: true }),
        phases: new ArrayField(new SchemaField({
          threshold: int(50, { min: 0, max: 100 }),
          label: new StringField({ required: true, blank: true })
        }))
      }),
      description: new HTMLField(),
      mechanics: new HTMLField(),
      sessions: new HTMLField(),
      notes: new HTMLField()
    };
  }

  /** Types défensifs actuels : Téracristallisation, puis forme alternative, sinon types d'origine. */
  get defensiveTypes() {
    if ( this.tera.active && this.tera.type && (this.tera.type !== "stellaire") ) return [this.tera.type];
    if ( this.form.active && this.form.primary ) return [this.form.primary, this.form.secondary].filter(Boolean);
    return [this.types.primary, this.types.secondary].filter(Boolean);
  }

  /** Dressage = Confiance + Obéissance (4.11). */
  get dressage() {
    return this.relation.confidence + this.relation.obedience;
  }

  /** Nouveau-né encore sous 100 XP Pokémon cumulés (7.8). */
  get newborn() {
    return this.baby && (this.xp.total < 100);
  }

  /** Espèce officiellement Bébé (7.8) : pas de division, mais −1 au seuil de capture. */
  get babySpecies() {
    return BABY_SPECIES.includes((this.species || this.parent?.name || "").toLowerCase());
  }

  /** Objets tenus par le Pokémon (noms en minuscules). */
  get heldNames() {
    return (this.parent?.itemTypes?.gear ?? []).filter(i => i.system.category === "held").map(i => i.name.toLowerCase());
  }

  /** À 1/4 de sa VIT max ou moins, le Pokémon est affaibli (5.17). */
  get weakened() {
    return (this.vit.max > 0) && (this.vit.value > 0) && (this.vit.value <= Math.floor(this.vit.max / 4));
  }

  prepareDerivedData() {
    const nature = NATURES[this.nature] ?? {};
    const statuses = this.parent.statuses ?? new Set();

    for ( const [k, stat] of Object.entries(this.stats) ) {
      const gain = POKEMON_STATS[k].gain;
      stat.nature = (nature.plus === k ? 1 : 0) - (nature.minus === k ? 1 : 0);
      // Total inscrit sur la fiche : base + IV + EV + Nature.
      stat.total = stat.base + ((stat.iv + stat.ev) * gain) + stat.nature;
      // Nouveau-né : DEX, FOR, CON, END, VOL et VIT finales divisées par 2 jusqu'à 100 XP ; ENE inchangée.
      if ( this.newborn && (k !== "ene") ) stat.total = Math.floor(stat.total / 2);
    }

    // Forme alternative (Méga-Évolution…) : bonus de statistiques saisis sur la fiche.
    if ( this.form.active ) {
      for ( const [k, b] of Object.entries(this.form.bonus) ) this.stats[k].total += b;
    }

    this.vit.max = this.stats.vit.total * (this.dynamax.active ? 2 : 1);
    this.ene.max = this.stats.ene.total;
    const weakened = this.weakened;
    const talents = (this.parent?.itemTypes?.talent ?? []).map(t => t.name.toLowerCase());
    const talentMult = statTalentMultipliers(talents, statuses);

    // Valeur effective en combat : modifications temporaires d'abord, puis divisions.
    for ( const k of Object.keys(POKEMON_STATS) ) {
      const stat = this.stats[k];
      if ( (k === "vit") || (k === "ene") ) {
        stat.value = stat.total;
        continue;
      }
      let value = stat.total + stat.temp;
      // Mouchoir Choix : DEX ×1,5 (Annexe 6) ; Talents chiffrés (Cran, Pied Véloce…).
      if ( (k === "dex") && this.heldNames.includes("mouchoir choix") ) value = Math.floor(value * 1.5);
      if ( talentMult[k] ) value = Math.floor(value * talentMult[k]);
      // Brûlure : FOR ÷2, sauf avec Cran.
      if ( (k === "for") && statuses.has("brulure") && !talents.includes("cran") ) value = Math.floor(value / 2);
      if ( (k === "dex") && statuses.has("paralysie") ) value = Math.floor(value / 2);
      if ( weakened ) value = Math.floor(value / 2);
      stat.value = Math.max(value, 0);
    }
  }

  getRollData() {
    const data = { vit: this.vit.value, ene: this.ene.value, dressage: this.dressage };
    for ( const [k, stat] of Object.entries(this.stats) ) data[k] = stat.value;
    return data;
  }
}
