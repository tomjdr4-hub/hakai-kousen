import {
  ATTACK_CATEGORIES, ATTRIBUTE_DIFFICULTIES, ATTRIBUTES, DRESSAGE_FAILURES, POKEMON_STATS, POOL_DIFFICULTIES, TYPES,
  tableUniqueThreshold, typeEffectiveness
} from "../config.mjs";

import { applyDamage, effectLabel, onRenderChatMessage as onRenderEffects, spendEnergy } from "../combat/effects.mjs";
import { armorReduction, damageBonuses, dodgeLevel, DODGE_COST, resistanceReduction } from "../combat/skills.mjs";
import { attackerTalentMultipliers, defenderTalentImmunity, talentNames } from "../combat/talents.mjs";

const { DialogV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Demande une valeur dans une liste déroulante. Renvoie null si la fenêtre est fermée.
 * @param {string} title
 * @param {string} label
 * @param {Record<string, string>} choices
 * @param {string|number} selected
 */
async function promptChoice(title, label, choices, selected) {
  const options = Object.entries(choices).map(([value, text]) => {
    const sel = String(value) === String(selected) ? " selected" : "";
    return `<option value="${value}"${sel}>${text}</option>`;
  }).join("");
  const content = `<div class="form-group"><label>${label}</label>
    <div class="form-fields"><select name="choice">${options}</select></div></div>`;
  return DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: "Lancer",
      icon: "fa-solid fa-dice-d10",
      callback: (event, button) => button.form.elements.choice.value
    },
    rejectClose: false
  });
}

/** Résultats des dés d'un jet, pour l'affichage. */
function diceFaces(roll) {
  return roll.dice.flatMap(d => d.results.map(r => {
    const cls = ["die"];
    if ( r.discarded ) cls.push("discarded");
    if ( r.result === d.faces ) cls.push("max");
    if ( r.result === 1 ) cls.push("min");
    return `<span class="${cls.join(" ")}">${r.result}</span>`;
  })).join("");
}

function outcome(success, text) {
  return `<div class="hk-outcome ${success ? "success" : "failure"}">${text}</div>`;
}

async function sendCard(actor, { title, subtitle = "", body, rolls = [], flags = {} }) {
  const content = `<div class="hk-card">
    <header><h3>${title}</h3>${subtitle ? `<span class="subtitle">${subtitle}</span>` : ""}</header>
    ${body}
  </div>`;
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content,
    rolls,
    flags: { "hakai-kousen": flags }
  });
}

/* -------------------------------------------- */
/*  Tests de Caractéristique (2.2)              */
/* -------------------------------------------- */

/**
 * 1Dx inférieur ou égal à la Caractéristique ; la difficulté agrandit le dé.
 * @param {Actor} actor
 * @param {string} key  dex | for | con | end | vol
 */
export async function rollAttribute(actor, key) {
  const value = actor.type === "pokemon" ? actor.system.stats[key].value : actor.system.attributes[key].value;
  const label = ATTRIBUTES[key].label;
  const faces = await promptChoice(`Test de ${label}`, "Difficulté", ATTRIBUTE_DIFFICULTIES, 6);
  if ( !faces ) return null;

  const roll = await new foundry.dice.Roll(`1d${faces}`).evaluate();
  const success = roll.total <= value;
  const margin = value - roll.total;
  const body = `<div class="hk-dice">${diceFaces(roll)}</div>
    <p class="hk-detail">1D${faces} ≤ ${value}</p>
    ${outcome(success, success ? `Réussite (marge ${margin})` : "Échec")}`;
  return sendCard(actor, { title: `${label} (${value})`, subtitle: ATTRIBUTE_DIFFICULTIES[faces], body, rolls: [roll],
    flags: { dice: [{ kind: "attribute", label: `Test de ${label}`, value }] } });
}

/* -------------------------------------------- */
/*  Tests de Compétence / Connaissance (2.3)    */
/* -------------------------------------------- */

/**
 * Niveau = nombre de D10, on garde le meilleur. Niveau 0 : 2D10, on garde le moins bon.
 * @param {Actor} actor
 * @param {string} label
 * @param {number} level
 * @param {string} [spec]  Spécialisation éventuelle, rappelée sur la carte
 */
export async function rollPool(actor, label, level, spec = "") {
  const choices = { "": "Non précisée (le MJ tranche)", ...POOL_DIFFICULTIES };
  const difficulty = await promptChoice(`Test : ${label}`, "Difficulté", choices, "");
  if ( difficulty === null ) return null;

  const formula = level > 0 ? `${level}d10kh` : "2d10kl";
  const roll = await new foundry.dice.Roll(formula).evaluate();
  const result = roll.total;
  const threshold = Number(difficulty) || null;

  let text;
  let success = result > 1;
  if ( result === 1 ) text = "Échec critique";
  else if ( threshold ) {
    success = result >= threshold;
    if ( !success ) text = "Échec";
    else if ( (result === 10) && (threshold < 10) ) text = "Réussite critique";
    else text = "Réussite";
  }
  else text = result === 10 ? "10 : réussite critique si le test réussit" : `Résultat : ${result}`;

  const subtitle = `Niveau ${level}${spec ? ` · ${spec}` : ""}${threshold ? ` · seuil ${threshold}+` : ""}`;
  const body = `<div class="hk-dice">${diceFaces(roll)}</div>
    <p class="hk-detail">${level > 0 ? `${level}D10, meilleur résultat` : "2D10, moins bon résultat"} : <strong>${result}</strong></p>
    ${outcome(success, text)}`;
  return sendCard(actor, { title: label, subtitle, body, rolls: [roll],
    flags: { dice: [{ kind: "pool", label, level, threshold }] } });
}

/* -------------------------------------------- */
/*  Dressage (4.11)                             */
/* -------------------------------------------- */

export async function rollDressage(actor) {
  const dressage = actor.system.dressage;
  if ( dressage >= 8 ) {
    return sendCard(actor, {
      title: "Ordre",
      subtitle: `Dressage ${dressage}`,
      body: outcome(true, "Obéit normalement, aucun test nécessaire.")
    });
  }
  const roll = await new foundry.dice.Roll("1d8").evaluate();
  const success = roll.total <= dressage;
  const failure = DRESSAGE_FAILURES.find(f => dressage <= f.max)?.text;
  const body = `<div class="hk-dice">${diceFaces(roll)}</div>
    <p class="hk-detail">1D8 ≤ ${dressage}</p>
    ${outcome(success, success ? "Le Pokémon obéit." : `Désobéit : ${failure}`)}
    ${!success && (dressage >= 5) ? `<button type="button" class="hk-apply" data-hk-dressage="random" data-uuid="${actor.uuid}">
      <i class="fa-solid fa-shuffle"></i> Tirer une attaque au hasard (décision du MJ)</button>` : ""}`;
  return sendCard(actor, { title: "Ordre", subtitle: `Dressage ${dressage}`, body, rolls: [roll] });
}

/**
 * Échec d'ordre à Dressage 5-7 (4.11) : le Pokémon peut utiliser une attaque au hasard de sa liste.
 * Tire une attaque qu'il peut payer en ENE et propose de la lancer.
 */
async function randomAttack(actor) {
  const attacks = actor.itemTypes.attack.filter(a => actor.system.ene.value >= a.system.energy);
  if ( !attacks.length ) return ui.notifications.warn(`${actor.name} n'a aucune attaque utilisable (ENE).`);
  const roll = await new foundry.dice.Roll(`1d${attacks.length}`).evaluate();
  const attack = attacks[roll.total - 1];
  return sendCard(actor, {
    title: "Attaque au hasard",
    subtitle: `1D${attacks.length} parmi les attaques utilisables`,
    body: `<div class="hk-dice">${diceFaces(roll)}</div>
      <p><strong>${attack.name}</strong> (${attack.system.energy} ENE)</p>
      <p class="hint">Ciblez un jeton avant de lancer ; sans cible, le toucher n'est pas comparé à la Table unique.</p>
      <button type="button" class="hk-apply" data-hk-dressage="launch" data-uuid="${actor.uuid}" data-item="${attack.id}">
        <i class="fa-solid fa-dice-d10"></i> Lancer ${attack.name}</button>`,
    rolls: [roll]
  });
}

/* -------------------------------------------- */
/*  Attaques (5.7 à 5.9)                        */
/* -------------------------------------------- */

/** Valeur défensive d'une cible, quel que soit son type d'acteur. */
function defenseValue(actor, key) {
  if ( actor?.type === "pokemon" ) return actor.system.stats[key].value;
  if ( actor?.type === "trainer" ) return actor.system.attributes[key].value;
  return null;
}

/** Types défensifs d'une cible. */
function defenderTypes(actor) {
  if ( actor?.type !== "pokemon" ) return [];
  return actor.system.defensiveTypes;
}

/**
 * STAB (5.8, 5.19.4) : ×1,5 quand l'attaque est d'un type du lanceur (types de la forme Méga si elle est active).
 * Téracristallisation : le Type Téra donne aussi ×1,5, ou ×2 s'il est identique à un type d'origine.
 * Réglage « STAB automatique » désactivé : les dégâts saisis l'incluent déjà (fiche papier).
 * @returns {number}
 */
export function stabMultiplier(actor, type) {
  const sys = actor?.system;
  if ( !type || !sys?.types || !game.settings.get("hakai-kousen", "autoStab") ) return 1;
  const own = (sys.form?.active && sys.form.primary) ? [sys.form.primary, sys.form.secondary] : [sys.types.primary, sys.types.secondary];
  const owns = own.filter(Boolean).includes(type);
  const tera = (sys.tera?.active && sys.tera.type && (sys.tera.type !== "stellaire")) ? sys.tera.type : null;
  if ( tera === type ) return owns ? 2 : 1.5;
  return owns ? 1.5 : 1;
}

/**
 * Dégâts variables (Ampleur, Balayage, Croc Fatal…) : la capacité n'a pas de valeur fixe, le lanceur saisit le montant
 * selon sa description. Renvoie null si la fenêtre est fermée.
 */
async function askVariableDamage(item, target) {
  const description = (item.system.description ?? "").replace(/<[^>]+>/g, " ").trim();
  return DialogV2.prompt({
    window: { title: `Dégâts de ${item.name}`, icon: "fa-solid fa-burst" },
    content: `<p>${item.name} n'a pas de dégâts fixes : ils dépendent de la situation${target ? ` (cible : ${target.name})` : ""}.</p>
      ${description ? `<p class="hint">${description}</p>` : ""}
      <div class="form-group"><label>Dégâts de base</label><div class="form-fields">
        <input type="text" name="damage" value="" placeholder="Nombre ou formule (2d6+3)" autofocus></div></div>
      <p class="hint">Saisissez les dégâts avant STAB, critique et efficacité du type : le système les applique ensuite.</p>`,
    ok: { label: "Valider", callback: (e, b) => b.form.elements.damage.value.trim() || null },
    rejectClose: false
  });
}

/** Objets tenus d'un acteur (noms en minuscules). */
function held(actor) {
  return actor?.system?.heldNames ?? [];
}

/** Baie de résistance tenue contre ce Type d'attaque super efficace (Annexe 2) : dégâts finaux ÷2. */
function resistBerry(actor, attackType) {
  if ( actor?.type !== "pokemon" ) return null;
  const label = (TYPES[attackType] ?? "").toLowerCase();
  return actor.itemTypes.gear.find(i => (i.system.category === "held")
    && new RegExp(`super efficace de type ${label}(?![a-zà-ÿ])`, "i").test(i.system.description.replace(/<[^>]+>/g, ""))) ?? null;
}

/** Chance d'effet secondaire : D10 pour les multiples de 10 %, D100 sinon (5.9). */
async function rollEffectChance(chance) {
  const faces = chance % 10 === 0 ? 10 : 100;
  const roll = await new foundry.dice.Roll(`1d${faces}`).evaluate();
  const limit = faces === 10 ? chance / 10 : chance;
  return { roll, success: roll.total <= limit, text: `1D${faces} ≤ ${limit}` };
}

function effectivenessLabel(mult) {
  if ( mult === 0 ) return "Aucun effet";
  if ( mult > 1 ) return `Super efficace ×${mult}`;
  if ( mult < 1 ) return `Pas très efficace ×${mult}`;
  return "";
}

/**
 * Utilise une capacité : dépense l'ENE, jette le toucher contre chaque cible puis les dégâts.
 * @param {Actor} actor  Pokémon attaquant
 * @param {Item} item    Capacité
 * @param {object} [options]
 * @param {Array<Token|TokenDocument>} [options.targets]  Cibles ; par défaut les jetons ciblés par l'utilisateur
 * @param {boolean} [options.zMove]  Capacité Z : coûte la moitié de l'ENE maximale (5.19.2)
 */
export async function rollAttack(actor, item, { targets, zMove = false } = {}) {
  const atk = item.system;
  const combat = game.combat?.started ? game.combat : null;
  const readyRound = item.getFlag?.("hakai-kousen", "readyRound");
  if ( combat && atk.recharge && Number.isNumeric(readyRound) && (readyRound > combat.round) ) {
    ui.notifications.warn(`${item.name} se recharge : de nouveau disponible au tour ${readyRound}.`);
    return null;
  }
  const energy = zMove ? Math.floor(actor.system.ene.max / 2) : atk.energy;
  if ( actor.system.ene.value < energy ) {
    ui.notifications.warn(`${actor.name} n'a pas assez d'Énergie pour utiliser ${item.name} (${energy} ENE).`);
    return null;
  }

  const special = atk.category === "special";
  const offenseKey = special ? "con" : "for";
  const defenseKey = special ? "vol" : "end";
  const offense = actor.system.stats[offenseKey].value;
  const sp = atk.special ?? {};
  const attackerHeld = held(actor);
  const rolls = [];
  let totalDamage = 0;
  let damagingHits = 0;
  const rows = [];
  const targetEffects = atk.effects.filter(e => e.target === "target");
  const selfEffects = atk.effects.filter(e => e.target === "self");
  let anyHit = false;
  let anySecondary = false;
  // Rôle de chaque jet, pour la relance d'un dé contre 1 XP Dresseur (3.12).
  const diceInfo = [];

  targets = (targets ?? Array.from(game.user.targets)).filter(t => t.actor);
  for ( const token of (targets.length ? targets : [null]) ) {
    const target = token?.actor ?? null;
    const lines = [];
    let hit = true;
    let crit = false;

    // Précision : capacité, modification temporaire du lanceur et objets tenus (Annexe 6).
    let accuracy = atk.sure ? 100 : atk.accuracy;
    const accNotes = [];
    if ( !atk.sure && (atk.accuracy > 0) ) {
      const mods = [[actor.system.accuracyMod ?? 0, "précision"]];
      if ( attackerHeld.includes("loupe") ) mods.push([10, "Loupe"]);
      if ( talentNames(actor).includes("agitation") ) mods.push([-20, "Agitation"]);
      const targetCombatant = token ? game.combat?.combatants.find(c => c.tokenId === (token.document?.id ?? token.id)) : null;
      if ( attackerHeld.includes("lentille zoom") && targetCombatant?.choice.done ) mods.push([20, "Lentille Zoom"]);
      const targetHeld = held(target);
      if ( targetHeld.includes("poudre claire") || targetHeld.includes("encens doux") ) mods.push([-10, "objet de la cible"]);
      for ( const [v, label] of mods.filter(([v]) => v) ) {
        accuracy += v;
        accNotes.push(`${v > 0 ? "+" : ""}${v} % (${label})`);
      }
    }
    const accText = accNotes.length ? ` (${accNotes.join(", ")})` : "";

    // Toucher.
    if ( atk.category === "status" ) {
      // Capacité de statut : D100 contre la précision, sauf si elle ne peut pas échouer (règle confirmée par l'auteur).
      if ( !atk.sure && (atk.accuracy > 0) && (accuracy < 100) ) {
        const roll = await new foundry.dice.Roll("1d100").evaluate();
        rolls.push(roll);
        diceInfo[rolls.length - 1] = { kind: "d100", label: `${item.name}${target ? ` sur ${target.name}` : ""} : 1D100`, max: accuracy };
        hit = roll.total <= accuracy;
        lines.push(`<div class="hk-dice">${diceFaces(roll)}</div><p class="hk-detail">1D100 ≤ ${accuracy}${accText}</p>`);
      }
    }
    else {
      const roll = await new foundry.dice.Roll("1d10").evaluate();
      rolls.push(roll);
      const natural = roll.total;
      // Critique : 10 naturel ; Lentilscope ou Griffe Rasoir : 9-10 ; Poing Chance ou Poireau : 8-10 (si l'attaque touche).
      const critMin = (attackerHeld.includes("poing chance") || attackerHeld.includes("poireau")) ? 8
        : (attackerHeld.includes("lentilscope") || attackerHeld.includes("griffe rasoir")) ? 9 : 10;
      crit = natural === 10;
      let defense = defenseValue(target, defenseKey);
      let defenseLabel = POKEMON_STATS[defenseKey].abbr;
      let detail;
      // Esquive préparée : la DEX remplace END ou VOL, pour son coût en ENE (Annexe 1).
      const dodge = await tryDodge(token, target, atk, defense);
      if ( dodge ) {
        defense = dodge.dex;
        defenseLabel = "DEX (Esquive)";
      }
      // « Ajoute +1 sur le résultat du dé 10 » (Tranch'Herbe…) : le bonus s'ajoute au dé, le critique reste un 10 naturel.
      const result = natural + (sp.hitBonus ?? 0);
      if ( defense !== null ) {
        const margin = offense - defense;
        const threshold = tableUniqueThreshold(margin, accuracy);
        hit = crit || (result >= threshold);
        if ( hit && (natural >= critMin) ) crit = true;
        detail = `${POKEMON_STATS[offenseKey].abbr} ${offense} − ${defenseLabel} ${defense} = marge ${margin >= 0 ? "+" : ""}${margin}
          · ${accuracy} %${accText} → seuil <strong>${threshold}+</strong>${sp.hitBonus ? ` · dé +${sp.hitBonus} = ${result}` : ""}${dodge ? ` · Esquive : −${dodge.cost} ENE` : ""}`;
      }
      else detail = `Aucune cible : comparez à la Table unique (${accuracy} %${accText}).`;
      lines.push(`<div class="hk-dice">${diceFaces(roll)}</div><p class="hk-detail">${detail}</p>`);
      diceInfo[rolls.indexOf(roll)] = { kind: "hit", label: `Toucher${target ? ` ${target.name}` : ""} (${item.name})`,
        threshold: (defense !== null) ? tableUniqueThreshold(offense - defense, accuracy) : null, hitBonus: sp.hitBonus ?? 0 };
    }

    if ( target || (atk.category === "status") ) {
      lines.push(outcome(hit, hit ? (crit ? "Touché ! Réussite exceptionnelle (critique)" : "Touché") : "Raté"));
    }
    else if ( crit ) lines.push(outcome(true, "10 naturel : réussite exceptionnelle"));

    // Dégâts : formule de la capacité, STAB, doublés sur 10 naturel, puis efficacité du type.
    const variable = (atk.category !== "status") && !atk.damage.trim() && !sp.ohko;
    if ( hit && (atk.isDamaging || sp.ohko || variable) ) {
      const rawMult = target ? typeEffectiveness(atk.type, defenderTypes(target)) : 1;
      const resist = target ? resistanceReduction(target, atk.type) : 0;
      // Talent de la cible (Lévitation, Torche, Fermeté) : aucun effet.
      const immuneTalent = target ? defenderTalentImmunity(target, item) : null;
      const mult = immuneTalent ? 0 : Math.max(rawMult - resist, 0);
      const parts = immuneTalent ? [`${immuneTalent} : aucun effet`] : [];
      let amount;
      let berry = null;
      if ( sp.ohko ) {
        // KO direct (Abîme) : la cible tombe à 0 VIT, sauf immunité de Type.
        amount = (target && mult > 0) ? Math.max(target.system.vit.value, 0) : 0;
        parts.push(mult > 0 ? "KO direct" : "Aucun effet");
      }
      else {
        const formula = variable ? await askVariableDamage(item, target) : atk.damage;
        const valid = formula && foundry.dice.Roll.validate(String(formula));
        if ( variable && !valid ) parts.push("Dégâts variables non saisis");
        const dmgRoll = await new foundry.dice.Roll(valid ? String(formula) : "0", actor.getRollData()).evaluate();
        rolls.push(dmgRoll);
        // Frappes multiples : « 2 fois », « 2 à 5 fois » (un seul jet de toucher).
        let hits = 1;
        if ( sp.hits ) {
          const hitsRoll = await new foundry.dice.Roll(sp.hits).evaluate();
          rolls.push(hitsRoll);
          hits = Math.max(hitsRoll.total, 1);
        }
        // Ordre (Annexes 1 et 6) : dégâts de la capacité → STAB → Augmentation et objets tenus
        // → objet Choix ×1,5 → critique → Types (réduits par Résistance) → Baie de résistance ÷2 → Blindage.
        // Arrondi à l'inférieur après l'ensemble des opérations (2.8).
        const stab = stabMultiplier(actor, atk.type);
        const bonuses = damageBonuses(actor, item);
        if ( (atk.category === "physical") && attackerHeld.includes("bandeau muscle") ) bonuses.push({ label: "Bandeau Muscle", value: 1 });
        if ( (atk.category === "special") && attackerHeld.includes("lunettes sages") ) bonuses.push({ label: "Lunettes Sages", value: 1 });
        if ( attackerHeld.includes("orbe vie") ) bonuses.push({ label: "Orbe Vie", value: 3 });
        if ( attackerHeld.includes("gant de boxe") && /poing/i.test(item.name) ) bonuses.push({ label: "Gant de Boxe", value: 2 });
        if ( attackerHeld.includes("ceinture pro") && (rawMult > 1) ) bonuses.push({ label: "Ceinture Pro", value: 2 });
        const choice = ((atk.category === "physical") && attackerHeld.includes("bandeau choix"))
          || ((atk.category === "special") && attackerHeld.includes("lunettes choix")) ? 1.5 : 1;
        const base = ((dmgRoll.total * stab) + bonuses.reduce((sum, b) => sum + b.value, 0)) * hits;
        // Talents de l'attaquant (Brasier, Torrent… sous 1/3 de VIT, Prognathe, Technicien) : ×1,5.
        const talentMults = attackerTalentMultipliers(actor, item);
        const talentMult = talentMults.reduce((m, t) => m * t.mult, 1);
        amount = Math.floor(base * choice * talentMult * (crit ? 2 : 1) * mult);
        berry = target && (rawMult > 1) ? resistBerry(target, atk.type) : null;
        if ( berry && amount ) amount = Math.max(Math.floor(amount / 2), 1);
        const armor = (target && (atk.category === "physical")) ? armorReduction(target) : 0;
        amount = Math.max(amount - armor, 0);
        parts.push(`${dmgRoll.formula} = ${dmgRoll.total}`);
        if ( stab > 1 ) parts.push(`×${stab === 2 ? 2 : "1,5"} (STAB${stab === 2 ? " Téra" : ""})`);
        for ( const b of bonuses ) parts.push(`+${b.value} (${b.label})`);
        if ( hits > 1 ) parts.push(`×${hits} frappes`);
        if ( choice > 1 ) parts.push("×1,5 (Choix)");
        for ( const t of talentMults ) parts.push(`×1,5 (${t.label})`);
        if ( crit ) parts.push("×2 (critique)");
        if ( resist ) parts.push(`×${rawMult} −${resist} (Résistance)`);
        if ( mult !== 1 ) parts.push(`×${mult}`);
        if ( berry ) parts.push(`÷2 (${berry.name}, consommée)`);
        if ( armor ) parts.push(`−${armor} (Blindage)`);
        damagingHits += hits;
      }
      totalDamage += amount;
      const eff = effectivenessLabel(mult);
      lines.push(`<div class="hk-damage">
        <span class="amount">${amount}</span> dégâts
        <span class="hk-detail">${parts.join(" ")}</span>
        ${eff ? `<span class="hk-effectiveness">${eff}</span>` : ""}
      </div>`);
      if ( target && (amount > 0) ) {
        lines.push(`<button type="button" class="hk-apply" data-hk-action="applyDamage"
          data-uuid="${target.uuid}" data-amount="${amount}" data-attack-type="${atk.type}" data-hit="1" ${berry ? `data-consume="${berry.uuid}"` : ""}>
          <i class="fa-solid fa-heart-crack"></i> Appliquer ${amount} dégâts à ${token.name}</button>`);
      }
    }

    // Effet secondaire.
    let secondary = true;
    if ( hit && (atk.effectChance > 0) && (atk.effectChance < 100) ) {
      const effect = await rollEffectChance(atk.effectChance);
      rolls.push(effect.roll);
      secondary = effect.success;
      lines.push(`<p class="hk-detail">Effet secondaire (${atk.effectChance} %) : ${effect.text} → ${effect.roll.total}</p>
        ${outcome(effect.success, effect.success ? "Effet secondaire déclenché" : "Pas d'effet secondaire")}`);
    }
    if ( hit ) {
      anyHit = true;
      anySecondary ||= secondary;
      // Effets sur la cible : un bouton par effet.
      const effects = targetEffects.filter(e => !e.secondary || secondary);
      if ( target ) lines.push(...effects.map(e => effectButton(target, token.name, e, actor)));
      else if ( effects.length ) lines.push(`<p class="hk-detail">Effets sur la cible : ${effects.map(effectLabel).join(", ")}</p>`);
    }

    rows.push(`<section class="hk-target">${token ? `<h4>${token.name}</h4>` : ""}${lines.join("")}</section>`);
  }

  // Lanceur : effets sur lui-même, recul, drain (une seule fois, si l'attaque a touché).
  const ownLines = selfEffects.filter(e => anyHit && (!e.secondary || anySecondary)).map(e => effectButton(actor, actor.name, e));
  if ( anyHit && (totalDamage > 0) ) {
    const vitMax = actor.system.vit.max;
    let recoil = 0;
    const why = [];
    if ( sp.recoilDamage ) { recoil += Math.max(Math.floor(totalDamage * sp.recoilDamage), 1); why.push(`${Math.round(sp.recoilDamage * 100)} % des dégâts`); }
    if ( sp.recoilVit ) { recoil += Math.max(Math.floor(vitMax * sp.recoilVit), 1) * Math.max(damagingHits, 1); why.push("1/10 de la VIT max par coup"); }
    if ( attackerHeld.includes("orbe vie") ) { recoil += Math.max(Math.floor(vitMax / 10), 1); why.push("Orbe Vie"); }
    if ( recoil ) {
      ownLines.push(`<button type="button" class="hk-apply" data-hk-action="applyDamage" data-uuid="${actor.uuid}" data-amount="${recoil}">
        <i class="fa-solid fa-person-falling-burst"></i> Recul : ${recoil} dégâts à ${actor.name} (${why.join(", ")})</button>`);
    }
    if ( sp.drain ) {
      const heal = Math.max(Math.floor(totalDamage * sp.drain), 1);
      ownLines.push(`<button type="button" class="hk-apply" data-hk-action="heal" data-uuid="${actor.uuid}" data-amount="${heal}">
        <i class="fa-solid fa-heart-circle-plus"></i> Drain : ${actor.name} récupère ${heal} VIT</button>`);
    }
  }
  if ( sp.selfKO ) ownLines.push(`<p class="hk-detail">${actor.name} est mis KO par sa propre capacité.</p>`);
  if ( ownLines.length ) rows.push(`<section class="hk-target"><h4>${actor.name} (lanceur)</h4>${ownLines.join("")}</section>`);

  if ( energy > 0 ) await actor.update({ "system.ene.value": actor.system.ene.value - energy });

  // Action de Boss : la recharge est lancée ouvertement pour que les joueurs anticipent (5.20).
  if ( combat && atk.recharge && item.id ) {
    const recharge = await new foundry.dice.Roll(atk.recharge).evaluate();
    rolls.push(recharge);
    const ready = combat.round + recharge.total + 1;
    await item.setFlag("hakai-kousen", "readyRound", ready);
    rows.push(`<p class="hk-detail">Recharge ${atk.recharge} : ${recharge.total} tour(s), de nouveau disponible au tour ${ready}.</p>`);
  }

  const subtitle = [zMove ? "Capacité Z" : null, TYPES[atk.type], ATTACK_CATEGORIES[atk.category], energy ? `${energy} ENE` : null, atk.range]
    .filter(Boolean).join(" · ");
  const zNote = zMove ? `<p class="hk-detail">Capacité Z : dégâts et effets adaptés de la version officielle et des données HK, à ajuster par le MJ.</p>` : "";
  const description = atk.description ? `<details class="hk-description"><summary>Effet</summary>${atk.description}</details>` : "";
  const message = await sendCard(actor, {
    title: zMove ? `${item.name} (Capacité Z)` : item.name, subtitle, body: rows.join("") + zNote + description, rolls,
    flags: { anyHit, dice: Array.from(diceInfo, d => d ?? null) }
  });
  // Explosion, Destruction… : le lanceur tombe KO, que l'attaque touche ou non.
  if ( sp.selfKO && (actor.system.vit.value > 0) ) await applyDamage(actor, actor.system.vit.value);
  return message;
}

/* -------------------------------------------- */
/*  Actions des cartes de chat                  */
/* -------------------------------------------- */

/**
 * Esquive d'une cible qui l'a préparée dans le panneau de combat : seulement si la DEX est meilleure
 * que la défense normale, si l'attaque peut être esquivée et si l'ENE suffit.
 */
async function tryDodge(token, target, atk, defense) {
  if ( !target || atk.sure || (atk.category === "status") || (defense === null) ) return null;
  const combatant = game.combat?.combatants.find(c => c.tokenId === (token.document?.id ?? token.id));
  if ( !combatant?.choice?.dodge ) return null;
  const lvl = dodgeLevel(target);
  const cost = DODGE_COST[Math.min(lvl, 5)];
  const dex = target.system.stats?.dex.value ?? 0;
  if ( !lvl || (target.system.ene.value < cost) || (dex <= defense) ) return null;
  await spendEnergy(target, cost);
  return { dex, cost };
}

/** Bouton d'application d'un effet de capacité sur un acteur. */
function effectButton(actor, name, effect, source = null) {
  // Le lanceur est mémorisé pour les états qui lui profitent (Vampigraine).
  const data = encodeURIComponent(JSON.stringify({
    kind: effect.kind, stat: effect.stat, value: effect.value, status: effect.status, source: source?.uuid ?? null
  }));
  const icon = effect.kind === "status" ? "fa-skull-crossbones" : (effect.value > 0 ? "fa-arrow-up" : "fa-arrow-down");
  return `<button type="button" class="hk-apply" data-hk-action="applyEffect" data-uuid="${actor.uuid}" data-effect="${data}">
    <i class="fa-solid ${icon}"></i> Appliquer ${effectLabel(effect)} à ${name}</button>`;
}

/** Boutons des cartes Hakai Kousen : effets (combat/effects.mjs) et ordres désobéis (attaque au hasard). */
export function onRenderChatMessage(message, html) {
  onRenderEffects(message, html);
  html.querySelectorAll("[data-hk-dressage]").forEach(button => {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.uuid);
      if ( !actor?.isOwner ) return ui.notifications.warn("Seul le propriétaire du Pokémon peut faire cette action.");
      button.classList.add("applied");
      if ( button.dataset.hkDressage === "random" ) return randomAttack(actor);
      const item = actor.items.get(button.dataset.item);
      if ( item ) return rollAttack(actor, item);
    });
  });
}
