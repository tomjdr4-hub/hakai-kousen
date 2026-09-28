import { ATTACK_CATEGORIES, GEAR_CATEGORIES, POKESKILL_CATEGORIES } from "../config.mjs";

const { BooleanField, HTMLField, NumberField, StringField } = foundry.data.fields;

const int = (initial = 0, options = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...options });

/** Capacité (attaque) d'un Pokémon. */
export class AttackData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: new StringField({ required: true, blank: false, initial: "normal" }),
      category: new StringField({ required: true, initial: "physical", choices: Object.keys(ATTACK_CATEGORIES) }),
      energy: int(0, { min: 0 }),
      range: new StringField({ required: true, blank: true }),
      accuracy: int(100, { min: 0 }),
      // Attaque qui ne peut pas échouer : colonne 100 %, neutralise Esquive (2.8).
      sure: new BooleanField(),
      // Dégâts STAB inclus, sous forme de formule (ex. « 12 » ou « 2d6+4 »).
      damage: new StringField({ required: true, blank: true }),
      effectChance: int(0, { min: 0, max: 100 }),
      xpCost: int(0, { min: 0 }),
      description: new HTMLField()
    };
  }

  get isDamaging() {
    return (this.category !== "status") && !!this.damage.trim();
  }
}

/** Compétence Pokémon (Annexe 1). */
export class PokeskillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      level: int(1, { min: 0 }),
      category: new StringField({ required: true, initial: "standard", choices: Object.keys(POKESKILL_CATEGORIES) }),
      // Apprentissage progressif hors XP : 0/10 -> 10/10 (4.9).
      progress: int(0, { min: 0, max: 10 }),
      description: new HTMLField()
    };
  }

  /** Coût en XP Pokémon du niveau suivant. */
  get nextCost() {
    return this.level * (POKESKILL_CATEGORIES[this.category]?.cost ?? 10);
  }
}

/** Talent d'espèce. */
export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      hidden: new BooleanField(),
      description: new HTMLField()
    };
  }
}

/** Objet d'inventaire. */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({ required: true, initial: "equipment", choices: Object.keys(GEAR_CATEGORIES) }),
      quantity: int(1, { min: 0 }),
      price: int(0, { min: 0 }),
      charges: int(0, { min: 0 }),
      description: new HTMLField()
    };
  }
}
