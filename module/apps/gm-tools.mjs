/**
 * Outils du MJ : un seul bouton dans l'onglet Acteurs ouvre cette fenêtre, où chaque outil est décrit.
 */
import { openSetupDialog } from "../combat/setup.mjs";
import { openContest } from "./contest.mjs";
import { rollEncounter } from "./encounter.mjs";
import { openPlanning } from "./planning.mjs";
import { openPretires } from "./pretires.mjs";
import { openOpposition } from "./opposition.mjs";
import { openWildGenerator } from "./wild-generator.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const TOOLS = [
  { key: "encounter", label: "Rencontre", icon: "fa-dice-d20", run: rollEncounter,
    hint: "Tire le D100 sur la table de la zone où sont les personnages, puis génère et place les Pokémon (MJ 4.5)." },
  { key: "wild", label: "Pokémon sauvages", icon: "fa-paw", run: openWildGenerator,
    hint: "Crée un ou plusieurs Pokémon d'une espèce du Pokédex : profil, Nature, Talent, IV, intention (MJ 5.1)." },
  { key: "battle", label: "Combat de Dresseurs", icon: "fa-people-arrows", run: openSetupDialog,
    hint: "Prépare un combat officiel, sauvage ou mortel entre Dresseurs : format, équipes, Pokémon de départ (5.1)." },
  { key: "contest", label: "Concours", icon: "fa-trophy", run: openContest,
    hint: "Feuille du jury d'un concours Pokémon : quatre épreuves notées sur 25, pénalités et classement." },
  { key: "planning", label: "Temps en off", icon: "fa-calendar-days", run: openPlanning,
    hint: "Journal où chaque joueur note les activités de son Dresseur entre deux aventures, demi-journée par demi-journée (MJ 6.4)." },
  { key: "opposition", label: "Test en opposition", icon: "fa-scale-balanced", run: openOpposition,
    hint: "Deux personnages ou Pokémon s'affrontent sur une Caractéristique (marges) ou une Compétence (meilleur dé, puis le suivant) (2.6)." },
  { key: "pretires", label: "Pokémon pré-tirés", icon: "fa-print", run: () => openPretires(),
    hint: "Fiche rapide imprimable des Pokémon d'une scène : types, Talent, objet, statistiques maximales et attaques (aide du MJ)." }
];

export class GMToolsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hk-gm-tools",
    classes: ["hakai-kousen", "hk-gm-tools"],
    window: { title: "Outils du MJ", icon: "fa-solid fa-toolbox" },
    position: { width: 440 },
    actions: { run: GMToolsApp.#onRun }
  };

  static PARTS = { main: { template: "systems/hakai-kousen/templates/apps/gm-tools.hbs" } };

  /** @override */
  async _prepareContext() {
    return { tools: TOOLS };
  }

  static async #onRun(event, target) {
    const tool = TOOLS.find(t => t.key === target.dataset.tool);
    if ( !tool ) return;
    this.close();
    return tool.run();
  }
}

/** Ouvre la fenêtre des outils du MJ (ou la ramène au premier plan). */
export function openGMTools() {
  const open = foundry.applications.instances.get(GMToolsApp.DEFAULT_OPTIONS.id);
  if ( open ) return open.bringToFront();
  return new GMToolsApp().render(true);
}
