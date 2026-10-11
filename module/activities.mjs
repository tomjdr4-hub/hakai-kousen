/**
 * Activités hors combat : Œufs et Élevage (7.3 à 7.8), Pêche (6.6), Minage (6.7), Centre Pokémon,
 * boutique et revente (8.2, 8.9), CT consommées (Annexe 5).
 */
import { BABY_SPECIES, CURABLE, NATURES } from "./config.mjs";
import { trainerOf } from "./combat/effects.mjs";
import { rollPool } from "./dice/rolls.mjs";

const { DialogV2 } = foundry.applications.api;
const SCOPE = "hakai-kousen";
const IV_STATS = ["dex", "for", "con", "end", "vol", "vit", "ene"];
const NATURE_ORDER = Object.keys(NATURES);

async function roll(formula) {
  return new foundry.dice.Roll(formula).evaluate();
}

async function card(actor, title, body, rolls = []) {
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="hk-card"><header><h3>${title}</h3></header>${body}</div>`,
    rolls
  });
}

async function pokedexIndex() {
  const pack = game.packs.get(`${SCOPE}.pokedex`);
  return pack ? [...await pack.getIndex()] : [];
}

/* -------------------------------------------- */
/*  Œufs (7.3 à 7.8)                            */
/* -------------------------------------------- */

/** Nouvel Œuf : espèce, origine (reproduction ciblée à 0 %, ou sauvage à 1D100 %), parents, niveau d'Élevage. */
export async function createEgg(trainer) {
  const index = await pokedexIndex();
  const pokemon = [...trainer.system.team, ...trainer.system.pc].map(u => fromUuidSync(u)).filter(Boolean);
  const parentOptions = pokemon.map(p => `<option value="${p.uuid}">${p.name}</option>`).join("");
  const zoology = trainer.system.knowledges.zoologie;
  const breeding = /élevage/i.test(zoology.spec) ? zoology.level : 0;
  const data = await DialogV2.prompt({
    window: { title: "Nouvel Œuf", icon: "fa-solid fa-egg" },
    content: `
      <div class="form-group"><label>Espèce (forme de base)</label><div class="form-fields">
        <input type="text" name="species" list="hk-egg-species" required>
        <datalist id="hk-egg-species">${index.map(e => `<option value="${e.name}">`).join("")}</datalist></div>
        <p class="hint">Lignée de la femelle ; avec Métamorph, l'autre parent (7.2).</p></div>
      <div class="form-group"><label>Origine</label><div class="form-fields"><select name="origin">
        <option value="bred">Reproduction ciblée (0 %)</option><option value="wild">Œuf sauvage (1D100 %)</option></select></div></div>
      <div class="form-group"><label>Parents</label><div class="form-fields">
        <select name="parentA"><option value="">—</option>${parentOptions}</select>
        <select name="parentB"><option value="">—</option>${parentOptions}</select></div></div>
      <div class="form-group"><label>Niveau d'Élevage</label><div class="form-fields"><input type="number" name="breeding" value="${breeding}" min="0" max="5"></div>
        <p class="hint">Transmissions maîtrisées (7.7). Par défaut, le niveau de Zoologie si la Spécialisation Élevage est notée.</p></div>`,
    ok: { label: "Créer l'Œuf", icon: "fa-solid fa-egg", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !data ) return;
  const entry = index.find(e => e.name.toLowerCase() === String(data.species).trim().toLowerCase());
  if ( !entry ) return ui.notifications.warn(`Espèce introuvable dans le Pokédex : ${data.species}`);
  let progress = 0;
  const rolls = [];
  if ( data.origin === "wild" ) {
    const r = await roll("1d100");
    rolls.push(r);
    progress = r.total;
  }
  const [egg] = await trainer.createEmbeddedDocuments("Item", [{
    name: `Œuf (${entry.name})`, type: "egg", img: "icons/consumables/eggs/egg-spotted-white.webp",
    system: {
      species: entry.name, speciesUuid: entry.uuid, progress, origin: data.origin,
      parents: data.origin === "bred" ? [data.parentA, data.parentB].filter(Boolean) : [], breeding: Number(data.breeding) || 0
    }
  }]);
  return card(trainer, `${trainer.name} reçoit un Œuf`, `<p>${data.origin === "wild"
    ? `Œuf sauvage : stade d'éclosion initial ${progress} % (1D100).` : "Reproduction ciblée : stade d'éclosion 0 %."}</p>`, rolls);
}

/** Un Pokémon de l'équipe possède Corps Ardent ou Armumagma (« Armurmagma » dans le livre) : progression garantie à +2D10 % (7.6). */
function hasIncubator(trainer) {
  return trainer.system.team.map(u => fromUuidSync(u)).filter(Boolean)
    .some(p => p.itemTypes.talent.some(t => /corps ardent|armu(r)?magma/i.test(t.name)));
}

/**
 * Une journée d'incubation : +1D10 % (normale), +2D10 % (favorable ou Corps Ardent / Armumagma).
 * @param {Item} egg
 * @param {"normal"|"favorable"} conditions
 */
export async function incubate(egg, conditions) {
  const trainer = egg.parent;
  const boosted = (conditions === "favorable") || hasIncubator(trainer);
  const r = await roll(boosted ? "2d10" : "1d10");
  const progress = Math.min(egg.system.progress + r.total, 100);
  await egg.update({ "system.progress": progress });
  const why = conditions === "favorable" ? "conditions favorables" : boosted ? "Corps Ardent / Armumagma" : "conditions normales";
  return card(trainer, `Incubation : ${egg.name}`,
    `<p>${why} : +${r.total} % → <strong>${progress} %</strong>${progress >= 100 ? " · prêt à éclore !" : ""}</p>`, [r]);
}

/** Transmission du Talent selon les Talents des parents (7.7). */
async function inheritTalent(talents, parents) {
  const normal = talents.filter(t => !t.hidden);
  const hidden = talents.find(t => t.hidden);
  const random = async list => list[(await roll(`1d${list.length}`)).total - 1];
  if ( !normal.length ) return hidden ?? null;
  if ( parents.length < 2 ) return random(normal);
  const names = parents.map(p => p.itemTypes.talent[0]?.name?.toLowerCase());
  const hasHidden = names.map(n => !!hidden && (n === hidden.name.toLowerCase()));
  const d10 = (await roll("1d10")).total;
  if ( hasHidden[0] && hasHidden[1] ) return (d10 >= 5) ? hidden : random(normal);
  if ( hasHidden[0] || hasHidden[1] ) return (d10 === 10) ? hidden : random(normal);
  const inherited = names.map(n => normal.find(t => t.name.toLowerCase() === n)).filter(Boolean);
  if ( inherited.length === 2 && inherited[0].name === inherited[1].name ) return inherited[0];
  if ( inherited.length === 2 ) return d10 <= 5 ? inherited[0] : inherited[1];
  return inherited[0] ?? random(normal);
}

/**
 * Transmissions maîtrisées selon le niveau d'Élevage (7.7) : attaques naturelles (nat), CT (ct), capacités Œuf (egg),
 * IV choisis parmi ceux des parents et Compétences (niveau 1 ; une Compétence Rare seulement sur un 10 au D10).
 */
const BREEDING = {
  0: { nat: 0, ivs: 0, skills: 0, text: "aucune transmission choisie" },
  1: { nat: 1, ivs: 0, skills: 0, text: "1 attaque naturelle" },
  2: { nat: 1, ivs: 1, skills: 0, text: "1 attaque naturelle + 1 IV" },
  3: { nat: 2, ivs: 2, skills: 1, either: true, text: "2 attaques naturelles OU 1 CT OU 1 capacité Œuf, + 2 IV + 1 Compétence" },
  4: { nat: 3, ivs: 3, skills: 1, ctOrEgg: true, text: "3 attaques naturelles + 1 CT OU 1 capacité Œuf, + 3 IV + 1 Compétence" },
  5: { nat: 3, ivs: 4, skills: 2, ct: 1, egg: 1, text: "3 attaques naturelles + 1 CT + 1 capacité Œuf, + 4 IV + 2 Compétences" }
};

/** Vérifie les transmissions choisies ; renvoie la règle enfreinte, ou null. */
function breedingError(rules, picks) {
  const nat = picks.nat.length;
  const ct = picks.ct.length;
  const egg = picks.egg.length;
  if ( rules.either ) {
    if ( [nat, ct, egg].filter(n => n > 0).length > 1 ) return "Élevage 3 : 2 attaques naturelles OU 1 CT OU 1 capacité Œuf, sans les mélanger.";
    if ( (nat > 2) || (ct > 1) || (egg > 1) ) return "Élevage 3 : au plus 2 attaques naturelles, ou 1 CT, ou 1 capacité Œuf.";
  }
  else {
    if ( nat > rules.nat ) return `Au plus ${rules.nat} attaque(s) naturelle(s).`;
    if ( rules.ctOrEgg && ((ct + egg) > 1) ) return "Élevage 4 : 1 CT OU 1 capacité Œuf.";
    if ( !rules.ctOrEgg && (ct > (rules.ct ?? 0)) ) return rules.ct ? `Au plus ${rules.ct} CT.` : "Aucune CT à ce niveau d'Élevage.";
    if ( !rules.ctOrEgg && (egg > (rules.egg ?? 0)) ) return rules.egg ? `Au plus ${rules.egg} capacité Œuf.` : "Aucune capacité Œuf à ce niveau d'Élevage.";
  }
  if ( picks.ivs.length > rules.ivs ) return `Au plus ${rules.ivs} IV transmis.`;
  if ( picks.skills.length > rules.skills ) return `Au plus ${rules.skills} Compétence(s) transmise(s).`;
  return null;
}

/**
 * Éclosion : nouveau Pokémon de la forme de base, Nature au D100 (ou Pierre Stase), Talent et transmissions des parents,
 * Nouveau-né (÷2 jusqu'à 100 XP) sauf espèce Bébé, Confiance 4 + Obéissance 4 envers celui qui s'est occupé de l'Œuf.
 * @param {Item} egg
 */
export async function hatch(egg) {
  const trainer = egg.parent;
  if ( egg.system.progress < 100 ) return ui.notifications.warn(`L'Œuf n'est qu'à ${egg.system.progress} %.`);
  const source = await fromUuid(egg.system.speciesUuid);
  if ( !source ) return ui.notifications.warn(`Espèce introuvable : ${egg.system.species}`);
  const parents = (await Promise.all(egg.system.parents.map(u => fromUuid(u)))).filter(Boolean);
  const level = Math.clamp(egg.system.breeding, 0, 5);
  const rules = BREEDING[level];

  // Attaques des parents, classées selon la façon dont le nouveau-né peut les apprendre.
  const learnset = source.system.speciesData.learnset;
  const names = kind => new Set(learnset.filter(e => e.source === kind).map(e => e.name.toLowerCase()));
  const natural = names("level");
  const tm = names("ct");
  const eggMoves = names("egg");
  const already = new Set(source.items.map(i => i.name.toLowerCase()));
  const parentAttacks = [...new Map(parents.flatMap(p => p.itemTypes.attack).map(a => [a.name.toLowerCase(), a])).values()]
    .filter(a => !already.has(a.name.toLowerCase()));
  const groups = {
    nat: parentAttacks.filter(a => natural.has(a.name.toLowerCase())),
    ct: parentAttacks.filter(a => !natural.has(a.name.toLowerCase()) && tm.has(a.name.toLowerCase())),
    egg: parentAttacks.filter(a => !natural.has(a.name.toLowerCase()) && !tm.has(a.name.toLowerCase()) && eggMoves.has(a.name.toLowerCase()))
  };
  const parentSkills = [...new Map(parents.flatMap(p => p.itemTypes.pokeskill).map(s => [s.name.toLowerCase(), s])).values()];
  const bestIV = Object.fromEntries(IV_STATS.map(k => [k, Math.max(0, ...parents.map(p => p.system.stats[k].iv))]));
  const ivChoices = IV_STATS.filter(k => bestIV[k] > 0).sort((a, b) => bestIV[b] - bestIV[a]);
  const stase = parents.filter(p => p.itemTypes.gear.some(i => /pierre stase/i.test(i.name)));

  // Choix des transmissions, recommencé tant qu'une limite du niveau d'Élevage est dépassée.
  const box = (name, value, label, checked) => `<label class="checkbox"><input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""}> ${label}</label>`;
  // Groupe affiché si le niveau d'Élevage l'autorise ; « preset » cases pré-cochées, sans enfreindre le « OU » des niveaux 3 et 4.
  const fieldset = (legend, name, list, label, allowed, preset) => list.length && allowed
    ? `<fieldset><legend>${legend}</legend>${list.map((x, i) => box(name, i, label(x), i < preset)).join("")}</fieldset>` : "";
  const ctAllowed = rules.either || rules.ctOrEgg || !!rules.ct;
  const eggAllowed = rules.either || rules.ctOrEgg || !!rules.egg;
  const content = `
    <p><strong>Élevage ${level}</strong> : ${rules.text} (7.7).</p>
    ${parents.length ? "" : `<p class="hint">Aucun parent connu (Œuf sauvage) : pas de transmission ; ses caractéristiques sont déjà déterminées (7.3).</p>`}
    ${parents.length ? [
      fieldset("Attaques naturelles des parents", "nat", groups.nat, a => a.name, rules.nat, rules.nat),
      fieldset("CT connues des parents", "ct", groups.ct, a => a.name, ctAllowed, (rules.ct || rules.ctOrEgg) ? 1 : 0),
      fieldset("Capacités Œuf des parents", "egg", groups.egg, a => a.name, eggAllowed, rules.egg ? 1 : 0),
      fieldset("IV des parents", "iv", ivChoices, k => `${k.toUpperCase()} ${bestIV[k]}`, rules.ivs, rules.ivs),
      fieldset("Compétences des parents (niveau 1 ; Rare : seulement sur un 10)", "skill", parentSkills,
        s => `${s.name}${s.system.category === "rare" ? " (Rare)" : ""}`, rules.skills, rules.skills)
    ].join("") : ""}
    ${stase.length ? `<p class="hint">Pierre Stase : ${stase.length === 2 ? "les deux parents en portent une, 1D10 décide (1-5 : premier parent, 6-10 : second)" : `${stase[0].name} transmet sa Nature`}.</p>` : ""}
    <div class="form-group"><label>IV supplémentaires</label><div class="form-fields"><input type="number" name="extraIV" value="0" min="0"></div>
      <p class="hint">Les IV non transmis sont déterminés normalement (7.7) : nombre d'IV répartis au hasard, au choix du MJ.</p></div>`;
  let picks;
  for ( ;; ) {
    const form = await DialogV2.prompt({
      window: { title: `Éclosion : ${source.name}`, icon: "fa-solid fa-egg" },
      position: { width: 480 },
      content,
      ok: {
        label: "Faire éclore",
        icon: "fa-solid fa-egg",
        callback: (e, b) => {
          const checked = name => [...b.form.querySelectorAll(`input[name=${name}]:checked`)].map(i => Number(i.value));
          return { nat: checked("nat"), ct: checked("ct"), egg: checked("egg"), ivs: checked("iv"), skills: checked("skill"),
            extraIV: Math.max(Number(b.form.elements.extraIV.value) || 0, 0) };
        }
      },
      rejectClose: false
    });
    if ( !form ) return;
    const error = parents.length ? breedingError(rules, form) : null;
    if ( !error ) {
      picks = form;
      break;
    }
    ui.notifications.warn(error);
  }

  const rolls = [];
  const data = game.actors.fromCompendium(source);
  const system = data.system;

  // Nature : Pierre Stase d'un parent, sinon D100 (chaque Nature occupe quatre résultats).
  let natureText;
  if ( stase.length === 1 ) {
    system.nature = stase[0].system.nature;
    natureText = `Pierre Stase de ${stase[0].name}`;
  }
  else if ( stase.length === 2 ) {
    const r = await roll("1d10");
    rolls.push(r);
    const parent = r.total <= 5 ? stase[0] : stase[1];
    system.nature = parent.system.nature;
    natureText = `Pierre Stase, 1D10 = ${r.total} : ${parent.name}`;
  }
  else {
    const r = await roll("1d100");
    rolls.push(r);
    system.nature = NATURE_ORDER[Math.floor((r.total - 1) / 4)];
    natureText = `1D100 = ${r.total}`;
  }

  // IV transmis, puis IV supplémentaires répartis au hasard.
  const ivKeys = picks.ivs.map(i => ivChoices[i]);
  for ( const k of ivKeys ) system.stats[k].iv = bestIV[k];
  for ( let i = 0; i < picks.extraIV; i++ ) system.stats[IV_STATS[(await roll(`1d${IV_STATS.length}`)).total - 1]].iv += 1;

  const talent = await inheritTalent(system.speciesData.talents, parents);
  const items = data.items ?? [];
  if ( talent?.uuid ) {
    const t = await fromUuid(talent.uuid);
    if ( t ) items.push(game.items.fromCompendium(t));
  }
  const attacks = [...picks.nat.map(i => groups.nat[i]), ...picks.ct.map(i => groups.ct[i]), ...picks.egg.map(i => groups.egg[i])];
  for ( const attack of attacks ) items.push(game.items.fromCompendium(attack));
  // Compétences : niveau 1 ; une Compétence Rare n'est transmise que sur un 10 naturel au D10.
  const skillLines = [];
  for ( const skill of picks.skills.map(i => parentSkills[i]) ) {
    if ( skill.system.category === "rare" ) {
      const r = await roll("1d10");
      rolls.push(r);
      if ( r.total !== 10 ) {
        skillLines.push(`${skill.name} (Rare) : 1D10 = ${r.total}, non transmise`);
        continue;
      }
      skillLines.push(`${skill.name} (Rare) : 10, transmise`);
    }
    else skillLines.push(skill.name);
    const skillData = game.items.fromCompendium(skill);
    foundry.utils.mergeObject(skillData, { system: { level: 1, progress: 0 } });
    items.push(skillData);
  }
  data.items = items;
  const baby = BABY_SPECIES.includes(source.name.toLowerCase());
  system.baby = !baby;
  system.relation = { confidence: 4, obedience: 4 };
  system.details.trainer = trainer.name;
  const vitMax = system.stats.vit.base + (system.stats.vit.iv * 2);
  const eneMax = system.stats.ene.base + (system.stats.ene.iv * 3);
  system.vit = { value: vitMax, max: vitMax };
  system.ene = { value: eneMax, max: eneMax };
  data.folder = trainer.folder?.id ?? null;
  data.ownership = foundry.utils.deepClone(trainer.ownership);
  data.prototypeToken = { ...data.prototypeToken, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY };
  const [pokemon] = await Actor.implementation.createDocuments([data]);

  const inTeam = trainer.system.team.length < 6;
  await trainer.update(inTeam ? { "system.team": [...trainer.system.team, pokemon.uuid] } : { "system.pc": [...trainer.system.pc, pokemon.uuid] });
  await egg.delete();
  const transmitted = [
    attacks.length ? `attaques : ${attacks.map(a => a.name).join(", ")}` : "",
    ivKeys.length ? `IV : ${ivKeys.map(k => `${k.toUpperCase()} ${bestIV[k]}`).join(", ")}` : "",
    skillLines.length ? `Compétences : ${skillLines.join(", ")}` : ""
  ].filter(Boolean);
  return card(trainer, `L'Œuf éclot : ${pokemon.name} !`, `
    <p>${NATURES[system.nature].label} (${natureText})${talent ? ` · ${talent.name}` : ""}.</p>
    ${transmitted.length ? `<p class="hk-detail">Transmissions (Élevage ${level}) : ${transmitted.join(" · ")}.</p>` : ""}
    ${picks.extraIV ? `<p class="hk-detail">${picks.extraIV} IV supplémentaire(s) réparti(s) au hasard.</p>` : ""}
    <p class="hk-detail">${baby ? "Bébé Pokémon : fiche normale." : "Nouveau-né : caractéristiques et VIT ÷2 jusqu'à 100 XP Pokémon."}
      ${trainer.name} est sa figure parentale : Confiance 4, Obéissance 4. Rangé ${inTeam ? "dans l'équipe" : "dans la Boîte PC"}.</p>`, rolls);
}

/* -------------------------------------------- */
/*  Vocation et revenus (MJ 6.9, 6.10)          */
/* -------------------------------------------- */

/** Activités professionnelles : durée indicative et gain brut conseillé (MJ 6.9). */
const WORK = {
  service: { label: "Petit service (quelques heures)", min: 100, max: 300 },
  day: { label: "Journée ordinaire", min: 300, max: 600 },
  specialist: { label: "Intervention spécialisée (une journée)", min: 600, max: 1000 },
  contract: { label: "Contrat important (plusieurs jours)", min: 1000, max: 3000 }
};

/** Type d'activité proposé sur 1D20 (MJ 6.10). */
const WORK_TYPES = [
  [5, "Travail courant et relativement sûr."], [10, "Contrat ordinaire avec difficulté."],
  [14, "Occasion avantageuse ou client important."], [17, "Complication ou demande inhabituelle."],
  [19, "Proposition risquée ou douteuse."], [20, "Occasion exceptionnelle ou aventure."]
];

/**
 * Travailler selon sa Vocation : type d'activité (1D20), test du domaine utilisé si l'issue est incertaine,
 * puis gain brut moins les frais, ajouté à l'argent du Dresseur. Aucun revenu automatique : le montant est validé.
 * @param {Actor} trainer
 */
export async function work(trainer) {
  const { SKILLS, KNOWLEDGES } = CONFIG.HK;
  const domain = (group, labels) => Object.entries(labels).map(([k, label]) => {
    const d = trainer.system[group][k];
    return `<option value="${group}.${k}">${label} (niv. ${d.level}${d.spec ? `, ${d.spec}` : ""})</option>`;
  }).join("");
  const data = await DialogV2.prompt({
    window: { title: `Travailler : ${trainer.name}`, icon: "fa-solid fa-briefcase" },
    position: { width: 480 },
    content: `
      <p>Vocation : <strong>${trainer.system.details.vocation || "non renseignée"}</strong>. Une Vocation ne produit pas de salaire automatique :
        il faut du temps, une activité, les compétences, le matériel et parfois une autorisation (MJ 6.9).</p>
      <div class="form-group"><label>Activité</label><div class="form-fields"><select name="duration">
        ${Object.entries(WORK).map(([k, w]) => `<option value="${k}" ${k === "day" ? "selected" : ""}>${w.label} : ${w.min}–${w.max} ₽</option>`).join("")}
      </select></div></div>
      <label class="checkbox"><input type="checkbox" name="drawType" checked> Tirer le type d'activité proposé (1D20, MJ 6.10)</label>
      <div class="form-group"><label>Test</label><div class="form-fields"><select name="domain">
        <option value="">Aucun test (issue certaine)</option>
        <optgroup label="Compétences">${domain("skills", SKILLS)}</optgroup>
        <optgroup label="Connaissances">${domain("knowledges", KNOWLEDGES)}</optgroup>
      </select></div></div>
      <p class="hint">Un test seulement s'il y a une vraie incertitude (MJ 6.6). Échec : résultat incomplet ou coût ; réussite nette : qualité, économie ou contact, pas un salaire doublé.</p>`,
    ok: { label: "Commencer", icon: "fa-solid fa-briefcase", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !data ) return;
  const job = WORK[data.duration] ?? WORK.day;
  let type = "";
  if ( data.drawType ) {
    const r = await roll("1d20");
    type = `1D20 = ${r.total} : ${WORK_TYPES.find(([max]) => r.total <= max)[1]}`;
    await card(trainer, `${trainer.name} cherche du travail`, `<p class="hk-detail">${job.label}</p><p>${type}</p>`, [r]);
  }

  // Test du domaine utilisé : la carte de jet indique la réussite.
  let result = null;
  if ( data.domain ) {
    const [group, key] = data.domain.split(".");
    const d = trainer.system[group][key];
    const message = await rollPool(trainer, (group === "skills" ? SKILLS : KNOWLEDGES)[key], d.level, d.spec);
    if ( !message ) return;
    const total = message.rolls[0]?.total ?? 0;
    const threshold = message.getFlag("hakai-kousen", "dice")?.[0]?.threshold;
    result = total === 1 ? "critical" : (threshold ? (total >= threshold ? "success" : "failure") : "unknown");
  }

  const middle = Math.round(((job.min + job.max) / 2) / 50) * 50;
  const advice = {
    failure: "Échec : résultat incomplet, délai ou coût (le gain peut être réduit ou nul).",
    critical: "Échec critique : complication en plus (MJ 6.11).",
    success: "Réussite : le paiement est obtenu.",
    unknown: "Le MJ juge le résultat du test."
  }[result] ?? "Issue certaine : le paiement est obtenu.";
  const failed = ["failure", "critical"].includes(result);
  const pay = await DialogV2.prompt({
    window: { title: "Paiement", icon: "fa-solid fa-coins" },
    content: `<p>${advice}</p>
      <div class="form-group"><label>Gain brut (₽)</label><div class="form-fields"><input type="number" name="gross" value="${failed ? 0 : middle}" min="0" step="50"></div>
        <p class="hint">Conseillé : ${job.min} à ${job.max} ₽ selon difficulté, responsabilité, réputation, urgence et client.</p></div>
      <div class="form-group"><label>Frais (₽)</label><div class="form-fields"><input type="number" name="costs" value="0" min="0" step="50"></div>
        <p class="hint">Matériaux, transports, réparations, commissions.</p></div>`,
    ok: {
      label: "Encaisser",
      icon: "fa-solid fa-coins",
      callback: (e, b) => ({
        gross: Math.max(Number(b.form.elements.gross.value) || 0, 0),
        costs: Math.max(Number(b.form.elements.costs.value) || 0, 0)
      })
    },
    rejectClose: false
  });
  if ( !pay ) return;
  const net = pay.gross - pay.costs;
  const money = Math.max(trainer.system.money + net, 0);
  await trainer.update({ "system.money": money });
  return card(trainer, `${trainer.name} travaille`, `
    <p class="hk-detail">${job.label}${type ? ` · ${type}` : ""}</p>
    <p>Gain brut ${pay.gross} ₽ − frais ${pay.costs} ₽ = <strong>${net >= 0 ? "+" : ""}${net} ₽</strong> (argent : ${money} ₽).</p>`);
}

/* -------------------------------------------- */
/*  Pension de la Boîte PC (7.1, 8.9)           */
/* -------------------------------------------- */

/**
 * Quand le temps du monde avance d'un ou plusieurs jours, chaque Dresseur paie la pension de sa Boîte PC :
 * 50 ₽ par Pokémon et par jour. Exécuté par le MJ actif.
 * @param {number} worldTime
 * @param {number} delta
 */
export async function chargePension(worldTime, delta) {
  if ( !game.user.isActiveGM || !game.settings.get("hakai-kousen", "pension") || !(delta > 0) ) return;
  const days = Math.floor(worldTime / 86400) - Math.floor((worldTime - delta) / 86400);
  if ( days <= 0 ) return;
  const lines = [];
  for ( const trainer of game.actors.filter(a => (a.type === "trainer") && a.system.pc.length) ) {
    const due = trainer.system.pc.length * 50 * days;
    const paid = Math.min(due, trainer.system.money);
    await trainer.update({ "system.money": trainer.system.money - paid });
    lines.push(`${trainer.name} : ${trainer.system.pc.length} Pokémon × ${days} jour(s) = ${due} ₽`
      + `${paid < due ? ` — <strong>impayé : ${due - paid} ₽</strong>` : ""}`);
  }
  if ( !lines.length ) return;
  return ChatMessage.implementation.create({
    speaker: { alias: "Boîte PC" },
    content: `<div class="hk-card"><header><h3>Pension de la Boîte PC</h3><span class="subtitle">50 ₽ par Pokémon et par jour</span></header>
      ${lines.map(l => `<p class="hk-detail">${l}</p>`).join("")}</div>`
  });
}

/* -------------------------------------------- */
/*  Objets tenus (8.7)                          */
/* -------------------------------------------- */

/** Ajoute un objet à l'inventaire du Dresseur, regroupé avec un objet du même nom. */
async function addToInventory(trainer, data, quantity) {
  const same = trainer.itemTypes.gear.find(i => i.name === data.name);
  if ( same ) return same.update({ "system.quantity": same.system.quantity + quantity });
  const copy = foundry.utils.deepClone(data);
  delete copy._id;
  foundry.utils.setProperty(copy, "system.quantity", quantity);
  return trainer.createEmbeddedDocuments("Item", [copy]);
}

/**
 * Donne un objet de l'inventaire à un Pokémon de l'équipe, qui le tient (un seul objet tenu à la fois, 8.7).
 * Si le Pokémon tient déjà un objet, il est rendu au Dresseur (échange).
 * @param {Actor} trainer
 * @param {Item} item
 */
export async function giveToPokemon(trainer, item) {
  const team = trainer.system.team.map(u => fromUuidSync(u)).filter(p => p?.isOwner);
  if ( !team.length ) return ui.notifications.warn("Aucun Pokémon de l'équipe à qui donner cet objet.");
  const options = team.map((p, i) => {
    const held = p.itemTypes.gear.find(g => g.system.quantity > 0);
    return `<label class="checkbox"><input type="radio" name="pokemon" value="${i}" ${i === 0 ? "checked" : ""}> ${p.name}
      <span class="hint">${held ? `tient ${held.name} (échange)` : "emplacement libre"}</span></label>`;
  }).join("");
  const index = await DialogV2.prompt({
    window: { title: `Donner ${item.name}`, icon: "fa-solid fa-hand-holding" },
    content: `<p class="hint">Le Pokémon tient l'objet (une unité). Un objet déjà tenu est rendu au Dresseur.</p><fieldset>${options}</fieldset>`,
    ok: { label: "Donner", icon: "fa-solid fa-hand-holding", callback: (e, b) => Number(b.form.querySelector("input[name=pokemon]:checked")?.value ?? 0) },
    rejectClose: false
  });
  if ( (index === null) || (index === undefined) ) return;
  const pokemon = team[index];
  const lines = [];
  for ( const held of pokemon.itemTypes.gear ) {
    if ( held.system.quantity > 0 ) {
      await addToInventory(trainer, held.toObject(), held.system.quantity);
      lines.push(`${held.name} revient dans l'inventaire de ${trainer.name}.`);
    }
    await held.delete();
  }
  const data = item.toObject();
  delete data._id;
  data.system.quantity = 1;
  await pokemon.createEmbeddedDocuments("Item", [data]);
  if ( item.system.quantity > 1 ) await item.update({ "system.quantity": item.system.quantity - 1 });
  else await item.delete();
  return card(trainer, `${pokemon.name} tient ${data.name}`, lines.length ? `<p class="hk-detail">${lines.join(" ")}</p>` : "");
}

/** Rend l'objet tenu d'un Pokémon à son Dresseur. */
export async function returnHeld(pokemon, item) {
  const trainer = trainerOf(pokemon);
  if ( !trainer?.isOwner ) return ui.notifications.warn("Ce Pokémon n'est dans l'équipe d'aucun de vos Dresseurs.");
  if ( item.system.quantity > 0 ) await addToInventory(trainer, item.toObject(), item.system.quantity);
  await item.delete();
  ui.notifications.info(`${item.name} revient dans l'inventaire de ${trainer.name}.`);
}

/* -------------------------------------------- */
/*  Pêche et Minage (6.6, 6.7)                  */
/* -------------------------------------------- */

/** Dés de difficulté d'un test de Caractéristique, du plus facile au plus difficile. */
const DIE_LADDER = [4, 6, 8, 10, 12, 20];

/**
 * Pêche (6.6) : deux actions distinctes, présentées dans la même fenêtre.
 * 1. Trouver un coin et faire mordre : jet de la Compétence Pêche (réserve de D10).
 * 2. Ramener la prise : test de FOR ; la difficulté choisie par le MJ (taille du dé) est réduite
 *    d'un cran par niveau de Pêche au-delà du premier et par la canne (Super −1, Méga −2), jusqu'au D4.
 */
export async function fish(trainer) {
  const rods = trainer.itemTypes.gear.filter(i => /canne/i.test(i.name) && (i.system.quantity > 0));
  const { level, spec } = trainer.system.skills.peche;
  const strength = trainer.system.attributes.for.value;
  const rodBonus = rod => /m[ée]ga/i.test(rod) ? 2 : /super/i.test(rod) ? 1 : 0;
  const pool = level > 0 ? `${level}D10, meilleur résultat` : "2D10, moins bon résultat";
  const result = await DialogV2.wait({
    window: { title: `Pêche : ${trainer.name}`, icon: "fa-solid fa-fish" },
    position: { width: 500 },
    content: `
      <fieldset class="hk-fish-step"><legend>1. Trouver un coin et faire mordre</legend>
        <p>Jet de la <strong>Compétence Pêche</strong> (niveau ${level}${spec ? `, ${spec}` : ""} : ${pool}).
        Savoir-faire du pêcheur : repérer un bon coin, choisir l'appât, connaître ce qui vit ici, attirer une prise.</p>
        <p class="hint">Si ça mord, le MJ détermine l'espèce (table de zone aquatique avec le bouton Rencontre, ou Pokémon sauvages).
        La Compétence Pêche n'augmente pas la rareté des Pokémon rencontrés.</p>
      </fieldset>
      <fieldset class="hk-fish-step"><legend>2. Ramener la prise</legend>
        <p>Test de <strong>Force</strong> : 1D(difficulté) ≤ FOR ${strength}. Effort physique pour sortir la prise de l'eau.</p>
        <div class="form-group"><label>Difficulté de la prise</label><div class="form-fields"><select name="die">
          ${[6, 8, 10, 12, 20].map(d => `<option value="${d}">D${d}</option>`).join("")}</select></div></div>
        <div class="form-group"><label>Canne</label><div class="form-fields"><select name="rod">
          <option value="">Aucune</option>${rods.map(r => `<option value="${r.name}">${r.name}</option>`).join("")}</select></div></div>
        <p class="hint">Le dé diminue d'un cran par niveau de Pêche au-delà du premier (−${Math.max(level - 1, 0)} ici),
        d'un cran avec une Super Canne et de deux avec une Méga Canne. Un autre personnage ou un Pokémon assez puissant
        peut aider : le MJ baisse alors la difficulté.</p>
      </fieldset>`,
    buttons: [
      { action: "bite", label: "1. Faire mordre", icon: "fa-solid fa-dice-d10", default: true },
      { action: "reel", label: "2. Ramener la prise", icon: "fa-solid fa-dice-d6",
        callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }
    ],
    rejectClose: false
  });
  if ( !result ) return;
  if ( result === "bite" ) return rollPool(trainer, "Pêche : faire mordre", level, spec);

  const reduction = Math.max(level - 1, 0) + rodBonus(result.rod ?? "");
  const start = DIE_LADDER.indexOf(Number(result.die));
  const die = DIE_LADDER[Math.max(start - reduction, 0)];
  const r = await roll(`1d${die}`);
  const success = r.total <= strength;
  return card(trainer, `${trainer.name} ramène la prise`, `
    <p class="hk-detail">Difficulté D${result.die} − ${reduction} → D${die} · 1D${die} ≤ FOR ${strength} → ${r.total}</p>
    <div class="hk-outcome ${success ? "success" : "failure"}">${success ? "La prise est ramenée !" : "La prise s'échappe"}</div>`, [r]);
}

const MINING = [
  [10, "Gravats ou roche sans valeur notable"], [20, "Minerais communs"], [30, "Quartz, petits cristaux ou minéraux décoratifs"],
  [40, "Minerais métalliques exploitables"], [50, "Minerais ou cristaux de bonne qualité"], [60, "Matériaux recherchés par certains artisans"],
  [69, "Fragment de gemme ou matériau particulièrement intéressant"], [79, "Pierre précieuse"], [89, "Pierre évolutive brute à raffiner"],
  [100, "Fossile"]
];
const MINING_LEVELS = { 1: ["1d100", 1], 2: ["1d100", 11], 3: ["2d100kh", 1], 4: ["2d100kh", 21], 5: ["3d100kh", 31] };

/** Minage : une demi-journée, une seule trouvaille ; le niveau améliore le jet (6.7). */
export async function mine(trainer) {
  const level = trainer.system.skills.minage.level;
  if ( level < 1 ) return ui.notifications.warn("Minage niveau 0 : la Compétence doit être ouverte pour prospecter.");
  const [formula, min] = MINING_LEVELS[Math.min(level, 5)];
  const r = await roll(formula);
  const result = Math.max(r.total, min);
  const find = MINING.find(([max]) => result <= max)[1];
  const hasKit = trainer.itemTypes.gear.some(i => /explorakit|pioche/i.test(i.name));
  return card(trainer, `${trainer.name} prospecte (une demi-journée)`, `
    <p class="hk-detail">Minage ${level} : ${formula.replace("kh", ", garder le meilleur")}${min > 1 ? `, minimum ${min}` : ""} → ${result}</p>
    <div class="hk-outcome success">${find}</div>
    ${hasKit ? "" : `<p class="hint">Sans matériel adapté (Explorakit…), le MJ peut refuser ou compliquer l'extraction.</p>`}
    <p class="hint">Les résultats 1 à 69 n'ont pas de valeur monétaire universelle.</p>`, [r]);
}

/* -------------------------------------------- */
/*  Centre Pokémon, boutique et revente (8.2, 8.9) */
/* -------------------------------------------- */

/** Centre Pokémon : soins complets de l'équipe pour 50 ₽ par Pokémon ; une blessure grave demande un traitement à part. */
export async function pokemonCenter(trainer) {
  const team = trainer.system.team.map(u => fromUuidSync(u)).filter(Boolean);
  if ( !team.length ) return ui.notifications.warn("Aucun Pokémon dans l'équipe.");
  // Une blessure grave relève d'un traitement à part (prix et durée selon le MJ) : ces Pokémon ne sont ni soignés ni facturés ici.
  const wounded = team.filter(p => p.statuses.has("blessure")).map(p => p.name);
  const treated = team.filter(p => !p.statuses.has("blessure"));
  if ( !treated.length ) return ui.notifications.warn(`Blessure grave : ${wounded.join(", ")} demande un traitement à part, au prix fixé par le MJ.`);
  const cost = treated.length * 50;
  if ( trainer.system.money < cost ) return ui.notifications.warn(`Soins : ${cost} ₽ (disponible : ${trainer.system.money} ₽).`);
  const ok = await DialogV2.confirm({ window: { title: "Centre Pokémon" },
    content: `<p>Soigner ${treated.length} Pokémon pour <strong>${cost} ₽</strong> (50 ₽ par Pokémon) ?</p>
      ${wounded.length ? `<p class="hint">Blessure grave, non comprise (traitement plus long et plus cher, selon le MJ) : ${wounded.join(", ")}.</p>` : ""}`,
    rejectClose: false });
  if ( !ok ) return;
  for ( const p of treated ) {
    await p.fullHeal();
    for ( const id of [...CURABLE, "dead", "attraction", "vampigraine", "malediction", "peur"] ) {
      if ( p.statuses.has(id) ) await p.toggleStatusEffect(id, { active: false });
    }
    await p.update({ "system.conditions.toxik": 0, "system.conditions.confusion": 0, "system.conditions.sommeil": 0 });
  }
  await trainer.update({ "system.money": trainer.system.money - cost });
  return card(trainer, "Centre Pokémon", `<p>Équipe soignée : VIT, ENE et altérations (−${cost} ₽).</p>
    ${wounded.length ? `<p class="hk-detail">Blessure grave (traitement plus long et plus cher, selon le MJ) : ${wounded.join(", ")}.</p>` : ""}`);
}

/** Boutique : achat d'un objet du compendium à son prix de référence (disponibilité selon le MJ). */
export async function shop(trainer) {
  const pack = game.packs.get(`${SCOPE}.objets`);
  if ( !pack ) return;
  const index = [...await pack.getIndex({ fields: ["system.price", "system.category"] })].filter(e => e.type === "gear" && e.system?.price > 0);
  const data = await DialogV2.prompt({
    window: { title: "Boutique", icon: "fa-solid fa-store" },
    content: `
      <div class="form-group"><label>Objet</label><div class="form-fields"><input type="text" name="item" list="hk-shop" required>
        <datalist id="hk-shop">${index.map(e => `<option value="${e.name}">${e.system.price} ₽</option>`).join("")}</datalist></div></div>
      <div class="form-group"><label>Quantité</label><div class="form-fields"><input type="number" name="quantity" value="1" min="1"></div></div>
      <p class="hint">Argent : ${trainer.system.money} ₽. Les prix sont des références : la disponibilité dépend de la ville et du MJ (8.2).</p>`,
    ok: { label: "Acheter", icon: "fa-solid fa-cart-shopping", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !data ) return;
  const entry = index.find(e => e.name.toLowerCase() === String(data.item).trim().toLowerCase());
  if ( !entry ) return ui.notifications.warn(`Objet introuvable : ${data.item}`);
  const quantity = Math.max(Number(data.quantity) || 1, 1);
  const cost = entry.system.price * quantity;
  if ( trainer.system.money < cost ) return ui.notifications.warn(`${quantity} × ${entry.name} : ${cost} ₽ (disponible : ${trainer.system.money} ₽).`);
  const owned = trainer.itemTypes.gear.find(i => i.name === entry.name);
  if ( owned ) await owned.update({ "system.quantity": owned.system.quantity + quantity });
  else {
    const doc = await pack.getDocument(entry._id);
    const itemData = game.items.fromCompendium(doc);
    itemData.system.quantity = quantity;
    await trainer.createEmbeddedDocuments("Item", [itemData]);
  }
  await trainer.update({ "system.money": trainer.system.money - cost });
  return card(trainer, `${trainer.name} achète ${quantity} × ${entry.name}`, `<p>−${cost} ₽.</p>`);
}

/** Revente : 50 % du prix d'achat ; CT selon la variante choisie par le MJ (8.2). */
export async function sell(trainer, item) {
  if ( !item.system.price ) return ui.notifications.warn(`${item.name} n'a pas de prix de référence : le MJ fixe la valeur.`);
  if ( (item.system.category === "ct") && !game.settings.get(SCOPE, "ctResale") ) {
    return ui.notifications.warn("Variante « CT non revendables » : les commerces ordinaires ne rachètent pas les CT.");
  }
  const unit = Math.floor(item.system.price / 2);
  const quantity = await DialogV2.prompt({
    window: { title: `Revendre ${item.name}` },
    content: `<div class="form-group"><label>Quantité (max ${item.system.quantity})</label><div class="form-fields">
      <input type="number" name="q" value="1" min="1" max="${item.system.quantity}"></div></div>
      <p class="hint">${unit} ₽ l'unité (50 % du prix). Un marchand peut proposer moins.</p>`,
    ok: { label: "Vendre", callback: (e, b) => Math.clamp(Number(b.form.elements.q.value) || 1, 1, item.system.quantity) },
    rejectClose: false
  });
  if ( !quantity ) return;
  await trainer.update({ "system.money": trainer.system.money + (unit * quantity) });
  if ( quantity >= item.system.quantity ) await item.delete();
  else await item.update({ "system.quantity": item.system.quantity - quantity });
  return card(trainer, `${trainer.name} revend ${quantity} × ${item.name}`, `<p>+${unit * quantity} ₽.</p>`);
}

/* -------------------------------------------- */
/*  CT (Annexe 5)                               */
/* -------------------------------------------- */

/**
 * Apprentissage par CT : la CT correspondante est retirée de l'inventaire du Dresseur.
 * Sans CT, seul le MJ peut ajouter l'attaque. Renvoie true si l'apprentissage peut continuer.
 */
export async function consumeTM(pokemon, attackName) {
  const trainer = trainerOf(pokemon);
  const tm = trainer?.itemTypes.gear.find(i => (i.system.category === "ct") && (i.name.toLowerCase() === `ct ${attackName}`.toLowerCase()) && (i.system.quantity > 0));
  if ( tm ) {
    if ( tm.system.quantity > 1 ) await tm.update({ "system.quantity": tm.system.quantity - 1 });
    else await tm.delete();
    ui.notifications.info(`CT ${attackName} utilisée (retirée de l'inventaire de ${trainer.name}).`);
    return true;
  }
  if ( !game.user.isGM ) {
    ui.notifications.warn(`Il faut la CT ${attackName} dans l'inventaire de ${trainer?.name ?? "son Dresseur"}.`);
    return false;
  }
  return DialogV2.confirm({ window: { title: "Apprentissage sans CT" },
    content: `<p>Aucune CT ${attackName} dans l'inventaire. Ajouter l'attaque quand même (Maître de Capacités, événement…) ?</p>`, rejectClose: false });
}
