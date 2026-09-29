/**
 * Progression : dépense guidée de l'XP (3.12, 4.4, 4.8, 4.13), capture et Boîte PC (5.16, 7.1),
 * évolution (4.14) et mécaniques régionales (5.19).
 */
import { ATTRIBUTES, KNOWLEDGES, POKEMON_STATS, POKESKILL_CATEGORIES, SKILLS, TYPES } from "./config.mjs";
import { trainerOf } from "./combat/effects.mjs";

const { DialogV2 } = foundry.applications.api;
const PC_SIZE = 30;
const TEAM_SIZE = 6;

async function confirm(title, text) {
  return DialogV2.confirm({ window: { title }, content: `<p>${text}</p>`, rejectClose: false });
}

async function log(actor, title, text) {
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="hk-card"><header><h3>${title}</h3></header><p>${text}</p></div>`
  });
}

/* -------------------------------------------- */
/*  XP Dresseur                                 */
/* -------------------------------------------- */

/**
 * Améliore une Caractéristique (4 × valeur actuelle), une Compétence ou une Connaissance
 * (ouverture 2 XP, puis 2 × Niveau actuel ; maximum 5).
 * @param {Actor} trainer
 * @param {"attribute"|"skills"|"knowledges"} group
 * @param {string} key
 */
export async function spendTrainerXP(trainer, group, key) {
  const xp = trainer.system.xp.value;
  let cost, label, update, after;
  if ( group === "attribute" ) {
    const attr = trainer.system.attributes[key];
    cost = 4 * attr.value;
    label = `${ATTRIBUTES[key].label} ${attr.value} → ${attr.value + 1}`;
    update = { [`system.attributes.${key}.pts`]: attr.pts + 1 };
  }
  else {
    const domain = trainer.system[group][key];
    if ( domain.level >= 5 ) return ui.notifications.info("Niveau maximum atteint (5).");
    cost = domain.level === 0 ? 2 : 2 * domain.level;
    after = domain.level + 1;
    label = `${(group === "skills" ? SKILLS : KNOWLEDGES)[key]} ${domain.level} → ${after}`;
    update = { [`system.${group}.${key}.level`]: after };
  }
  if ( xp < cost ) return ui.notifications.warn(`${label} coûte ${cost} XP Dresseur (disponible : ${xp}).`);
  if ( !await confirm("Dépenser de l'XP", `${label} pour <strong>${cost} XP Dresseur</strong> ? Le RP doit justifier la progression.`) ) return;
  await trainer.update({ ...update, "system.xp.value": xp - cost });
  const spec = after === 5 ? " Niveau 5 : une nouvelle Spécialisation peut être débloquée." : "";
  return log(trainer, "Progression", `${label} (−${cost} XP Dresseur).${spec}`);
}

/* -------------------------------------------- */
/*  XP Pokémon                                  */
/* -------------------------------------------- */

/** EV : ouverture 10 XP, puis EV actuels × 7 ; maximum 30 par statistique (4.4). */
export async function spendEV(pokemon, key) {
  const stat = pokemon.system.stats[key];
  if ( stat.ev >= 30 ) return ui.notifications.info("Maximum de 30 EV atteint pour cette statistique.");
  const cost = stat.ev === 0 ? 10 : stat.ev * 7;
  const xp = pokemon.system.xp.value;
  const label = `EV ${POKEMON_STATS[key].abbr} ${stat.ev} → ${stat.ev + 1}`;
  if ( xp < cost ) return ui.notifications.warn(`${label} coûte ${cost} XP Pokémon (disponible : ${xp}).`);
  if ( !await confirm("Dépenser de l'XP Pokémon", `${label} pour <strong>${cost} XP Pokémon</strong> ?`) ) return;
  await pokemon.update({ [`system.stats.${key}.ev`]: stat.ev + 1, "system.xp.value": xp - cost });
  return log(pokemon, "Progression", `${label} (−${cost} XP Pokémon, +${POKEMON_STATS[key].gain} ${POKEMON_STATS[key].abbr}).`);
}

/** Compétence Pokémon : Niveau actuel × 10, 20 ou 30 XP selon la catégorie (4.8). */
export async function spendPokeskill(pokemon, item) {
  const cost = item.system.level * (POKESKILL_CATEGORIES[item.system.category]?.cost ?? 10);
  const xp = pokemon.system.xp.value;
  const label = `${item.name} ${item.system.level} → ${item.system.level + 1}`;
  if ( item.system.level < 1 ) return ui.notifications.warn("Une Compétence s'ouvre par l'entraînement (apprentissage /10), pas avec l'XP.");
  if ( xp < cost ) return ui.notifications.warn(`${label} coûte ${cost} XP Pokémon (disponible : ${xp}).`);
  if ( !await confirm("Dépenser de l'XP Pokémon", `${label} pour <strong>${cost} XP Pokémon</strong> ?`) ) return;
  await item.update({ "system.level": item.system.level + 1 });
  await pokemon.update({ "system.xp.value": xp - cost });
  return log(pokemon, "Progression", `${label} (−${cost} XP Pokémon).`);
}

/**
 * +1 Confiance ou +1 Obéissance pour 1 XP Dresseur, une fois par jour et par Pokémon ;
 * 2 XP pour un semi-légendaire (4.13, 4.15).
 */
export async function raiseRelation(pokemon, which) {
  const trainer = trainerOf(pokemon);
  if ( !trainer ) return ui.notifications.warn("Ce Pokémon n'est dans l'équipe d'aucun Dresseur.");
  const current = pokemon.system.relation[which];
  const label = which === "confidence" ? "Confiance" : "Obéissance";
  if ( current >= 9 ) return ui.notifications.info(`${label} au maximum (9).`);
  const day = Math.floor(game.time.worldTime / 86400);
  if ( pokemon.system.relationDay === day ) return ui.notifications.warn("Une seule augmentation par jour et par Pokémon.");
  const semi = ["semi", "semiFinal"].includes(pokemon.system.encounter?.rarity);
  const cost = semi ? 2 : 1;
  if ( trainer.system.xp.value < cost ) return ui.notifications.warn(`${trainer.name} n'a pas assez d'XP Dresseur (${cost} nécessaire).`);
  if ( !await confirm("Relation", `+1 ${label} pour ${pokemon.name} contre <strong>${cost} XP Dresseur</strong> de ${trainer.name} ?`) ) return;
  await trainer.update({ "system.xp.value": trainer.system.xp.value - cost });
  await pokemon.update({ [`system.relation.${which}`]: current + 1, "system.relationDay": day });
  return log(pokemon, "Relation", `${label} ${current} → ${current + 1} (−${cost} XP Dresseur de ${trainer.name}).`);
}

/* -------------------------------------------- */
/*  Capture et Boîte PC                         */
/* -------------------------------------------- */

/**
 * Capture confirmée par le MJ : copie du Pokémon pour le Dresseur, dans l'équipe (6) ou la Boîte PC (30),
 * relation initiale au choix du MJ (4.19), jeton retiré de la scène, XP de première capture.
 * @param {Actor} wild
 * @param {Actor} trainer
 * @param {string} ballName
 */
export async function confirmCapture(wild, trainer, ballName) {
  if ( !game.user.isGM ) return ui.notifications.warn("Seul le MJ confirme une capture.");
  const values = await DialogV2.prompt({
    window: { title: `Capture de ${wild.name} par ${trainer.name}` },
    content: `<p class="hint">Relation initiale selon les circonstances de la rencontre (4.19).</p>
      <div class="form-group"><label>Confiance</label><div class="form-fields"><input type="number" name="confidence" value="3" min="0" max="9"></div></div>
      <div class="form-group"><label>Obéissance</label><div class="form-fields"><input type="number" name="obedience" value="2" min="0" max="9"></div></div>
      <div class="form-group"><label>Surnom</label><div class="form-fields"><input type="text" name="name" value="${wild.system.species || wild.name}"></div></div>`,
    ok: { label: "Confirmer la capture", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !values ) return;

  const data = wild.toObject();
  delete data._id;
  data.name = values.name || wild.name;
  data.folder = trainer.folder?.id ?? null;
  data.ownership = foundry.utils.deepClone(trainer.ownership);
  data.system.relation = { confidence: values.confidence, obedience: values.obedience };
  data.system.details.trainer = trainer.name;
  data.system.details.ball = ballName;
  data.system.boss = { enabled: false, vulnerable: "", phases: [] };
  data.prototypeToken = { ...data.prototypeToken, name: data.name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY };
  data.effects = [];
  const [pokemon] = await Actor.implementation.createDocuments([data]);

  const inTeam = trainer.system.team.length < TEAM_SIZE;
  if ( !inTeam && (trainer.system.pc.length >= PC_SIZE) ) ui.notifications.warn(`La Boîte PC de ${trainer.name} est pleine.`);
  const update = inTeam ? { "system.team": [...trainer.system.team, pokemon.uuid] } : { "system.pc": [...trainer.system.pc, pokemon.uuid] };
  let xpText = "";
  if ( !trainer.system.firstCapture ) {
    update["system.firstCapture"] = true;
    update["system.xp.value"] = trainer.system.xp.value + 1;
    xpText = " Première capture : +1 XP Dresseur.";
  }
  await trainer.update(update);

  // Le Pokémon sauvage quitte la scène et le combat.
  const token = wild.token ?? canvas.scene?.tokens.find(t => t.actorId === wild.id);
  if ( token ) {
    const combatant = game.combat?.combatants.find(c => c.tokenId === token.id);
    if ( combatant ) await combatant.delete();
    await token.delete();
  }
  return log(trainer, `${pokemon.name} rejoint ${trainer.name} !`,
    `Rangé ${inTeam ? "dans l'équipe" : "dans la Boîte PC (équipe complète)"} · ${ballName} · Confiance ${values.confidence}, Obéissance ${values.obedience}.${xpText}`);
}

/** Échange entre l'équipe (6) et la Boîte PC (30). */
export async function moveBetweenTeamAndPC(trainer, uuid, toPC) {
  const team = trainer.system.team.filter(u => u !== uuid);
  const pc = trainer.system.pc.filter(u => u !== uuid);
  if ( toPC ) {
    if ( pc.length >= PC_SIZE ) return ui.notifications.warn("La Boîte PC est pleine (30 places).");
    return trainer.update({ "system.team": team, "system.pc": [...pc, uuid] });
  }
  if ( team.length >= TEAM_SIZE ) return ui.notifications.warn("L'équipe compte déjà 6 Pokémon.");
  return trainer.update({ "system.team": [...team, uuid], "system.pc": pc });
}

/* -------------------------------------------- */
/*  Évolution (4.14)                            */
/* -------------------------------------------- */

const EVOLUTION_CATEGORIES = {
  insect3: { label: "Insecte à évolution rapide, 3 stades", first: 8, second: 10 },
  insect2: { label: "Insecte à évolution rapide, 2 stades", first: 10 },
  classic3: { label: "Pokémon classique, 3 stades", first: 10, second: 14 },
  classic2: { label: "Pokémon classique, 2 stades", first: 12 },
  semi: { label: "Semi-légendaire, 3 stades", first: 10, second: 14 }
};

/**
 * Évolution : vérifie le Dressage requis puis remplace l'espèce par celle du Pokédex,
 * en conservant IV, EV, Nature, relation, XP, capacités et objets.
 */
export async function evolve(pokemon) {
  const pack = game.packs.get("hakai-kousen.pokedex");
  const index = await pack.getIndex();
  const text = pokemon.system.speciesData.evolutions.split("·").find(p => p.includes("Évolutions")) ?? "";
  const suggested = [...text.matchAll(/([^,:()]+?)\s*\(/g)].map(m => m[1].trim()).filter(n => index.find(e => e.name.toLowerCase() === n.toLowerCase()));
  const cats = Object.entries(EVOLUTION_CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === "classic3" ? "selected" : ""}>${c.label}</option>`).join("");
  const values = await DialogV2.prompt({
    window: { title: `Évolution de ${pokemon.name}` },
    content: `
      <div class="form-group"><label>Évolue en</label><div class="form-fields">
        <input type="text" name="species" list="hk-evos" value="${suggested[0] ?? ""}">
        <datalist id="hk-evos">${index.map(e => `<option value="${e.name}">`).join("")}</datalist></div></div>
      <p class="hint">${pokemon.system.speciesData.evolutions || "Aucune évolution connue."}</p>
      <div class="form-group"><label>Catégorie</label><div class="form-fields"><select name="category">${cats}</select></div></div>
      <div class="form-group"><label>Évolution</label><div class="form-fields"><select name="stage">
        <option value="first">1re évolution</option><option value="second">2e évolution</option></select></div></div>
      <div class="form-group"><label>XP Pokémon dépensée</label><div class="form-fields"><input type="number" name="xp" value="0" min="0"></div>
        <p class="hint">Coût indiqué sur le site Hakai Kousen pour les évolutions par niveau ; 0 pour une pierre, un échange…</p></div>`,
    ok: { label: "Évoluer", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !values ) return;

  const category = EVOLUTION_CATEGORIES[values.category];
  const required = category[values.stage];
  if ( !required ) return ui.notifications.warn("Cette catégorie n'a pas de deuxième évolution.");
  if ( pokemon.system.dressage < required ) {
    const go = await confirm("Dressage insuffisant", `Il faut Dressage ${required} (actuel : ${pokemon.system.dressage}). Évoluer quand même (décision du MJ) ?`);
    if ( !go ) return;
  }
  const xp = Number(values.xp) || 0;
  if ( pokemon.system.xp.value < xp ) return ui.notifications.warn(`XP Pokémon insuffisante (${pokemon.system.xp.value} / ${xp}).`);
  const entry = index.find(e => e.name.toLowerCase() === String(values.species).trim().toLowerCase());
  if ( !entry ) return ui.notifications.warn(`Espèce introuvable dans le Pokédex : ${values.species}`);
  const target = await pack.getDocument(entry._id);

  const old = pokemon.system.species || pokemon.name;
  const t = target.system;
  const update = {
    "system.species": t.species,
    "system.number": t.number,
    "system.types": t.types.toObject?.() ?? t.types,
    "system.speciesData": t.speciesData.toObject?.() ?? t.speciesData,
    "system.details.heightWeight": t.details.heightWeight,
    "system.xp.value": pokemon.system.xp.value - xp
  };
  for ( const k of Object.keys(pokemon.system.stats) ) update[`system.stats.${k}.base`] = t.stats[k].base;
  if ( pokemon.img === `systems/hakai-kousen/assets/pokemon/${pokemon.system.number}.png` ) {
    update.img = target.img;
    update["prototypeToken.texture.src"] = target.img;
  }
  if ( pokemon.name === old ) {
    update.name = target.name;
    update["prototypeToken.name"] = target.name;
  }
  await pokemon.update(update);
  return log(pokemon, `${old} évolue en ${target.name} !`,
    `Dressage ${pokemon.system.dressage} (requis ${required})${xp ? ` · −${xp} XP Pokémon` : ""}. IV, EV, Nature, relation et capacités sont conservés ; vérifiez le Talent (onglet Compétences).`);
}

/* -------------------------------------------- */
/*  Mécaniques régionales (5.19)                */
/* -------------------------------------------- */

function mechanicUnlocked(pokemon, key, label) {
  const trainer = trainerOf(pokemon);
  if ( !trainer?.system.mechanics[key]?.unlocked ) {
    ui.notifications.warn(`${label} : le Dresseur doit avoir débloqué la mécanique (onglet Équipe de sa fiche).`);
    return null;
  }
  return trainer;
}

/** Méga-Évolution : Dressage 18, gratuite ; la forme se termine au KO. */
export async function toggleMega(pokemon) {
  const form = pokemon.system.form;
  if ( form.active ) {
    await pokemon.update({ "system.form.active": false });
    return log(pokemon, `${pokemon.name} reprend sa forme normale`, "");
  }
  const trainer = mechanicUnlocked(pokemon, "mega", "Méga-Évolution");
  if ( !trainer ) return;
  if ( pokemon.system.dressage < 18 ) return ui.notifications.warn(`Méga-Évolution : Dressage 18 requis (actuel : ${pokemon.system.dressage}).`);
  await pokemon.update({ "system.form.active": true });
  return log(pokemon, `${pokemon.name} méga-évolue !`,
    `${form.name || "Forme Méga"}${form.primary ? ` · ${[TYPES[form.primary], TYPES[form.secondary]].filter(Boolean).join(" / ")}` : ""}. Activation gratuite, sans consommer l'action. Fin au KO.`);
}

/** Dynamax : 3 tours, VIT max et VIT actuelle doublées, puis divisées par 2. */
export async function toggleDynamax(pokemon) {
  const dyn = pokemon.system.dynamax;
  if ( dyn.active ) return endDynamax(pokemon);
  const trainer = mechanicUnlocked(pokemon, "dynamax", "Dynamax");
  if ( !trainer ) return;
  if ( pokemon.system.dressage < 8 ) return ui.notifications.warn("Dynamax : le Pokémon doit obéir à son Dresseur (Dressage 8).");
  const round = game.combat?.started ? game.combat.round : 0;
  await pokemon.update({ "system.dynamax": { active: true, endsRound: round + 3 }, "system.vit.value": pokemon.system.vit.value * 2 });
  return log(pokemon, `${pokemon.name} se Dynamaxe !`,
    `VIT doublée pendant 3 tours${round ? ` (fin au début du tour ${round + 3})` : ""}. Les attaques deviennent leurs capacités Dynamax ; les capacités de statut deviennent Gardomax.`);
}

export async function endDynamax(pokemon) {
  await pokemon.update({ "system.dynamax.active": false, "system.vit.value": Math.floor(pokemon.system.vit.value / 2) });
  return log(pokemon, `${pokemon.name} reprend sa taille normale`, "VIT actuelle divisée par 2.");
}

/** Téracristallisation : le Type Téra remplace les types défensifs. */
export async function toggleTera(pokemon) {
  const tera = pokemon.system.tera;
  if ( tera.active ) return pokemon.update({ "system.tera.active": false });
  if ( !tera.type ) return ui.notifications.warn("Choisissez d'abord le Type Téra du Pokémon.");
  const trainer = mechanicUnlocked(pokemon, "tera", "Téracristallisation");
  if ( !trainer ) return;
  if ( pokemon.system.dressage < 8 ) return ui.notifications.warn("Téracristallisation : le Pokémon doit obéir à son Dresseur (Dressage 8).");
  await pokemon.update({ "system.tera.active": true });
  const label = tera.type === "stellaire" ? "Stellaire" : TYPES[tera.type];
  return log(pokemon, `${pokemon.name} se téracristallise !`,
    `Type Téra : ${label}. Défensivement, ${tera.type === "stellaire" ? "il conserve ses types d'origine" : "seul le Type Téra compte"} ; il garde ses STAB d'origine et gagne celui du Type Téra (dégâts à ajuster).`);
}

/**
 * Fin des formes temporaires : au KO, la Méga-Évolution et le Dynamax prennent fin (5.19) ;
 * en fin de combat, la Téracristallisation aussi.
 * @param {Actor} pokemon
 * @param {boolean} [endOfBattle]
 */
export async function resetBattleForms(pokemon, endOfBattle = false) {
  const update = {};
  if ( pokemon.system.form?.active ) update["system.form.active"] = false;
  if ( endOfBattle && pokemon.system.tera?.active ) update["system.tera.active"] = false;
  if ( Object.keys(update).length ) await pokemon.update(update);
  if ( pokemon.system.dynamax?.active ) {
    if ( pokemon.system.vit.value <= 0 ) await pokemon.update({ "system.dynamax.active": false });
    else await endDynamax(pokemon);
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerProgressionHooks() {
  // Carte de capture : confirmation par le MJ.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll("[data-hk-capture]").forEach(button => {
      button.addEventListener("click", async () => {
        const wild = await fromUuid(button.dataset.uuid);
        const trainer = await fromUuid(button.dataset.trainer);
        if ( wild && trainer ) await confirmCapture(wild, trainer, button.dataset.ball);
      });
    });
  });

  // KO : fin de la Méga-Évolution et du Dynamax.
  Hooks.on("updateActor", (actor, changed) => {
    if ( !game.user.isActiveGM || (actor.type !== "pokemon") ) return;
    if ( !foundry.utils.hasProperty(changed, "system.vit.value") || (actor.system.vit.value > 0) ) return;
    if ( actor.system.form.active || actor.system.dynamax.active ) resetBattleForms(actor);
  });

  // Dynamax : 3 tours ; fin de combat : toutes les formes temporaires.
  Hooks.on("updateCombat", (combat, changed) => {
    if ( !game.user.isActiveGM || !("round" in changed) ) return;
    for ( const c of combat.combatants ) {
      const dyn = c.actor?.system.dynamax;
      if ( dyn?.active && dyn.endsRound && (combat.round >= dyn.endsRound) ) endDynamax(c.actor);
    }
  });
  Hooks.on("deleteCombat", combat => {
    if ( !game.user.isActiveGM ) return;
    for ( const c of combat.combatants ) {
      if ( c.actor?.type === "pokemon" ) resetBattleForms(c.actor, true);
    }
  });
}
