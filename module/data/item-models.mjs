import { ATTACK_CATEGORIES, GEAR_CATEGORIES, POKESKILL_CATEGORIES } from "../config.mjs";

const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

const int = (initial = 0, options = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...options });

/** Capacité (attaque) d'un Pokémon. */
export class AttackData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      type: new StringField({ required: true, blank: true, initial: "normal" }),
      category: new StringField({ required: true, initial: "physical", choices: Object.keys(ATTACK_CATEGORIES) }),
      energy: int(0, { min: 0 }),
      range: new StringField({ required: true, blank: true }),
      accuracy: int(100, { min: 0 }),
      // Attaque qui ne peut pas échouer : colonne 100 %, neutralise Esquive (2.8).
      sure: new BooleanField(),
      // Dégâts STAB inclus, sous forme de formule (ex. « 12 » ou « 2d6+4 »).
      damage: new StringField({ required: true, blank: true }),
      effectChance: int(0, { min: 0, max: 100 }),
      // Ordre du tour : 1 = agit toujours en premier, -1 = agit en dernier.
      priority: int(0, { min: -1, max: 1 }),
      // Bonus d'initiative pour le tour où la capacité est choisie (Vive-Attaque : +10).
      initiativeBonus: int(0),
      xpCost: int(0, { min: 0 }),
      // Effets appliqués quand la capacité touche : modification de stat ou altération d'état.
      // `secondary` : soumis au jet de chance d'effet secondaire (effectChance).
      effects: new ArrayField(new SchemaField({
        kind: new StringField({ required: true, initial: "stat", choices: ["stat", "status"] }),
        target: new StringField({ required: true, initial: "target", choices: ["target", "self"] }),
        stat: new StringField({ required: true, initial: "for", choices: ["dex", "for", "con", "end", "vol"] }),
        value: int(-1, { min: -6, max: 6 }),
        status: new StringField({ required: true, blank: true }),
        secondary: new BooleanField()
      })),
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
      // Effet à l'utilisation (objets de soin, Annexe 4).
      use: new SchemaField({
        vit: int(0, { min: 0 }),
        vitFull: new BooleanField(),
        ene: int(0, { min: 0 }),
        eneFull: new BooleanField(),
        cures: new ArrayField(new StringField({ required: true, blank: false })),
        // Relève un Pokémon KO avec ce pourcentage de sa VIT max (Rappel : 50, Rappel Max : 100).
        revive: int(0, { min: 0, max: 100 }),
        // Consommable tenu : utilisable sans consommer l'action du Dresseur (Jus de Baie).
        free: new BooleanField()
      }),
      // Poké Ball : modificateur au seuil de capture (Annexe 3) ; la condition des Balls spéciales reste au MJ.
      captureMod: new NumberField({ required: false, nullable: true, integer: true, initial: null }),
      captureCondition: new StringField({ required: true, blank: true }),
      // Objet tenu qui renforce un Type : +2 dégâts (8.7).
      boostType: new StringField({ required: true, blank: true }),
      boost: int(0),
      description: new HTMLField()
    };
  }

  /** L'objet a un effet d'utilisation automatisable. */
  get usable() {
    const u = this.use;
    return !!(u.vit || u.vitFull || u.ene || u.eneFull || u.cures.length || u.revive);
  }
}
