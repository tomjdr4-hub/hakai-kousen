import { ATTRIBUTES, POKEMON_STATS, SKILLS, KNOWLEDGES, NATURES } from "../config.mjs";

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
      baby: new BooleanField(),
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
      description: new HTMLField(),
      mechanics: new HTMLField(),
      sessions: new HTMLField(),
      notes: new HTMLField()
    };
  }

  /** Dressage = Confiance + Obéissance (4.11). */
  get dressage() {
    return this.relation.confidence + this.relation.obedience;
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
      // Bébé : DEX, FOR, CON, END, VOL et VIT finales divisées par 2 ; ENE inchangée.
      if ( this.baby && (k !== "ene") ) stat.total = Math.floor(stat.total / 2);
    }

    this.vit.max = this.stats.vit.total;
    this.ene.max = this.stats.ene.total;
    const weakened = this.weakened;

    // Valeur effective en combat : modifications temporaires d'abord, puis divisions.
    for ( const k of Object.keys(POKEMON_STATS) ) {
      const stat = this.stats[k];
      if ( (k === "vit") || (k === "ene") ) {
        stat.value = stat.total;
        continue;
      }
      let value = stat.total + stat.temp;
      if ( (k === "for") && statuses.has("brulure") ) value = Math.floor(value / 2);
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
