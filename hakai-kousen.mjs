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
import { openCombatPanel, registerCombatPanelHooks } from "./module/apps/combat-panel.mjs";
import { registerSocket } from "./module/combat/actions.mjs";
import { openSetupDialog } from "./module/combat/setup.mjs";
import { openWildGenerator } from "./module/apps/wild-generator.mjs";

/** États des jetons : KO puis les altérations et états de combat (5.9, 5.10). */
const STATUS_EFFECTS = [
  { id: "dead", name: "KO", img: "icons/svg/skull.svg" },
  ...Object.entries(HK.STATUSES).map(([id, s]) => ({ id, name: s.label, img: s.img }))
];

Hooks.once("init", () => {
  game.hakaiKousen = { config: HK, rolls, openCombatPanel, openSetupDialog, openWildGenerator };
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

  // Phase de réflexion du combat (Manuel du Joueur 5.3).
  game.settings.register("hakai-kousen", "planningDuration", {
    name: "Temps de réflexion (secondes)",
    hint: "Durée accordée à chacun, MJ compris, pour choisir son action au début de chaque tour (le manuel conseille 15 à 30 s).",
    scope: "world", config: true, type: Number, default: 30,
    range: { min: 10, max: 120, step: 5 }
  });
  game.settings.register("hakai-kousen", "autoPlanning", {
    name: "Réflexion automatique à chaque tour",
    hint: "Lance le chrono et le choix secret des actions dès qu'un nouveau tour de combat commence.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register("hakai-kousen", "autoOpenPanel", {
    name: "Ouvrir le panneau de combat automatiquement",
    hint: "Ouvre le panneau au début de chaque phase de réflexion si vous participez au combat.",
    scope: "client", config: true, type: Boolean, default: true
  });

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
    "hk-learn-row": "systems/hakai-kousen/templates/parts/learn-row.hbs",
    "hk-panel-targets": "systems/hakai-kousen/templates/parts/panel-targets.hbs",
    "hk-conditions": "systems/hakai-kousen/templates/parts/conditions.hbs"
  });
});

Hooks.on("renderChatMessageHTML", rolls.onRenderChatMessage);
registerCombatHooks();
registerCombatPanelHooks();
Hooks.once("ready", registerSocket);

/** Onglet Acteurs : outils du MJ (combat de Dresseurs, Pokémon sauvages). */
Hooks.on("renderActorDirectory", (app, html) => {
  if ( !game.user.isGM ) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if ( root.querySelector(".hk-directory-tools") ) return;
  const tools = document.createElement("div");
  tools.className = "hk-directory-tools";
  tools.innerHTML = `<button type="button" data-hk-tool="wild"><i class="fa-solid fa-paw"></i> Pokémon sauvages</button>
    <button type="button" data-hk-tool="battle"><i class="fa-solid fa-people-arrows"></i> Combat de Dresseurs</button>`;
  tools.querySelector("[data-hk-tool=wild]").addEventListener("click", () => openWildGenerator());
  tools.querySelector("[data-hk-tool=battle]").addEventListener("click", () => openSetupDialog());
  const header = root.querySelector(".header-actions, .directory-header");
  if ( header ) header.after(tools);
  else root.prepend(tools);
});
