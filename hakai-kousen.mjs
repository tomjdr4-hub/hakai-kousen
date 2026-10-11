/**
 * Hakai Kousen — système Foundry VTT (V13 / V14).
 */
import { HK } from "./module/config.mjs";
import { PokemonData, TrainerData } from "./module/data/actor-models.mjs";
import { AttackData, EggData, GearData, PokeskillData, TalentData } from "./module/data/item-models.mjs";
import { HKActor } from "./module/documents/actor.mjs";
import { HKCombat, HKCombatant, registerCombatHooks } from "./module/documents/combat.mjs";
import { PokemonSheet, TrainerSheet } from "./module/sheets/actor-sheets.mjs";
import { HKItemSheet } from "./module/sheets/item-sheet.mjs";
import * as rolls from "./module/dice/rolls.mjs";
import { openCombatPanel, registerCombatPanelHooks } from "./module/apps/combat-panel.mjs";
import { registerSocket } from "./module/combat/actions.mjs";
import { openSetupDialog } from "./module/combat/setup.mjs";
import { openWildGenerator } from "./module/apps/wild-generator.mjs";
import { registerProgressionHooks } from "./module/progression.mjs";
import { rollEncounter } from "./module/apps/encounter.mjs";
import { openContest } from "./module/apps/contest.mjs";
import { openPlanning } from "./module/apps/planning.mjs";
import { openCharacterWizard } from "./module/apps/character-wizard.mjs";
import { addRerollButton } from "./module/reroll.mjs";
import { openGMTools } from "./module/apps/gm-tools.mjs";

/** États des jetons : KO puis les altérations et états de combat (5.9, 5.10). */
const STATUS_EFFECTS = [
  { id: "dead", name: "KO", img: "icons/svg/skull.svg" },
  ...Object.entries(HK.STATUSES).map(([id, s]) => ({ id, name: s.label, img: s.img }))
];

Hooks.once("init", () => {
  game.hakaiKousen = { config: HK, rolls, openCombatPanel, openSetupDialog, openWildGenerator, rollEncounter, openContest, openPlanning, openCharacterWizard, openGMTools };
  CONFIG.HK = HK;

  CONFIG.Actor.documentClass = HKActor;
  CONFIG.Actor.dataModels = { trainer: TrainerData, pokemon: PokemonData };
  CONFIG.Actor.trackableAttributes = {
    trainer: { bar: ["vit"], value: ["xp.value", "money"] },
    pokemon: { bar: ["vit", "ene"], value: ["xp.value"] }
  };
  CONFIG.Item.dataModels = { attack: AttackData, pokeskill: PokeskillData, talent: TalentData, gear: GearData, egg: EggData };

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
  game.settings.register("hakai-kousen", "fatalSave", {
    name: "Coup fatal : mode de campagne",
    hint: "Dépenser 1 XP Dresseur pour rappeler un Pokémon juste avant la mort (Manuel du Joueur 3.12).",
    scope: "world", config: true, type: String, default: "standard",
    choices: {
      standard: "Standard : n'importe quel Pokémon du Dresseur",
      hard: "Difficile : le Starter seulement",
      none: "Sans protection"
    }
  });
  game.settings.register("hakai-kousen", "autoStab", {
    name: "STAB automatique",
    hint: "Applique ×1,5 aux attaques d'un type du lanceur (5.8 ; Téra 5.19.4). Décochez si les dégâts de vos capacités incluent déjà le STAB, comme sur la fiche papier.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register("hakai-kousen", "contest", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register("hakai-kousen", "ctResale", {
    name: "CT revendables",
    hint: "Manuel du Joueur 8.2 : revente des CT à 50 % (économie plus libre), ou variante « CT non revendables ».",
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
Hooks.on("renderChatMessageHTML", addRerollButton);

/** Fiches de Dresseur ouvertes : rafraîchies quand un Pokémon de leur équipe change (VIT, états, objet tenu). */
function refreshTrainerSheets(pokemon) {
  if ( pokemon?.type !== "pokemon" ) return;
  const uuid = pokemon.isToken ? pokemon.token?.baseActor?.uuid : pokemon.uuid;
  for ( const trainer of game.actors.filter(a => (a.type === "trainer") && a.sheet?.rendered) ) {
    if ( trainer.system.team.includes(uuid) || trainer.system.pc.includes(uuid) ) trainer.sheet.render();
  }
}
Hooks.on("updateActor", actor => refreshTrainerSheets(actor));
for ( const hook of ["createActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"] ) {
  Hooks.on(hook, doc => refreshTrainerSheets(doc.parent));
}

/** Un Pokémon ne porte qu'un seul objet tenu à la fois (8.7) : un deuxième objet est refusé. */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const pokemon = item.parent;
  if ( (pokemon?.type !== "pokemon") || (item.type !== "gear") ) return;
  const current = pokemon.itemTypes.gear.find(i => i.system.quantity > 0);
  if ( !current ) return;
  if ( userId === game.user.id ) {
    ui.notifications.warn(`${pokemon.name} tient déjà ${current.name} : un Pokémon ne porte qu'un objet à la fois (8.7). Retirez-le d'abord.`);
  }
  return false;
});
registerCombatHooks();
registerCombatPanelHooks();
registerProgressionHooks();
Hooks.once("ready", registerSocket);

/** Fiches créées avant le suivi du total d'XP : le total est porté au moins à l'XP disponible. */
Hooks.once("ready", async () => {
  if ( !game.user.isActiveGM ) return;
  const updates = game.actors.filter(a => a.system.xp && (a.system.xp.total < a.system.xp.value))
    .map(a => ({ _id: a.id, "system.xp.total": a.system.xp.value }));
  if ( updates.length ) await Actor.implementation.updateDocuments(updates);
});

/** Onglet Acteurs : création de Dresseur pour tous, outils du MJ (rencontres, combats…). */
Hooks.on("renderActorDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if ( root.querySelector(".hk-directory-tools") ) return;
  const tools = document.createElement("div");
  tools.className = "hk-directory-tools";
  tools.innerHTML = `<button type="button" class="hk-create-trainer" data-hk-tool="character" data-tooltip="Créer un Dresseur pas à pas selon les règles du chapitre 3, avec son Starter"><i class="fa-solid fa-user-plus"></i> Créer un Dresseur</button>`;
  if ( game.user.isGM ) tools.innerHTML += `<button type="button" data-hk-tool="gm" data-tooltip="Rencontre, Pokémon sauvages, Combat de Dresseurs, Concours, Temps en off"><i class="fa-solid fa-toolbox"></i> Outils du MJ</button>`;
  const tool = { character: openCharacterWizard, gm: openGMTools };
  for ( const button of tools.querySelectorAll("[data-hk-tool]") ) {
    button.addEventListener("click", () => tool[button.dataset.hkTool]());
  }
  const header = root.querySelector(".header-actions, .directory-header");
  if ( header ) header.after(tools);
  else root.prepend(tools);
});
