/**
 * Progression : dépense guidée de l'XP (3.12, 4.4, 4.8, 4.13), capture et Boîte PC (5.16, 7.1),
 * évolution (4.14) et mécaniques régionales (5.19).
 */
import { ATTRIBUTES, KNOWLEDGES, POKEMON_STATS, POKESKILL_CATEGORIES, SKILLS, TYPES, semiLegendaryRarity } from "./config.mjs";
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
    cost = 4 * attr.total;
    label = `${ATTRIBUTES[key].label} ${attr.total} → ${attr.total + 1}`;
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

/** Nouveau-né : l'XP reste bloquée jusqu'à 100 XP cumulés (7.8). */
function newbornLocked(pokemon) {
  if ( !pokemon.system.newborn ) return false;
  ui.notifications.warn(`${pokemon.name} est un Nouveau-né : XP bloquée jusqu'à 100 XP cumulés (${pokemon.system.xp.total} / 100).`);
  return true;
}

/** EV : ouverture 10 XP, puis EV actuels × 7 ; maximum 30 par statistique (4.4). */
export async function spendEV(pokemon, key) {
  if ( newbornLocked(pokemon) ) return;
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
  if ( newbornLocked(pokemon) ) return;
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
 * Coût en XP Pokémon d'une attaque apprise par expérience : son niveau sur le site Hakai Kousen
 * (règle confirmée par l'auteur). « Départ » et « Départ / N » sont connues dès le départ : 0 XP.
 * @param {string} level
 * @returns {number|null}
 */
export function levelCost(level) {
  const text = String(level ?? "").trim();
  if ( /^d[ée]part/i.test(text) ) return 0;
  const n = parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * État de la progression par expérience (4.7) : les attaques s'apprennent dans l'ordre des niveaux.
 * Seules les attaques du plus petit niveau encore non appris sont disponibles ; les suivantes sont bloquées.
 * @param {Actor} pokemon
 */
export function learnsetStatus(pokemon) {
  const known = new Set(pokemon.itemTypes.attack.map(i => i.name.toLowerCase()));
  const entries = pokemon.system.speciesData.learnset
    .map((entry, index) => ({ ...entry, index, cost: levelCost(entry.level), known: known.has(entry.name.toLowerCase()) }))
    .filter(e => e.source === "level");
  const pending = entries.filter(e => !e.known && (e.cost !== null));
  const next = pending.length ? Math.min(...pending.map(e => e.cost)) : null;
  for ( const e of entries ) {
    if ( e.known ) e.state = "known";
    else if ( (e.cost === null) || (e.cost === next) ) e.state = "next";
    else {
      e.state = "locked";
      e.blocker = pending.filter(p => p.cost < e.cost).map(p => p.name).slice(0, 3).join(", ");
    }
  }
  return entries;
}

/**
 * Apprend la prochaine attaque de la progression par expérience, en payant son niveau en XP Pokémon.
 * @param {Actor} pokemon
 * @param {number} index  Position de l'attaque dans la liste de l'espèce
 */
export async function learnNextAttack(pokemon, index) {
  const entry = learnsetStatus(pokemon).find(e => e.index === index);
  if ( !entry || entry.known ) return;
  if ( entry.state === "locked" ) return ui.notifications.warn(`Apprenez d'abord : ${entry.blocker}.`);
  const cost = entry.cost ?? 0;
  if ( cost && newbornLocked(pokemon) ) return;
  const xp = pokemon.system.xp.value;
  if ( xp < cost ) return ui.notifications.warn(`${entry.name} coûte ${cost} XP Pokémon (disponible : ${xp}).`);
  const source = entry.uuid ? await fromUuid(entry.uuid) : null;
  if ( !source ) return ui.notifications.warn(`« ${entry.name} » est introuvable dans les compendiums.`);
  if ( cost && !await confirm("Apprendre une attaque", `${pokemon.name} apprend <strong>${entry.name}</strong> pour <strong>${cost} XP Pokémon</strong> ?`) ) return;
  await pokemon.createEmbeddedDocuments("Item", [game.items.fromCompendium(source)]);
  if ( cost ) await pokemon.update({ "system.xp.value": xp - cost });
  return log(pokemon, "Nouvelle attaque", `${pokemon.name} apprend ${entry.name}${cost ? ` (−${cost} XP Pokémon)` : ""}.`);
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
  // Jour de jeu (temps du monde) ; à défaut, si le MJ ne fait pas avancer le temps, la date réelle.
  const worldDay = Math.floor(game.time.worldTime / 86400);
  const key = game.time.worldTime > 0 ? `monde-${worldDay}` : `date-${new Date().toISOString().slice(0, 10)}`;
  if ( pokemon.system.relationKey === key ) {
    if ( !game.user.isGM ) return ui.notifications.warn("Une seule augmentation par jour et par Pokémon.");
    if ( !await confirm("Relation", "Ce Pokémon a déjà progressé aujourd'hui. Autoriser une nouvelle augmentation (décision du MJ) ?") ) return;
  }
  const cost = pokemon.system.semiLegendary ? 2 : 1;
  if ( trainer.system.xp.value < cost ) return ui.notifications.warn(`${trainer.name} n'a pas assez d'XP Dresseur (${cost} nécessaire).`);
  if ( !await confirm("Relation", `+1 ${label} pour ${pokemon.name} contre <strong>${cost} XP Dresseur</strong> de ${trainer.name} ?`) ) return;
  await trainer.update({ "system.xp.value": trainer.system.xp.value - cost });
  await pokemon.update({ [`system.relation.${which}`]: current + 1, "system.relationKey": key });
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
  // Copain Ball +1 Confiance, Luxe Ball +2 (max 9) ; Soin Ball : soins complets (Annexe 3).
  const ball = ballName.toLowerCase();
  const ballBonus = ball.includes("copain") ? 1 : ball.includes("luxe") ? 2 : 0;
  data.system.relation = { confidence: Math.min(values.confidence + ballBonus, 9), obedience: values.obedience };
  if ( ball.includes("soin ball") ) {
    data.system.vit.value = wild.system.vit.max;
    data.system.ene.value = wild.system.ene.max;
  }
  data.system.details.trainer = trainer.name;
  data.system.details.ball = ballName;
  data.system.boss = { enabled: false, vulnerable: "", phases: [] };
  data.prototypeToken = { ...data.prototypeToken, name: data.name, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY };
  data.effects = ball.includes("soin ball") ? [] : (wild.effects.map(e => e.toObject()) ?? []);
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
    `Rangé ${inTeam ? "dans l'équipe" : "dans la Boîte PC (équipe complète)"} · ${ballName}${ballBonus ? ` (+${ballBonus} Confiance)` : ""}${ball.includes("soin ball") ? " (soigné)" : ""} · Confiance ${data.system.relation.confidence}, Obéissance ${values.obedience}.${xpText}`);
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
  const index = await pack.getIndex({ fields: ["system.speciesData.evolutions", "system.types"] });
  const byName = name => index.find(e => e.name.toLowerCase() === String(name).trim().toLowerCase());
  // « Pré-évolution : Chenipan (7) · Évolutions : Papilusion (10) » → [{ name, condition }].
  const links = (text, label) => [...((text ?? "").split("·").find(p => p.includes(label)) ?? "").matchAll(/([^,:()]+?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)]
    .map(m => ({ name: m[1].trim(), condition: m[2].trim() }))
    // Une Méga-Évolution n'est pas un stade d'évolution (5.19.1).
    .filter(l => !/^m[ée]ga[- ]/i.test(l.name));
  // Niveau d'évolution = coût en XP Pokémon (« 16 », « niveau 16 », « lv 30 », « Niveau 35 »).
  const levelOf = condition => /^\s*(niveau|niv\.?|lvl?|lv\.?)?\s*\d+\s*$/i.test(condition ?? "") ? parseInt(condition.replace(/[^\d]/g, ""), 10) : 0;

  const text = pokemon.system.speciesData.evolutions;
  const suggested = links(text, "Évolutions").filter(l => byName(l.name));
  const defaultXP = suggested[0] ? levelOf(suggested[0].condition) : 0;

  // Lignée (4.14) : pré-évolutions de l'espèce, puis évolution suivante de la cible proposée.
  const chain = [pokemon.system.species || pokemon.name];
  let base = { name: chain[0], evolutions: text, types: pokemon.system.types };
  for ( let i = 0; i < 3; i++ ) {
    const pre = links(base.evolutions, "Pré-évolution")[0];
    const entry = pre ? byName(pre.name) : null;
    if ( !entry ) break;
    chain.unshift(entry.name);
    base = { name: entry.name, evolutions: entry.system?.speciesData?.evolutions, types: entry.system?.types };
  }
  const preCount = chain.length - 1;
  const next = suggested[0] ? byName(suggested[0].name) : null;
  const furtherEvolution = next ? links(next.system?.speciesData?.evolutions, "Évolutions").length > 0 : false;
  const stages = preCount + 2 + (furtherEvolution ? 1 : 0);
  const firstLevel = levelOf(links(base.evolutions, "Évolutions")[0]?.condition);
  const insect = [base.types?.primary, base.types?.secondary, pokemon.system.types.primary, pokemon.system.types.secondary].includes("insecte");
  let defaultCategory;
  if ( semiLegendaryRarity(chain[0]) || pokemon.system.semiLegendary ) defaultCategory = "semi";
  else if ( insect && firstLevel && (firstLevel <= 10) ) defaultCategory = stages >= 3 ? "insect3" : "insect2";
  else defaultCategory = stages >= 3 ? "classic3" : "classic2";
  const defaultStage = preCount === 0 ? "first" : "second";
  const lineage = [...chain, ...(next ? [next.name] : []), ...(furtherEvolution ? ["…"] : [])].join(" → ");

  const cats = Object.entries(EVOLUTION_CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === defaultCategory ? "selected" : ""}>${c.label}</option>`).join("");
  const values = await DialogV2.prompt({
    window: { title: `Évolution de ${pokemon.name}` },
    content: `
      <div class="form-group"><label>Évolue en</label><div class="form-fields">
        <input type="text" name="species" list="hk-evos" value="${suggested[0]?.name ?? ""}">
        <datalist id="hk-evos">${index.map(e => `<option value="${e.name}">`).join("")}</datalist></div></div>
      <p class="hint">${pokemon.system.speciesData.evolutions || "Aucune évolution connue."}</p>
      <div class="form-group"><label>Catégorie</label><div class="form-fields"><select name="category">${cats}</select></div></div>
      <div class="form-group"><label>Évolution</label><div class="form-fields"><select name="stage">
        <option value="first" ${defaultStage === "first" ? "selected" : ""}>1re évolution</option>
        <option value="second" ${defaultStage === "second" ? "selected" : ""}>2e évolution</option></select></div></div>
      <p class="hint">Lignée : ${lineage}. Catégorie et stade sont déduits de la lignée (Dressage requis, 4.14) ; modifiables si besoin.</p>
      <div class="form-group"><label>XP Pokémon dépensée</label><div class="form-fields"><input type="number" name="xp" value="${defaultXP}" min="0"></div>
        <p class="hint">Évolution par niveau : le niveau est le coût en XP Pokémon. 0 pour une pierre, un échange, le bonheur…</p></div>`,
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
  if ( xp && newbornLocked(pokemon) ) return;
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
  const talent = await chooseTalent(pokemon, t.speciesData.talents);
  return log(pokemon, `${old} évolue en ${target.name} !`,
    `Dressage ${pokemon.system.dressage} (requis ${required})${xp ? ` · −${xp} XP Pokémon` : ""}. IV, EV, Nature, relation et capacités sont conservés${talent ? ` ; Talent : ${talent}` : ""}.`);
}

/** Choix du Talent parmi ceux de la nouvelle espèce ; remplace le Talent actuel. */
async function chooseTalent(pokemon, talents) {
  if ( !talents?.length ) return null;
  const current = pokemon.itemTypes.talent.map(i => i.name);
  const options = talents.map((t, i) => `<label class="checkbox"><input type="radio" name="talent" value="${i}"
    ${current.includes(t.name) || (i === 0) ? "checked" : ""}> ${t.name}${t.hidden ? " (caché)" : ""}</label>`).join("");
  const index = await DialogV2.prompt({
    window: { title: "Talent après l'évolution" },
    content: `<p class="hint">Talent actuel : ${current.join(", ") || "aucun"}.</p>${options}`,
    ok: { label: "Choisir", callback: (e, b) => Number(b.form.querySelector("input[name=talent]:checked")?.value ?? 0) },
    rejectClose: false
  });
  if ( index === null ) return null;
  const chosen = talents[index];
  if ( current.includes(chosen.name) ) return chosen.name;
  const source = chosen.uuid ? await fromUuid(chosen.uuid) : null;
  await pokemon.deleteEmbeddedDocuments("Item", pokemon.itemTypes.talent.map(i => i.id));
  if ( source ) await pokemon.createEmbeddedDocuments("Item", [game.items.fromCompendium(source)]);
  return chosen.name;
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

/**
 * Talent de la forme Méga (5.19.1) : à l'activation, il remplace le Talent du Pokémon, gardé en mémoire ;
 * à la fin de la forme (manuelle ou au KO), le Talent d'origine revient.
 */
async function swapFormTalent(pokemon, active) {
  if ( active ) {
    const form = pokemon.system.form;
    let source = form.talentUuid ? await fromUuid(form.talentUuid) : null;
    // Talent saisi à la main : retrouvé par son nom dans le compendium des Talents.
    if ( !source && form.talent.trim() ) {
      const pack = game.packs.get("hakai-kousen.talents");
      const entry = pack ? [...await pack.getIndex()].find(e => e.name.toLowerCase() === form.talent.trim().toLowerCase()) : null;
      source = entry ? await pack.getDocument(entry._id) : null;
    }
    if ( !source ) return null;
    const original = pokemon.itemTypes.talent.map(t => t.toObject());
    await pokemon.setFlag("hakai-kousen", "baseTalents", original);
    await pokemon.deleteEmbeddedDocuments("Item", pokemon.itemTypes.talent.map(t => t.id));
    const data = game.items.fromCompendium(source);
    foundry.utils.setProperty(data, "flags.hakai-kousen.formTalent", true);
    await pokemon.createEmbeddedDocuments("Item", [data]);
    return source.name;
  }
  const original = pokemon.getFlag("hakai-kousen", "baseTalents");
  if ( !original ) return null;
  const formTalents = pokemon.itemTypes.talent.filter(t => t.getFlag("hakai-kousen", "formTalent"));
  await pokemon.deleteEmbeddedDocuments("Item", formTalents.map(t => t.id));
  await pokemon.createEmbeddedDocuments("Item", original.map(t => { delete t._id; return t; }));
  await pokemon.unsetFlag("hakai-kousen", "baseTalents");
  return original.map(t => t.name).join(", ");
}

/** Méga-Évolution : Dressage 18, gratuite ; la forme se termine au KO. */
export async function toggleMega(pokemon) {
  const form = pokemon.system.form;
  if ( form.active ) {
    await pokemon.update({ "system.form.active": false });
    const restored = await swapFormTalent(pokemon, false);
    return log(pokemon, `${pokemon.name} reprend sa forme normale`, restored ? `Talent d'origine : ${restored}.` : "");
  }
  const trainer = mechanicUnlocked(pokemon, "mega", "Méga-Évolution");
  if ( !trainer ) return;
  if ( pokemon.system.dressage < 18 ) return ui.notifications.warn(`Méga-Évolution : Dressage 18 requis (actuel : ${pokemon.system.dressage}).`);
  await pokemon.update({ "system.form.active": true });
  const talent = await swapFormTalent(pokemon, true);
  return log(pokemon, `${pokemon.name} méga-évolue !`,
    `${form.name || "Forme Méga"}${form.primary ? ` · ${[TYPES[form.primary], TYPES[form.secondary]].filter(Boolean).join(" / ")}` : ""}${talent ? ` · Talent : ${talent}` : ""}. Activation gratuite, sans consommer l'action. Fin au KO.`);
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
    `Type Téra : ${label}. Défensivement, ${tera.type === "stellaire" ? "il conserve ses types d'origine" : "seul le Type Téra compte"} ; il garde ses STAB d'origine et gagne celui du Type Téra (×2 s'il est identique à un type d'origine).`);
}

/**
 * Fin des formes temporaires : au KO, la Méga-Évolution et le Dynamax prennent fin (5.19) ;
 * en fin de combat, la Téracristallisation aussi.
 * @param {Actor} pokemon
 * @param {boolean} [endOfBattle]
 */
export async function resetBattleForms(pokemon, endOfBattle = false) {
  const update = {};
  const megaEnds = !!pokemon.system.form?.active;
  if ( megaEnds ) update["system.form.active"] = false;
  if ( endOfBattle && pokemon.system.tera?.active ) update["system.tera.active"] = false;
  if ( Object.keys(update).length ) await pokemon.update(update);
  if ( megaEnds ) await swapFormTalent(pokemon, false);
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
