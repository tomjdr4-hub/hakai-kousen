import {
  ATTACK_CATEGORIES, ATTRIBUTE_DIFFICULTIES, ATTRIBUTES, DRESSAGE_FAILURES, POKEMON_STATS, POOL_DIFFICULTIES, TYPES,
  tableUniqueThreshold, typeEffectiveness
} from "../config.mjs";

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

async function sendCard(actor, { title, subtitle = "", body, rolls = [] }) {
  const content = `<div class="hk-card">
    <header><h3>${title}</h3>${subtitle ? `<span class="subtitle">${subtitle}</span>` : ""}</header>
    ${body}
  </div>`;
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content,
    rolls
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
  return sendCard(actor, { title: `${label} (${value})`, subtitle: ATTRIBUTE_DIFFICULTIES[faces], body, rolls: [roll] });
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
  return sendCard(actor, { title: label, subtitle, body, rolls: [roll] });
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
    ${outcome(success, success ? "Le Pokémon obéit." : `Désobéit : ${failure}`)}`;
  return sendCard(actor, { title: "Ordre", subtitle: `Dressage ${dressage}`, body, rolls: [roll] });
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
  return [actor.system.types.primary, actor.system.types.secondary].filter(Boolean);
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
 */
export async function rollAttack(actor, item) {
  const atk = item.system;
  if ( actor.system.ene.value < atk.energy ) {
    ui.notifications.warn(`${actor.name} n'a pas assez d'Énergie pour utiliser ${item.name} (${atk.energy} ENE).`);
    return null;
  }

  const special = atk.category === "special";
  const offenseKey = special ? "con" : "for";
  const defenseKey = special ? "vol" : "end";
  const offense = actor.system.stats[offenseKey].value;
  const accuracy = atk.sure ? 100 : atk.accuracy;
  const rolls = [];
  const rows = [];

  const targets = Array.from(game.user.targets).filter(t => t.actor);
  for ( const token of (targets.length ? targets : [null]) ) {
    const target = token?.actor ?? null;
    const lines = [];
    let hit = true;
    let crit = false;

    // Toucher.
    if ( atk.category === "status" ) {
      // Capacité de statut : D100 contre la précision, sauf si elle ne peut pas échouer.
      if ( !atk.sure && (atk.accuracy > 0) && (atk.accuracy < 100) ) {
        const roll = await new foundry.dice.Roll("1d100").evaluate();
        rolls.push(roll);
        hit = roll.total <= atk.accuracy;
        lines.push(`<div class="hk-dice">${diceFaces(roll)}</div><p class="hk-detail">1D100 ≤ ${atk.accuracy}</p>`);
      }
    }
    else {
      const roll = await new foundry.dice.Roll("1d10").evaluate();
      rolls.push(roll);
      const natural = roll.total;
      crit = natural === 10;
      const defense = defenseValue(target, defenseKey);
      let detail;
      if ( defense !== null ) {
        const margin = offense - defense;
        const threshold = tableUniqueThreshold(margin, accuracy);
        hit = crit || (natural >= threshold);
        detail = `${POKEMON_STATS[offenseKey].abbr} ${offense} − ${POKEMON_STATS[defenseKey].abbr} ${defense} = marge ${margin >= 0 ? "+" : ""}${margin}
          · ${accuracy} % → seuil <strong>${threshold}+</strong>`;
      }
      else detail = `Aucune cible : comparez à la Table unique (${accuracy} %).`;
      lines.push(`<div class="hk-dice">${diceFaces(roll)}</div><p class="hk-detail">${detail}</p>`);
    }

    if ( target || (atk.category === "status") ) {
      lines.push(outcome(hit, hit ? (crit ? "Touché ! Réussite exceptionnelle (10 naturel)" : "Touché") : "Raté"));
    }
    else if ( crit ) lines.push(outcome(true, "10 naturel : réussite exceptionnelle"));

    // Dégâts : formule de la capacité (STAB inclus), doublés sur 10 naturel, puis efficacité du type.
    if ( hit && atk.isDamaging ) {
      const dmgRoll = await new foundry.dice.Roll(atk.damage, actor.getRollData()).evaluate();
      rolls.push(dmgRoll);
      const mult = target ? typeEffectiveness(atk.type, defenderTypes(target)) : 1;
      const amount = Math.floor(dmgRoll.total * (crit ? 2 : 1) * mult);
      const parts = [`${dmgRoll.formula} = ${dmgRoll.total}`];
      if ( crit ) parts.push("×2 (critique)");
      if ( mult !== 1 ) parts.push(`×${mult}`);
      const eff = effectivenessLabel(mult);
      lines.push(`<div class="hk-damage">
        <span class="amount">${amount}</span> dégâts
        <span class="hk-detail">${parts.join(" ")}</span>
        ${eff ? `<span class="hk-effectiveness">${eff}</span>` : ""}
      </div>`);
      if ( target && (amount > 0) ) {
        lines.push(`<button type="button" class="hk-apply" data-hk-action="applyDamage"
          data-uuid="${target.uuid}" data-amount="${amount}">
          <i class="fa-solid fa-heart-crack"></i> Appliquer ${amount} dégâts à ${token.name}</button>`);
      }
    }

    // Effet secondaire.
    if ( hit && (atk.effectChance > 0) && (atk.effectChance < 100) ) {
      const effect = await rollEffectChance(atk.effectChance);
      rolls.push(effect.roll);
      lines.push(`<p class="hk-detail">Effet secondaire (${atk.effectChance} %) : ${effect.text} → ${effect.roll.total}</p>
        ${outcome(effect.success, effect.success ? "Effet secondaire déclenché" : "Pas d'effet secondaire")}`);
    }

    rows.push(`<section class="hk-target">${token ? `<h4>${token.name}</h4>` : ""}${lines.join("")}</section>`);
  }

  if ( atk.energy > 0 ) await actor.update({ "system.ene.value": actor.system.ene.value - atk.energy });

  const subtitle = [TYPES[atk.type], ATTACK_CATEGORIES[atk.category], atk.energy ? `${atk.energy} ENE` : null, atk.range]
    .filter(Boolean).join(" · ");
  const description = atk.description ? `<details class="hk-description"><summary>Effet</summary>${atk.description}</details>` : "";
  return sendCard(actor, { title: item.name, subtitle, body: rows.join("") + description, rolls });
}

/* -------------------------------------------- */
/*  Actions des cartes de chat                  */
/* -------------------------------------------- */

async function applyDamage(button) {
  const actor = await fromUuid(button.dataset.uuid);
  if ( !actor ) return;
  if ( !actor.isOwner ) {
    ui.notifications.warn("Seul le propriétaire de la cible ou le MJ peut appliquer ces dégâts.");
    return;
  }
  const amount = Number(button.dataset.amount);
  await actor.update({ "system.vit.value": Math.max(actor.system.vit.value - amount, 0) });
  ui.notifications.info(`${actor.name} perd ${amount} VIT.`);
}

/** Branche les boutons des cartes Hakai Kousen. */
export function onRenderChatMessage(message, html) {
  html.querySelectorAll("[data-hk-action=applyDamage]").forEach(button => {
    button.addEventListener("click", () => applyDamage(button));
  });
}
