/**
 * Hakai Kousen — système Foundry VTT (V13 / V14).
 */
import { HK } from "./module/config.mjs";
import { PokemonData, TrainerData } from "./module/data/actor-models.mjs";
import { AttackData, GearData, PokeskillData, TalentData } from "./module/data/item-models.mjs";
import { HKActor } from "./module/documents/actor.mjs";
import { HKCombat, HKCombatant, registerCombatHooks } from "./module/documents/combat.mjs";
import { PokemonSheet, TrainerSheet } from "./module/sheets/actor-sheets.mjs";
import { HKItemSheet } from "./module/sheets/item-sheet.mjs";
import * as rolls from "./module/dice/rolls.mjs";

/** Altérations d'état et états de combat (5.9, 5.10). */
const STATUS_EFFECTS = [
  { id: "dead", name: "KO", img: "icons/svg/skull.svg" },
  { id: "brulure", name: "Brûlure", img: "icons/svg/fire.svg" },
  { id: "paralysie", name: "Paralysie", img: "icons/svg/lightning.svg" },
  { id: "poison", name: "Poison", img: "icons/svg/poison.svg" },
  { id: "toxik", name: "Toxik", img: "icons/svg/biohazard.svg" },
  { id: "gel", name: "Gel", img: "icons/svg/frozen.svg" },
  { id: "sommeil", name: "Sommeil", img: "icons/svg/sleep.svg" },
  { id: "confusion", name: "Confusion", img: "icons/svg/daze.svg" }
];

Hooks.once("init", () => {
  game.hakaiKousen = { config: HK, rolls };
  CONFIG.HK = HK;

  CONFIG.Actor.documentClass = HKActor;
  CONFIG.Actor.dataModels = { trainer: TrainerData, pokemon: PokemonData };
  CONFIG.Actor.trackableAttributes = {
    trainer: { bar: ["vit"], value: ["xp.value", "money"] },
    pokemon: { bar: ["vit", "ene"], value: ["xp.value"] }
  };
  CONFIG.Item.dataModels = { attack: AttackData, pokeskill: PokeskillData, talent: TalentData, gear: GearData };

  // Initiative : 1D10 + DEX ; égalités et priorités gérées par HKCombat (5.2).
  CONFIG.Combat.documentClass = HKCombat;
  CONFIG.Combatant.documentClass = HKCombatant;
  CONFIG.Combat.initiative = { formula: "1d10 + @dex", decimals: 0 };

  CONFIG.statusEffects = STATUS_EFFECTS;

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, "hakai-kousen", TrainerSheet, {
    types: ["trainer"], makeDefault: true, label: "Fiche Dresseur"
  });
  DocumentSheetConfig.registerSheet(Actor, "hakai-kousen", PokemonSheet, {
    types: ["pokemon"], makeDefault: true, label: "Fiche Pokémon"
  });
  DocumentSheetConfig.registerSheet(Item, "hakai-kousen", HKItemSheet, {
    makeDefault: true, label: "Fiche d'objet Hakai Kousen"
  });

  return foundry.applications.handlebars.loadTemplates({
    "hk-domain-row": "systems/hakai-kousen/templates/parts/domain-row.hbs",
    "hk-editor": "systems/hakai-kousen/templates/parts/editor.hbs",
    "hk-learn-row": "systems/hakai-kousen/templates/parts/learn-row.hbs"
  });
});

Hooks.on("renderChatMessageHTML", rolls.onRenderChatMessage);
registerCombatHooks();
