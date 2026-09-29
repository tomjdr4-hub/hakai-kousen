/**
 * Début du tour d'un combattant (Manuel du Joueur 5.9, 5.10, 4.16) : dégâts périodiques,
 * jets de Paralysie, Gel et Confusion, Apeuré, blessure grave. Exécuté par le MJ actif.
 */
import { STATUSES } from "../config.mjs";
import { applyDamage, currentCombatType, syncCounters } from "./effects.mjs";

const SCOPE = "hakai-kousen";

/** Seuil de sortie de la Confusion selon le stade : 10, puis 8-10, puis 6-10. */
const CONFUSION_EXIT = { 1: 10, 2: 8, 3: 6 };

async function d10() {
  return (await new foundry.dice.Roll("1d10").evaluate()).total;
}

/**
 * Applique les effets de début de tour du combattant actif, une seule fois par tour.
 * @param {Combat} combat
 */
export async function processTurnStart(combat) {
  const combatant = combat.combatant;
  const actor = combatant?.actor;
  if ( !actor || (combat.phase?.state !== "resolution") ) return;
  const key = `${combat.round}-${combatant.id}`;
  if ( combat.getFlag(SCOPE, "turnStart") === key ) return;
  await combat.setFlag(SCOPE, "turnStart", key);
  if ( combatant.isKO && !actor.statuses.has("blessure") ) return;

  const lines = [];
  let blocked = null;
  const max = actor.system.vit.max;
  const hurt = async (amount, label) => {
    amount = Math.max(amount, 1);
    lines.push(`${label} : −${amount} VIT`);
    await applyDamage(actor, amount);
  };

  // Blessure grave : VIT négative, −1 par tour jusqu'à stabilisation (hors combat officiel).
  if ( actor.statuses.has("blessure") && (actor.system.vit.value < 0) && (currentCombatType() !== "officiel") ) {
    await hurt(1, "Blessure grave");
  }
  if ( combatant.isKO ) return report(combatant, lines, null);

  if ( actor.statuses.has("brulure") ) await hurt(Math.floor(max / 20), "Brûlure");
  if ( actor.statuses.has("poison") ) await hurt(Math.floor(max / 10), "Poison");
  if ( actor.statuses.has("toxik") ) {
    const turn = Math.max(actor.system.conditions?.toxik ?? 1, 1);
    await hurt(Math.max(Math.floor(max / 20), 1) * turn, `Toxik (tour ${turn}, ×${turn})`);
    await actor.update({ "system.conditions.toxik": turn + 1 });
  }
  if ( actor.statuses.has("malediction") ) await hurt(Math.floor(max / 4), "Malédiction");
  if ( actor.statuses.has("vampigraine") ) {
    const amount = Math.max(Math.floor(max / 8), 1);
    await hurt(amount, "Vampigraine");
    lines.push(`<em>Le lanceur de Vampigraine récupère ${amount} VIT.</em>`);
  }

  if ( actor.system.vit.value <= 0 ) return report(combatant, lines, "KO");

  // Ne peut pas agir.
  if ( actor.statuses.has("peur") ) {
    blocked = "Apeuré";
    await actor.toggleStatusEffect("peur", { active: false });
  }
  if ( !blocked && actor.statuses.has("gel") ) {
    const roll = await d10();
    if ( roll >= 9 ) {
      await actor.toggleStatusEffect("gel", { active: false });
      lines.push(`Gel : ${roll} sur 1D10, dégèle !`);
    }
    else {
      blocked = "Gelé";
      lines.push(`Gel : ${roll} sur 1D10, reste gelé.`);
    }
  }
  if ( !blocked && actor.statuses.has("sommeil") ) {
    lines.push(`Sommeil : appliquez la règle HK du Sommeil.`);
  }
  if ( !blocked && actor.statuses.has("paralysie") ) {
    const roll = await d10();
    if ( roll <= 3 ) blocked = "Paralysé";
    lines.push(`Paralysie : ${roll} sur 1D10${roll <= 3 ? ", ne peut pas agir" : ""}.`);
  }
  if ( !blocked && actor.statuses.has("confusion") ) {
    const stage = Math.clamp(actor.system.conditions?.confusion || 1, 1, 4);
    if ( stage > 3 ) {
      await actor.toggleStatusEffect("confusion", { active: false });
      await syncCounters(actor, "confusion", false);
      lines.push("Confusion : l'état prend fin.");
    }
    else {
      const exit = await d10();
      if ( exit >= CONFUSION_EXIT[stage] ) {
        await actor.toggleStatusEffect("confusion", { active: false });
        await syncCounters(actor, "confusion", false);
        lines.push(`Confusion : ${exit} sur 1D10 (${CONFUSION_EXIT[stage]}+), n'est plus confus !`);
      }
      else {
        await actor.update({ "system.conditions.confusion": stage + 1 });
        const self = await d10();
        if ( self <= 3 ) {
          blocked = "Se frappe dans sa confusion";
          const amount = Math.max(Math.floor(actor.system.vit.value / 10), 1);
          lines.push(`Confusion : ${exit} sur 1D10, reste confus ; ${self} : se frappe lui-même.`);
          await hurt(amount, "Confusion");
        }
        else lines.push(`Confusion : ${exit} sur 1D10, reste confus ; ${self} : agit normalement.`);
      }
    }
  }
  return report(combatant, lines, blocked);
}

/** Carte récapitulative et blocage éventuel de l'action. */
async function report(combatant, lines, blocked) {
  if ( blocked ) await combatant.setFlag(SCOPE, "blocked", { round: combatant.combat.round, reason: blocked });
  if ( !lines.length && !blocked ) return;
  const statuses = [...combatant.actor.statuses].map(s => STATUSES[s]?.label).filter(Boolean).join(", ");
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: combatant.actor }),
    content: `<div class="hk-card"><header><h3>Début du tour de ${combatant.name}</h3>
      ${statuses ? `<span class="subtitle">${statuses}</span>` : ""}</header>
      ${lines.map(l => `<p class="hk-detail">${l}</p>`).join("")}
      ${blocked ? `<div class="hk-outcome failure">${blocked} : ne peut pas agir ce tour-ci</div>` : ""}</div>`
  });
}

/** Le combattant est empêché d'agir pendant ce tour. */
export function blockedReason(combatant) {
  const blocked = combatant.getFlag(SCOPE, "blocked");
  return blocked?.round === combatant.combat?.round ? blocked.reason : null;
}
