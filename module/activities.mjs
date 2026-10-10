/**
 * Activités hors combat : Œufs et Élevage (7.3 à 7.8), Pêche (6.6), Minage (6.7), Centre Pokémon,
 * boutique et revente (8.2, 8.9), CT consommées (Annexe 5).
 */
import { BABY_SPECIES, CURABLE, NATURES } from "./config.mjs";
import { trainerOf } from "./combat/effects.mjs";

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

/** Un Pokémon de l'équipe possède Corps Ardent ou Armurmagma : progression garantie à +2D10 % (7.6). */
function hasIncubator(trainer) {
  return trainer.system.team.map(u => fromUuidSync(u)).filter(Boolean)
    .some(p => p.itemTypes.talent.some(t => /corps ardent|armurmagma/i.test(t.name)));
}

/**
 * Une journée d'incubation : +1D10 % (normale), +2D10 % (favorable ou Corps Ardent / Armurmagma).
 * @param {Item} egg
 * @param {"normal"|"favorable"} conditions
 */
export async function incubate(egg, conditions) {
  const trainer = egg.parent;
  const boosted = (conditions === "favorable") || hasIncubator(trainer);
  const r = await roll(boosted ? "2d10" : "1d10");
  const progress = Math.min(egg.system.progress + r.total, 100);
  await egg.update({ "system.progress": progress });
  const why = conditions === "favorable" ? "conditions favorables" : boosted ? "Corps Ardent / Armurmagma" : "conditions normales";
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

/** Transmissions maîtrisées selon le niveau d'Élevage (7.7). */
const BREEDING = {
  0: { attacks: 0, ivs: 0 }, 1: { attacks: 1, ivs: 0 }, 2: { attacks: 1, ivs: 1 },
  3: { attacks: 2, ivs: 2 }, 4: { attacks: 3, ivs: 3 }, 5: { attacks: 3, ivs: 4 }
};

/**
 * Éclosion : nouveau Pokémon de la forme de base, Nature au D100, Talent et transmissions des parents,
 * Nouveau-né (÷2 jusqu'à 100 XP) sauf espèce Bébé, Confiance 4 + Obéissance 4 envers celui qui s'est occupé de l'Œuf.
 * @param {Item} egg
 */
export async function hatch(egg) {
  const trainer = egg.parent;
  if ( egg.system.progress < 100 ) return ui.notifications.warn(`L'Œuf n'est qu'à ${egg.system.progress} %.`);
  const source = await fromUuid(egg.system.speciesUuid);
  if ( !source ) return ui.notifications.warn(`Espèce introuvable : ${egg.system.species}`);
  const parents = (await Promise.all(egg.system.parents.map(u => fromUuid(u)))).filter(Boolean);
  const rules = BREEDING[egg.system.breeding] ?? BREEDING[0];
  const learnable = new Set(source.system.speciesData.learnset.map(e => e.name.toLowerCase()));
  const parentAttacks = [...new Set(parents.flatMap(p => p.itemTypes.attack.map(a => a.name)))]
    .filter(n => learnable.has(n.toLowerCase()) && !source.items.some(i => i.name === n));
  const bestIV = Object.fromEntries(IV_STATS.map(k => [k, Math.max(0, ...parents.map(p => p.system.stats[k].iv))]));
  const ivChoices = IV_STATS.filter(k => bestIV[k] > 0).sort((a, b) => bestIV[b] - bestIV[a]);

  let picks = { attacks: [], ivs: [] };
  if ( parents.length && (rules.attacks || rules.ivs) && (parentAttacks.length || ivChoices.length) ) {
    const box = (name, value, label, checked) => `<label class="checkbox"><input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""}> ${label}</label>`;
    picks = await DialogV2.prompt({
      window: { title: `Éclosion : transmissions (Élevage ${egg.system.breeding})` },
      content: `
        <p class="hint">Jusqu'à ${rules.attacks} attaque(s) naturelle(s) et ${rules.ivs} IV choisis parmi ceux des parents (7.7).</p>
        ${parentAttacks.length && rules.attacks ? `<fieldset><legend>Attaques des parents</legend>${parentAttacks.map((n, i) => box("attack", n, n, i < rules.attacks)).join("")}</fieldset>` : ""}
        ${ivChoices.length && rules.ivs ? `<fieldset><legend>IV des parents</legend>${ivChoices.map((k, i) => box("iv", k, `${k.toUpperCase()} ${bestIV[k]}`, i < rules.ivs)).join("")}</fieldset>` : ""}`,
      ok: {
        label: "Faire éclore",
        callback: (e, b) => ({
          attacks: [...b.form.querySelectorAll("input[name=attack]:checked")].map(i => i.value).slice(0, rules.attacks),
          ivs: [...b.form.querySelectorAll("input[name=iv]:checked")].map(i => i.value).slice(0, rules.ivs)
        })
      },
      rejectClose: false
    }) ?? picks;
  }

  const data = game.actors.fromCompendium(source);
  const system = data.system;
  const natureRoll = await roll("1d100");
  system.nature = NATURE_ORDER[Math.floor((natureRoll.total - 1) / 4)];
  for ( const k of picks.ivs ) system.stats[k].iv = bestIV[k];
  const talent = await inheritTalent(system.speciesData.talents, parents);
  const items = data.items ?? [];
  if ( talent?.uuid ) {
    const t = await fromUuid(talent.uuid);
    if ( t ) items.push(game.items.fromCompendium(t));
  }
  for ( const name of picks.attacks ) {
    const parentItem = parents.flatMap(p => p.itemTypes.attack).find(a => a.name === name);
    if ( parentItem ) items.push(game.items.fromCompendium(parentItem));
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
  return card(trainer, `L'Œuf éclot : ${pokemon.name} !`, `
    <p>${NATURES[system.nature].label}${talent ? ` · ${talent.name}` : ""}${picks.attacks.length ? ` · attaques transmises : ${picks.attacks.join(", ")}` : ""}${picks.ivs.length ? ` · IV transmis : ${picks.ivs.map(k => k.toUpperCase()).join(", ")}` : ""}.</p>
    <p class="hk-detail">${baby ? "Bébé Pokémon : fiche normale." : "Nouveau-né : caractéristiques et VIT ÷2 jusqu'à 100 XP Pokémon."}
      ${trainer.name} est sa figure parentale : Confiance 4, Obéissance 4. Rangé ${inTeam ? "dans l'équipe" : "dans la Boîte PC"}.</p>`, [natureRoll]);
}

/* -------------------------------------------- */
/*  Pêche et Minage (6.6, 6.7)                  */
/* -------------------------------------------- */

/** Dés de difficulté d'un test de Caractéristique, du plus facile au plus difficile. */
const DIE_LADDER = [4, 6, 8, 10, 12, 20];

/**
 * Pêche : test de FOR pour ramener la prise. La difficulté choisie par le MJ (taille du dé) est réduite
 * d'un cran par niveau de Pêche au-delà du premier et par la canne (Super −1, Méga −2), jusqu'au D4.
 */
export async function fish(trainer) {
  const rods = trainer.itemTypes.gear.filter(i => /canne/i.test(i.name) && (i.system.quantity > 0));
  const level = trainer.system.skills.peche.level;
  const rodBonus = rod => /m[ée]ga/i.test(rod) ? 2 : /super/i.test(rod) ? 1 : 0;
  const data = await DialogV2.prompt({
    window: { title: "Pêche", icon: "fa-solid fa-fish" },
    content: `
      <div class="form-group"><label>Difficulté de la prise</label><div class="form-fields"><select name="die">
        ${[6, 8, 10, 12, 20].map(d => `<option value="${d}">D${d}</option>`).join("")}</select></div></div>
      <div class="form-group"><label>Canne</label><div class="form-fields"><select name="rod">
        <option value="">Aucune</option>${rods.map(r => `<option value="${r.name}">${r.name}</option>`).join("")}</select></div></div>
      <p class="hint">Pêche niveau ${level} : −${Math.max(level - 1, 0)} difficulté. Super Canne −1, Méga Canne −2 (6.6).</p>`,
    ok: { label: "Ramener la prise", icon: "fa-solid fa-dice-d6", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !data ) return;
  const reduction = Math.max(level - 1, 0) + rodBonus(data.rod ?? "");
  const start = DIE_LADDER.indexOf(Number(data.die));
  const die = DIE_LADDER[Math.max(start - reduction, 0)];
  const strength = trainer.system.attributes.for.value;
  const r = await roll(`1d${die}`);
  const success = r.total <= strength;
  return card(trainer, `${trainer.name} pêche`, `
    <p class="hk-detail">Difficulté D${data.die} − ${reduction} → D${die} · 1D${die} ≤ FOR ${strength} → ${r.total}</p>
    <div class="hk-outcome ${success ? "success" : "failure"}">${success ? "La prise est ramenée !" : "La prise s'échappe"}</div>
    <p class="hint">Un autre personnage ou un Pokémon assez puissant peut aider. Pêche n'augmente pas la rareté des Pokémon rencontrés.</p>`, [r]);
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
  const cost = team.length * 50;
  if ( trainer.system.money < cost ) return ui.notifications.warn(`Soins : ${cost} ₽ (disponible : ${trainer.system.money} ₽).`);
  const ok = await DialogV2.confirm({ window: { title: "Centre Pokémon" },
    content: `<p>Soigner les ${team.length} Pokémon de l'équipe pour <strong>${cost} ₽</strong> (50 ₽ par Pokémon) ?</p>`, rejectClose: false });
  if ( !ok ) return;
  const wounded = [];
  for ( const p of team ) {
    if ( p.statuses.has("blessure") ) {
      wounded.push(p.name);
      continue;
    }
    await p.fullHeal();
    for ( const id of [...CURABLE, "dead", "attraction", "vampigraine", "malediction", "peur"] ) {
      if ( p.statuses.has(id) ) await p.toggleStatusEffect(id, { active: false });
    }
    await p.update({ "system.conditions.toxik": 0, "system.conditions.confusion": 0 });
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
