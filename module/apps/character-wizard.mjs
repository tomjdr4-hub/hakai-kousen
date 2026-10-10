/**
 * Création pas à pas d'un Dresseur (Manuel du Joueur, chapitre 3) et, en option, de son Starter (4.1).
 * Les règles de création sont vérifiées à chaque étape ; le MJ peut les ignorer (PNJ, règles maison).
 * Un joueur sans le droit de créer des acteurs passe par le MJ connecté (socket).
 */
import { ATTRIBUTES, KNOWLEDGES, NATURES, POKEMON_STATS, SKILLS, SPEC_SUGGESTIONS, TYPES } from "../config.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SCOPE = "hakai-kousen";
const SOCKET = `system.${SCOPE}`;
const esc = text => Handlebars.escapeExpression(text ?? "");
const paragraphs = text => String(text ?? "").split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join("");

const STEPS = [
  { key: "concept", label: "Concept", icon: "fa-lightbulb" },
  { key: "story", label: "Histoire", icon: "fa-book" },
  { key: "attributes", label: "Caractéristiques", icon: "fa-dumbbell" },
  { key: "domains", label: "Compétences", icon: "fa-list-check" },
  { key: "specs", label: "Spécialisations", icon: "fa-star" },
  { key: "gear", label: "Équipement", icon: "fa-suitcase" },
  { key: "starter", label: "Starter", icon: "fa-paw" },
  { key: "summary", label: "Récapitulatif", icon: "fa-flag-checkered" }
];

/** Exemples de Vocations (3.2). */
const VOCATIONS = {
  "Dresseur": "Se consacrer au combat et à la progression de ses Pokémon.",
  "Éleveur": "Élever, comprendre et accompagner le développement des Pokémon.",
  "Chercheur / Scientifique": "Étudier les Pokémon, leur environnement ou différents phénomènes.",
  "Collectionneur": "Rechercher et capturer certaines espèces.",
  "Journaliste": "Enquêter, rencontrer des témoins et rechercher des informations.",
  "Hackeur / Informaticien": "Travailler avec les systèmes informatiques, les réseaux et la sécurité.",
  "Pompier": "Intervenir lors de situations dangereuses et travailler avec des Pokémon adaptés.",
  "Médecin / Médecin Pokémon": "Soigner les humains ou les Pokémon.",
  "Artisan / Mécanicien": "Créer, entretenir ou réparer du matériel.",
  "Cuisinier": "Préparer des repas et développer un savoir-faire culinaire.",
  "Explorateur / Ranger": "Voyager, survivre et intervenir dans les milieux naturels.",
  "Policier": "Enquêter, protéger la population et faire respecter la loi.",
  "Mineur / Pêcheur": "Exercer une activité spécialisée liée au terrain."
};

/** Signification des scores de Caractéristique (3.7). */
const SCORE_LABELS = ["Faible", "Moyen", "Bon", "Fort", "Exceptionnel"];
const ATTRIBUTE_SCORES = {
  dex: ["Les gestes précis et les mouvements exigeants vous mettent facilement en difficulté.",
    "Vous possédez la coordination ordinaire nécessaire à la vie quotidienne.",
    "Vous êtes à l'aise avec votre corps et les manipulations demandant de la précision.",
    "Vos réflexes, votre coordination et votre fluidité de mouvement sont remarquables.",
    "Votre dextérité se situe parmi ce qu'un humain particulièrement doué peut accomplir."],
  for: ["Les efforts physiques importants vous mettent rapidement en difficulté.",
    "Une force ordinaire, suffisante pour les efforts du quotidien.",
    "Vous êtes entraîné et nettement plus fort que la moyenne.",
    "Votre puissance physique est remarquable et témoigne d'un entraînement sérieux.",
    "Vous atteignez les limites de ce qu'un humain particulièrement puissant peut accomplir."],
  con: ["Maintenir votre attention ou raisonner sous pression vous demande beaucoup d'efforts.",
    "Vos capacités de réflexion et de concentration se situent dans la moyenne.",
    "Vous savez analyser une situation et mobiliser efficacement vos connaissances.",
    "Votre esprit est vif, structuré et particulièrement difficile à prendre au dépourvu.",
    "Vos facultés de réflexion et d'abstraction sont exceptionnelles."],
  end: ["La fatigue, les efforts prolongés et les coups vous affectent rapidement.",
    "Vous supportez normalement les efforts de la vie quotidienne.",
    "Vous savez encaisser des efforts importants et conserver votre souffle.",
    "Votre résistance physique est remarquable.",
    "Votre capacité à endurer fatigue, effort et douleur atteint un niveau exceptionnel."],
  vol: ["La peur, la pression ou les émotions fortes peuvent facilement vous déstabiliser.",
    "Vous êtes capable de tenir bon dans la plupart des situations ordinaires.",
    "Vos objectifs et convictions sont solides et il est difficile de vous en détourner.",
    "Votre mental est particulièrement résistant et votre détermination remarquable.",
    "Votre volonté est extrêmement difficile à briser ou à influencer."]
};

/** Ce que représente chaque domaine (3.9.1, 3.9.2). */
const DOMAIN_HINTS = {
  adresse: "Précision manuelle, gestes délicats, coordination et manipulation fine.",
  art: "Pratiquer une discipline artistique : dessin, musique, danse, théâtre, photographie…",
  artisanat: "Concevoir et fabriquer des objets grâce à un savoir-faire manuel.",
  athletisme: "Courir, sauter, grimper, nager, porter une charge, effort prolongé.",
  bricolage: "Réparer, entretenir, démonter ou modifier un objet ou un appareil.",
  charisme: "Influencer autrui : convaincre, intimider, mentir, séduire ou diriger.",
  combat: "Combat humain : corps à corps, armes, arts martiaux, défense.",
  cuisine: "Préparer des repas et des recettes, notamment à partir de Baies.",
  detection: "Remarquer un détail, une présence, une trace, un piège ou une anomalie.",
  discretion: "Se cacher, se déplacer en silence, suivre quelqu'un sans être vu.",
  minage: "Prospecter, creuser et extraire minerais, fossiles et pierres.",
  peche: "Techniques de pêche, choix du matériel et des appâts, repérer les bons coins.",
  perspicacite: "Comprendre les intentions et les émotions, percevoir un mensonge.",
  pilotage: "Conduire ou manœuvrer des véhicules terrestres, nautiques ou aériens.",
  survie: "S'orienter, pister, camper, trouver un abri, prévoir les dangers naturels.",
  chimie: "Substances, réactions, médicaments, poisons, antidotes.",
  droit: "Lois, institutions, usages sociaux, droits des Dresseurs, réglementations.",
  economie: "Prix, marchés, entreprises ; estimer une valeur, négocier un contrat.",
  histoire: "Histoire des régions, mythes, traditions, Pokémon légendaires.",
  informatique: "Ordinateurs, logiciels, données, réseaux (le Hacking est une Spécialisation).",
  medecineHumaine: "Diagnostiquer, stabiliser et soigner les humains.",
  medecinePokemon: "Diagnostiquer, stabiliser et soigner les Pokémon.",
  nature: "Milieux naturels, plantes, Baies, champignons, météo.",
  technologie: "Fonctionnement des machines, appareils, énergie, technologies régionales.",
  zoologie: "Espèces de Pokémon : anatomie, habitat, comportement, reproduction, traces."
};

/**
 * Équipement initial (3.11). `base` : coché d'office ; `domains` : proposé si le Dresseur a un Niveau dans
 * l'un de ces domaines. Les objets sont copiés du compendium Objets quand ils y figurent.
 */
const GEAR = [
  { key: "rationsH", name: "Rations humaines", quantity: 5, base: true, category: "consumable" },
  { key: "rationsP", name: "Rations Pokémon", quantity: 5, base: true, category: "consumable" },
  { key: "potion", name: "Potion", quantity: 1, base: true },
  { key: "pokeball", name: "Poké Ball", quantity: 5, base: true },
  { key: "motismart", name: "Motismart", base: true, note: "possédé par la majorité des personnages" },
  { key: "licence", name: "Licence de Dresseur", base: true, note: "sauf si le scénario prévoit son obtention" },
  { key: "copain", name: "Copain Ball", note: "optionnelle, avec l'accord du MJ" },
  { key: "pokedex", name: "Pokédex", note: "si le Background prévoit un passage chez le Professeur" },
  { key: "camping", name: "Nécessaire de camping", domains: ["survie", "nature"] },
  { key: "couteau", name: "Couteau de survie", domains: ["survie"] },
  { key: "carte", name: "Carte régionale papier", domains: ["survie"] },
  { key: "cuisine", name: "Nécessaire de cuisine", domains: ["cuisine"] },
  { key: "canne", name: "Canne", domains: ["peche"] },
  { key: "explorakit", name: "Explorakit", domains: ["minage"] },
  { key: "outils", name: "Trousse à outils", domains: ["bricolage", "artisanat"] },
  { key: "secours", name: "Trousse de premiers secours", domains: ["medecineHumaine"] },
  { key: "soins", name: "Nécessaire de soins Pokémon", domains: ["medecinePokemon"] },
  { key: "ordi", name: "Ordinateur portable ou tablette", domains: ["informatique"] },
  { key: "labo", name: "Petit nécessaire de laboratoire", domains: ["chimie", "technologie", "zoologie"] },
  { key: "jumelles", name: "Jumelles", domains: ["detection", "nature"] },
  { key: "lampe", name: "Lampe de terrain", domains: ["detection", "nature"] },
  { key: "art", name: "Instrument ou matériel artistique", domains: ["art"], category: "professional" }
];

const IV_STATS = Object.keys(POKEMON_STATS);
const ALL_DOMAINS = { ...SKILLS, ...KNOWLEDGES };

function initialState() {
  const zero = keys => Object.fromEntries(Object.keys(keys).map(k => [k, 0]));
  return {
    step: 0,
    reached: 0,
    ignoreLimits: false,
    name: "", img: "icons/svg/mystery-man.svg", vocation: "", concept: "",
    origin: "", background: "", personality: "", objectives: "",
    age: "", gender: "", heightWeight: "", build: "", eyesHair: "", skin: "", appearance: "",
    attrs: Object.fromEntries(Object.keys(ATTRIBUTES).map(k => [k, 1])),
    skills: zero(SKILLS),
    knowledges: zero(KNOWLEDGES),
    specSkill: { key: "", text: "" },
    specKnowledge: { key: "", text: "" },
    gear: {},
    fetish: "",
    money: 1500,
    starter: {
      enabled: true, species: "", uuid: "", info: null, nickname: "", nature: "hardi", talent: 0,
      ball: "Poké Ball", provenance: "", iv: Object.fromEntries(IV_STATS.map(k => [k, 0]))
    }
  };
}

const sum = obj => Object.values(obj).reduce((t, v) => t + Number(v || 0), 0);

/** Équipement coché : choix explicite du joueur, sinon équipement de base et équipement lié à ses domaines. */
function gearChecked(state, g) {
  if ( g.key in state.gear ) return !!state.gear[g.key];
  if ( g.base ) return true;
  return (g.domains ?? []).some(k => (state.skills[k] ?? state.knowledges[k] ?? 0) > 0);
}

/* -------------------------------------------- */

export class CharacterWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hk-character-wizard",
    tag: "form",
    form: { submitOnChange: false, closeOnSubmit: false },
    classes: ["hakai-kousen", "hk-wizard"],
    window: { title: "Créer un Dresseur", icon: "fa-solid fa-user-plus", resizable: true },
    position: { width: 720, height: 760 },
    actions: {
      goto: CharacterWizard.#onGoto,
      next: CharacterWizard.#onNext,
      previous: CharacterWizard.#onPrevious,
      adjust: CharacterWizard.#onAdjust,
      pickImage: CharacterWizard.#onPickImage,
      pickVocation: CharacterWizard.#onPickVocation,
      create: CharacterWizard.#onCreate
    }
  };

  static PARTS = { main: { template: "systems/hakai-kousen/templates/apps/character-wizard.hbs", scrollable: [".hk-wizard-body"] } };

  state = initialState();

  /** Index du Pokédex (nom, image) pour le choix du Starter. */
  #pokedex = null;

  /* -------------------------------------------- */

  /** Erreurs de règles d'une étape (vides si l'étape est valide). */
  errors(key) {
    const s = this.state;
    const e = [];
    if ( key === "concept" ) {
      if ( !s.name.trim() ) e.push("Donnez un nom au personnage.");
    }
    if ( key === "attributes" ) {
      const spent = sum(s.attrs) - 5;
      if ( spent !== 10 ) e.push(`Répartissez exactement 10 points (${spent} répartis).`);
      if ( Object.values(s.attrs).some(v => v > 5) ) e.push("Aucune Caractéristique au-dessus de 5 à la création.");
    }
    if ( key === "domains" ) {
      const sk = sum(s.skills);
      const kn = sum(s.knowledges);
      if ( sk < 5 ) e.push(`Au moins 5 points en Compétences (${sk}).`);
      if ( kn < 5 ) e.push(`Au moins 5 points en Connaissances (${kn}).`);
      if ( sk + kn !== 17 ) e.push(`17 points au total (${sk + kn} répartis).`);
      if ( [...Object.values(s.skills), ...Object.values(s.knowledges)].some(v => v > 3) ) e.push("Aucun domaine au-dessus du Niveau 3.");
    }
    if ( key === "specs" ) {
      for ( const [spec, group] of [[s.specSkill, s.skills], [s.specKnowledge, s.knowledges]] ) {
        if ( spec.key && ((group[spec.key] ?? 0) < 3) ) e.push(`${ALL_DOMAINS[spec.key]} n'est plus au Niveau 3 : choisissez un autre domaine.`);
        if ( spec.key && !spec.text.trim() ) e.push(`Nommez la Spécialisation de ${ALL_DOMAINS[spec.key]}.`);
      }
    }
    if ( key === "starter" && s.starter.enabled ) {
      if ( !s.starter.uuid ) e.push("Choisissez l'espèce du Starter (ou décochez l'étape).");
      const iv = sum(s.starter.iv);
      if ( iv !== 10 ) e.push(`Répartissez exactement 10 IV (${iv} répartis).`);
      if ( Object.values(s.starter.iv).some(v => v > 3) ) e.push("Au plus 3 IV dans une même statistique.");
    }
    return e;
  }

  /** Erreurs bloquantes (les limites ignorées par le MJ ne bloquent que le nom et l'espèce). */
  blocking(key) {
    const errors = this.errors(key);
    if ( !this.state.ignoreLimits ) return errors;
    return errors.filter(e => /nom|espèce/i.test(e));
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const s = this.state;
    const step = STEPS[s.step].key;
    if ( (step === "starter") && !this.#pokedex ) {
      const pack = game.packs.get(`${SCOPE}.pokedex`);
      this.#pokedex = pack ? [...await pack.getIndex({ fields: ["system.number"] })].sort((a, b) => a.name.localeCompare(b.name, "fr")) : [];
    }
    const max = s.ignoreLimits ? 10 : null;
    const domainRows = (keys, group) => Object.entries(keys).map(([k, label]) => ({
      key: k, label, group, value: s[group][k], hint: DOMAIN_HINTS[k],
      canAdd: (s[group][k] < (max ?? 3)) && ((sum(s.skills) + sum(s.knowledges) < 17) || s.ignoreLimits), canRemove: s[group][k] > 0
    }));
    const specRows = (spec, group, keys) => ({
      key: spec.key, text: spec.text,
      options: Object.entries(keys).filter(([k]) => s.ignoreLimits || (s[group][k] >= 3)).map(([k, label]) => ({ key: k, label, selected: k === spec.key })),
      suggestions: SPEC_SUGGESTIONS[spec.key] ?? []
    });
    const errors = this.errors(step);
    const blocking = this.blocking(step);
    const allErrors = STEPS.slice(0, -1).flatMap(st => this.errors(st.key).map(e => `${st.label} : ${e}`));
    const allBlocking = STEPS.slice(0, -1).flatMap(st => this.blocking(st.key));
    const st = s.starter;
    return {
      state: s,
      isGM: game.user.isGM,
      step,
      is: { [step]: true },
      steps: STEPS.map((x, i) => ({ ...x, index: i, active: i === s.step, done: (i < s.step) || ((i <= s.reached) && !this.errors(x.key).length), reachable: i <= s.reached })),
      errors, blocking: blocking.length > 0,
      first: s.step === 0, last: s.step === STEPS.length - 1,
      vocations: Object.entries(VOCATIONS).map(([label, hint]) => ({ label, hint, selected: label === s.vocation })),
      attributes: Object.entries(ATTRIBUTES).map(([k, a]) => {
        const v = s.attrs[k];
        return { key: k, label: a.label, abbr: a.abbr, value: v, score: SCORE_LABELS[Math.min(v, 5) - 1] ?? "",
          text: ATTRIBUTE_SCORES[k][Math.min(Math.max(v, 1), 5) - 1], canAdd: (sum(s.attrs) - 5 < 10 || s.ignoreLimits) && (v < (max ?? 5)), canRemove: v > 1 };
      }),
      attrLeft: 15 - sum(s.attrs),
      domainColumns: [
        { title: "Compétences", rows: domainRows(SKILLS, "skills") },
        { title: "Connaissances", rows: domainRows(KNOWLEDGES, "knowledges") }
      ],
      skillTotal: sum(s.skills), knowledgeTotal: sum(s.knowledges), domainLeft: 17 - sum(s.skills) - sum(s.knowledges),
      freeUsed: Math.max(sum(s.skills) - 5, 0) + Math.max(sum(s.knowledges) - 5, 0),
      specs: [
        { title: "Spécialisation de Compétence", field: "specSkill", ...specRows(s.specSkill, "skills", SKILLS) },
        { title: "Spécialisation de Connaissance", field: "specKnowledge", ...specRows(s.specKnowledge, "knowledges", KNOWLEDGES) }
      ],
      gear: GEAR.map(g => ({ ...g, checked: gearChecked(s, g),
        reason: g.base ? "équipement de base" : g.domains ? `suggéré : ${g.domains.map(k => ALL_DOMAINS[k]).join(", ")}` : g.note,
        suggested: !g.base && (g.domains ?? []).some(k => (s.skills[k] ?? s.knowledges[k] ?? 0) > 0) })),
      pokedex: this.#pokedex ?? [],
      natures: Object.entries(NATURES).map(([k, n]) => ({ key: k, selected: k === st.nature,
        label: n.plus ? `${n.label} (+${POKEMON_STATS[n.plus].abbr} / −${POKEMON_STATS[n.minus].abbr})` : `${n.label} (neutre)` })),
      talents: (st.info?.talents ?? []).map((t, i) => ({ index: i, name: t.name, hidden: t.hidden, selected: i === Number(st.talent) })),
      ivs: IV_STATS.map(k => {
        const base = st.info?.stats?.[k] ?? 0;
        const gain = POKEMON_STATS[k].gain;
        return { key: k, abbr: POKEMON_STATS[k].abbr, label: POKEMON_STATS[k].label, iv: st.iv[k], base, gain,
          total: base + (st.iv[k] * gain), canAdd: (sum(st.iv) < 10 || s.ignoreLimits) && (st.iv[k] < (max ?? 3)), canRemove: st.iv[k] > 0 };
      }),
      ivLeft: 10 - sum(st.iv),
      summary: step === "summary" ? this.#summary() : null,
      allErrors, canCreate: !allBlocking.length
    };
  }

  /** Lignes du récapitulatif. */
  #summary() {
    const s = this.state;
    const levels = (keys, group) => Object.entries(keys).filter(([k]) => s[group][k] > 0).map(([k, label]) => {
      const spec = [s.specSkill, s.specKnowledge].find(x => x.key === k && x.text.trim());
      return `${label} ${s[group][k]}${spec ? ` (${spec.text.trim()})` : ""}`;
    }).join(", ") || "—";
    const gear = GEAR.filter(g => gearChecked(s, g)).map(g => g.quantity > 1 ? `${g.quantity} ${g.name}` : g.name);
    if ( s.fetish.trim() ) gear.push(`${s.fetish.trim()} (objet fétiche)`);
    const st = s.starter;
    return [
      { label: "Dresseur", value: `${s.name || "—"}${s.vocation ? `, ${s.vocation}` : ""}` },
      { label: "Caractéristiques", value: Object.entries(ATTRIBUTES).map(([k, a]) => `${a.abbr} ${s.attrs[k]}`).join(" · ") + " · VIT 10" },
      { label: "Compétences", value: levels(SKILLS, "skills") },
      { label: "Connaissances", value: levels(KNOWLEDGES, "knowledges") },
      { label: "Équipement", value: gear.join(", ") || "—" },
      { label: "Argent", value: `${s.money} ₽` },
      { label: "Starter", value: !st.enabled ? "Aucun (remis plus tard par le MJ)"
        : `${st.nickname ? `${st.nickname} (${st.species})` : (st.species || "—")}, ${NATURES[st.nature]?.label ?? ""}`
          + `${st.info?.talents?.[st.talent] ? `, ${st.info.talents[st.talent].name}` : ""}, IV ${IV_STATS.filter(k => st.iv[k]).map(k => `${POKEMON_STATS[k].abbr} ${st.iv[k]}`).join(" · ") || "—"}` }
    ];
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for ( const input of this.element.querySelectorAll("input, select, textarea") ) {
      // L'élément est mémorisé avant tout await : event.currentTarget est remis à null après l'événement.
      input.addEventListener("change", async () => {
        this.#readForm();
        if ( input.name === "starter.species" ) await this.#loadSpecies();
        if ( input.dataset.rerender !== undefined ) this.render();
      });
    }
    // Espèce du Starter : validée dès qu'un nom du Pokédex est choisi dans la liste ou tapé en entier, ou avec Entrée.
    const species = this.element.querySelector("input[name='starter.species']");
    if ( species ) {
      const apply = async () => {
        this.#readForm();
        await this.#loadSpecies();
        this.render();
      };
      species.addEventListener("input", () => {
        const name = species.value.trim().toLowerCase();
        const known = (this.#pokedex ?? []).some(e => e.name.toLowerCase() === name);
        if ( known && (name !== (this.state.starter.info ? this.state.starter.species.toLowerCase() : "")) ) apply();
      });
      species.addEventListener("keydown", event => {
        if ( event.key !== "Enter" ) return;
        event.preventDefault();
        apply();
      });
    }
  }

  /** Recopie les champs de l'étape affichée dans l'état. */
  #readForm() {
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    if ( data.money !== undefined ) data.money = Math.max(Number(data.money) || 0, 0);
    if ( data.starter?.talent !== undefined ) data.starter.talent = Number(data.starter.talent) || 0;
    foundry.utils.mergeObject(this.state, data);
  }

  /** Espèce saisie : recherche dans le Pokédex, statistiques de base et Talents. */
  async #loadSpecies() {
    const st = this.state.starter;
    const name = st.species.trim().toLowerCase();
    const entry = (this.#pokedex ?? []).find(e => e.name.toLowerCase() === name);
    if ( !entry ) {
      st.uuid = "";
      st.info = null;
      return;
    }
    const doc = await fromUuid(entry.uuid);
    const sys = doc.system;
    st.species = doc.name;
    st.uuid = entry.uuid;
    st.talent = 0;
    st.info = {
      img: doc.img,
      number: sys.number,
      types: [sys.types.primary, sys.types.secondary].filter(Boolean).map(t => TYPES[t] ?? t).join(" / "),
      category: sys.speciesData.category,
      stats: Object.fromEntries(IV_STATS.map(k => [k, sys.stats[k].base])),
      talents: sys.speciesData.talents.map(t => ({ name: t.name, uuid: t.uuid, hidden: t.hidden })),
      attacks: doc.items.filter(i => i.type === "attack").map(i => i.name).join(", ")
    };
  }

  /* -------------------------------------------- */

  static async #onGoto(event, target) {
    this.#readForm();
    const index = Number(target.dataset.index);
    if ( index > this.state.reached ) return;
    this.state.step = index;
    this.render();
  }

  static async #onNext() {
    this.#readForm();
    const step = STEPS[this.state.step].key;
    if ( this.blocking(step).length ) return ui.notifications.warn(this.blocking(step)[0]);
    this.state.step = Math.min(this.state.step + 1, STEPS.length - 1);
    this.state.reached = Math.max(this.state.reached, this.state.step);
    this.render();
  }

  static async #onPrevious() {
    this.#readForm();
    this.state.step = Math.max(this.state.step - 1, 0);
    this.render();
  }

  /** Boutons + / − : Caractéristiques, domaines et IV du Starter. */
  static async #onAdjust(event, target) {
    this.#readForm();
    const { path, delta } = target.dataset;
    const value = foundry.utils.getProperty(this.state, path) + Number(delta);
    foundry.utils.setProperty(this.state, path, Math.max(value, path.startsWith("attrs") ? 1 : 0));
    // Une Spécialisation exige le Niveau 3 : elle est retirée si le domaine redescend.
    for ( const [spec, group] of [[this.state.specSkill, this.state.skills], [this.state.specKnowledge, this.state.knowledges]] ) {
      if ( spec.key && ((group[spec.key] ?? 0) < 3) && !this.state.ignoreLimits ) spec.key = "";
    }
    this.render();
  }

  static async #onPickImage() {
    this.#readForm();
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({ type: "image", current: this.state.img, callback: path => {
      this.state.img = path;
      this.render();
    } }).browse();
  }

  static async #onPickVocation(event, target) {
    this.#readForm();
    this.state.vocation = target.dataset.vocation;
    this.render();
  }

  static async #onCreate(event, target) {
    this.#readForm();
    const blocking = STEPS.slice(0, -1).flatMap(st => this.blocking(st.key));
    if ( blocking.length ) return ui.notifications.warn(blocking[0]);
    target.disabled = true;
    const payload = this.#payload();
    if ( game.user.can("ACTOR_CREATE") ) {
      const trainer = await createCharacter(payload, game.user.id);
      trainer?.sheet.render(true);
      return this.close();
    }
    // Sans le droit de créer des acteurs : le MJ connecté crée la fiche, qui s'ouvre à son arrivée.
    if ( !game.users.activeGM ) {
      target.disabled = false;
      return ui.notifications.error("Aucun MJ connecté : il doit être présent pour créer votre Dresseur (ou vous donner le droit de créer des acteurs).");
    }
    const requestId = foundry.utils.randomID();
    Hooks.on("createActor", function open(actor) {
      if ( actor.getFlag(SCOPE, "wizardRequest") !== requestId ) return;
      Hooks.off("createActor", open);
      ui.notifications.info(`${actor.name} a été créé.`);
      actor.sheet.render(true);
    });
    game.socket.emit(SOCKET, { type: "createCharacter", payload, requestId, userId: game.user.id });
    ui.notifications.info("Demande envoyée au MJ : la fiche s'ouvrira dès sa création.");
    return this.close();
  }

  /** Données nécessaires à la création (transmissibles au MJ). */
  #payload() {
    const s = this.state;
    const st = s.starter;
    const domains = (keys, group, spec) => Object.fromEntries(Object.keys(keys).map(k => [k, {
      level: s[group][k], spec: spec.key === k ? spec.text.trim() : ""
    }]));
    const bio = [
      ["Concept", s.concept], ["Origine", s.origin], ["Histoire", s.background], ["Apparence", s.appearance]
    ].filter(([, t]) => t?.trim()).map(([title, t]) => `<h3>${title}</h3>${paragraphs(t)}`).join("");
    return {
      trainer: {
        name: s.name.trim(),
        img: s.img,
        system: {
          attributes: Object.fromEntries(Object.keys(ATTRIBUTES).map(k => [k, { base: 1, pts: s.attrs[k] - 1 }])),
          vit: { value: 10, max: 10 },
          money: s.money,
          skills: domains(SKILLS, "skills", s.specSkill),
          knowledges: domains(KNOWLEDGES, "knowledges", s.specKnowledge),
          details: {
            player: game.user.isGM ? "" : game.user.name,
            vocation: s.vocation.trim(), origin: s.origin.split("\n")[0].trim().slice(0, 80), build: s.build, skin: s.skin,
            eyesHair: s.eyesHair, heightWeight: s.heightWeight, age: s.age, nature: s.personality, gender: s.gender
          },
          biography: bio,
          objectives: paragraphs(s.objectives)
        }
      },
      gear: GEAR.filter(g => gearChecked(s, g)).map(g => ({ name: g.name, quantity: g.quantity ?? 1, category: g.category })),
      fetish: s.fetish.trim(),
      starter: st.enabled && st.uuid ? {
        uuid: st.uuid, nickname: st.nickname.trim(), nature: st.nature, talent: st.info?.talents?.[st.talent] ?? null,
        ball: st.ball.trim(), provenance: st.provenance.trim(), iv: st.iv
      } : null
    };
  }
}

/* -------------------------------------------- */

/**
 * Crée le Dresseur, son équipement et son Starter (appelé par le joueur, ou par le MJ pour lui).
 * @param {object} payload   Données de l'assistant
 * @param {string} userId    Joueur propriétaire
 * @param {string} [requestId]  Identifiant de la demande transmise au MJ
 */
export async function createCharacter(payload, userId, requestId) {
  const user = game.users.get(userId);
  if ( !user ) return null;
  const ownership = user.isGM ? {} : { [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;

  // Équipement : copie du compendium Objets si l'objet y figure, sinon objet simple.
  const pack = game.packs.get(`${SCOPE}.objets`);
  const index = pack ? await pack.getIndex() : [];
  const items = [];
  for ( const g of payload.gear ) {
    const entry = [...index].find(e => e.name === g.name);
    const data = entry ? game.items.fromCompendium(await pack.getDocument(entry._id)) : { name: g.name, type: "gear", system: { category: g.category ?? "equipment" } };
    foundry.utils.setProperty(data, "system.quantity", g.quantity);
    items.push(data);
  }
  if ( payload.fetish ) items.push({ name: payload.fetish, type: "gear", system: { category: "equipment", quantity: 1,
    description: "<p>Objet fétiche (3.11) : aucun bonus mécanique automatique, validé par le MJ.</p>" } });

  const trainer = await Actor.implementation.create({
    ...payload.trainer,
    type: "trainer",
    ownership,
    items,
    flags: { [SCOPE]: { wizardRequest: requestId ?? null } },
    prototypeToken: { name: payload.trainer.name, actorLink: true, disposition, texture: { src: payload.trainer.img } }
  });
  if ( !trainer || !payload.starter ) return trainer;

  // Starter (4.1) : espèce du Pokédex, 10 IV, Nature et Talent choisis, Confiance 4 et Obéissance 4.
  const st = payload.starter;
  const source = await fromUuid(st.uuid);
  if ( !source ) return trainer;
  const data = game.actors.fromCompendium(source);
  const system = data.system;
  system.nature = st.nature;
  for ( const k of IV_STATS ) system.stats[k].iv = Number(st.iv[k]) || 0;
  const vitMax = system.stats.vit.base + (system.stats.vit.iv * POKEMON_STATS.vit.gain);
  const eneMax = system.stats.ene.base + (system.stats.ene.iv * POKEMON_STATS.ene.gain);
  system.vit = { value: vitMax, max: vitMax };
  system.ene = { value: eneMax, max: eneMax };
  system.relation = { confidence: 4, obedience: 4 };
  system.starter = true;
  Object.assign(system.details, {
    player: payload.trainer.system.details.player, trainer: trainer.name, ball: st.ball || "Poké Ball", provenance: st.provenance
  });
  if ( st.talent?.uuid ) {
    const talent = await fromUuid(st.talent.uuid);
    if ( talent ) data.items = [...(data.items ?? []), game.items.fromCompendium(talent)];
  }
  data.name = st.nickname || source.name;
  data.ownership = ownership;
  data.prototypeToken = { ...(data.prototypeToken ?? {}), name: data.name, actorLink: true, disposition };
  const pokemon = await Actor.implementation.create(data);
  if ( pokemon ) await trainer.update({ "system.team": [pokemon.uuid] });
  return trainer;
}

/** Ouvre l'assistant (ou le ramène au premier plan s'il est déjà ouvert). */
export function openCharacterWizard() {
  const open = foundry.applications.instances.get(CharacterWizard.DEFAULT_OPTIONS.id);
  if ( open ) return open.bringToFront();
  return new CharacterWizard().render(true);
}
