/**
 * Relancer un dé (Manuel du Joueur 3.12) : 1 XP Dresseur pour relancer n'importe quel dé ;
 * le nouveau résultat remplace obligatoirement l'ancien, même s'il est moins favorable.
 */
import { trainerOf } from "./combat/effects.mjs";

const { DialogV2 } = foundry.applications.api;
const SCOPE = "hakai-kousen";

/** Dresseur qui paie la relance : le Dresseur lui-même, ou celui du Pokémon. */
function payer(message) {
  const actor = ChatMessage.implementation.getSpeakerActor(message.speaker);
  if ( !actor ) return null;
  return actor.type === "trainer" ? actor : trainerOf(actor);
}

/** Tous les dés d'un message : jet, terme, résultat. */
function listDice(message) {
  const info = message.getFlag(SCOPE, "dice") ?? [];
  const entries = [];
  message.rolls.forEach((roll, r) => {
    roll.dice.forEach((die, d) => {
      die.results.forEach((res, k) => {
        const label = info[r]?.label ?? `Jet ${r + 1} (${roll.formula})`;
        const several = die.results.length > 1 ? ` · dé ${k + 1}` : "";
        entries.push({ r, d, k, faces: die.faces, value: res.result, label: `${label}${several} : D${die.faces} = ${res.result}` });
      });
    });
  });
  return entries;
}

/** Nouveau verdict quand le rôle du jet est connu (test, réserve, toucher, D100 de statut). */
function verdict(info, roll, die, k, value) {
  if ( !info ) return null;
  if ( info.kind === "attribute" ) {
    return value <= info.value ? { ok: true, text: `Réussite (marge ${info.value - value})` } : { ok: false, text: "Échec" };
  }
  if ( info.kind === "d100" ) {
    return value <= info.max ? { ok: true, text: "Touché" } : { ok: false, text: "Raté" };
  }
  if ( info.kind === "hit" ) {
    if ( info.threshold === null ) return { ok: value === 10, text: `Nouveau dé : ${value} (comparez à la Table unique)` };
    const hit = (value === 10) || ((value + (info.hitBonus ?? 0)) >= info.threshold);
    return { ok: hit, text: hit ? (value === 10 ? "Touché ! Réussite exceptionnelle (critique)" : "Touché") : "Raté",
      note: `Seuil ${info.threshold}+${info.hitBonus ? ` (dé +${info.hitBonus})` : ""}.` };
  }
  if ( info.kind === "pool" ) {
    const values = die.results.map((res, i) => (i === k ? value : res.result));
    const result = info.level > 0 ? Math.max(...values) : Math.min(...values);
    const kept = `${info.level > 0 ? "meilleur" : "moins bon"} résultat : ${result}`;
    if ( result === 1 ) return { ok: false, text: "Échec critique", note: kept };
    if ( !info.threshold ) return { ok: true, text: `Résultat : ${result}`, note: kept };
    if ( result < info.threshold ) return { ok: false, text: "Échec", note: kept };
    return { ok: true, text: ((result === 10) && (info.threshold < 10)) ? "Réussite critique" : "Réussite", note: kept };
  }
  return null;
}

/**
 * Relance un dé d'un message contre 1 XP Dresseur.
 * @param {ChatMessage} message
 */
export async function rerollDie(message) {
  const trainer = payer(message);
  if ( !trainer ) return ui.notifications.warn("Aucun Dresseur pour payer la relance : le jet doit venir d'un Dresseur ou d'un Pokémon de son équipe.");
  if ( !trainer.isOwner ) return ui.notifications.warn(`Seul le joueur de ${trainer.name} peut dépenser son XP.`);
  if ( trainer.system.xp.value < 1 ) return ui.notifications.warn(`${trainer.name} n'a plus d'XP Dresseur.`);
  const entries = listDice(message);
  if ( !entries.length ) return;

  const options = entries.map((e, i) => `<label class="checkbox"><input type="radio" name="die" value="${i}" ${i === 0 ? "checked" : ""}> ${e.label}</label>`).join("");
  const index = await DialogV2.prompt({
    window: { title: "Relancer un dé", icon: "fa-solid fa-rotate" },
    content: `<p>Dépenser <strong>1 XP Dresseur</strong> de ${trainer.name} (reste ${trainer.system.xp.value}) pour relancer un dé.
      Le nouveau résultat remplace obligatoirement l'ancien, même s'il est moins bon (3.12).</p>
      <fieldset><legend>Dé à relancer</legend>${options}</fieldset>`,
    ok: { label: "Relancer (1 XP)", icon: "fa-solid fa-rotate", callback: (e, b) => Number(b.form.querySelector("input[name=die]:checked")?.value ?? 0) },
    rejectClose: false
  });
  if ( (index === null) || (index === undefined) ) return;
  const entry = entries[index];
  if ( trainer.system.xp.value < 1 ) return;

  const roll = await new foundry.dice.Roll(`1d${entry.faces}`).evaluate();
  await trainer.update({ "system.xp.value": trainer.system.xp.value - 1 });
  const info = (message.getFlag(SCOPE, "dice") ?? [])[entry.r];
  const die = message.rolls[entry.r].dice[entry.d];
  const result = verdict(info, message.rolls[entry.r], die, entry.k, roll.total);
  const outcome = result
    ? `<div class="hk-outcome ${result.ok ? "success" : "failure"}">${result.text}</div>${result.note ? `<p class="hk-detail">${result.note}</p>` : ""}`
    : `<p class="hk-detail">Relisez le jet d'origine avec ce nouveau résultat.</p>`;
  const followUp = (info?.kind === "hit") || (info?.kind === "d100")
    ? `<p class="hint">Si l'issue change, le MJ corrige les dégâts ou les effets déjà appliqués (ou les lance s'ils ne l'avaient pas été).</p>` : "";
  await ChatMessage.implementation.create({
    speaker: message.speaker,
    rolls: [roll],
    flags: { [SCOPE]: { reroll: true } },
    content: `<div class="hk-card"><header><h3>Relance d'un dé</h3><span class="subtitle">${trainer.name} : −1 XP Dresseur</span></header>
      <p class="hk-detail">${entry.label.replace(/ = \d+$/, "")} : ${entry.value} → <strong>${roll.total}</strong></p>
      ${outcome}${followUp}</div>`
  });
}

/** Bouton de relance sur les cartes de jet, pour le propriétaire du Dresseur (et le MJ). */
export function addRerollButton(message, html) {
  if ( !message.rolls.length || message.getFlag(SCOPE, "reroll") ) return;
  const card = html.querySelector(".hk-card");
  if ( !card || card.querySelector(".hk-reroll") ) return;
  const trainer = payer(message);
  if ( !trainer?.isOwner ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hk-reroll";
  button.dataset.tooltip = `Relancer un dé pour 1 XP Dresseur de ${trainer.name} (3.12)`;
  button.innerHTML = `<i class="fa-solid fa-rotate"></i> Relancer un dé (1 XP)`;
  button.addEventListener("click", event => {
    event.preventDefault();
    rerollDie(message);
  });
  card.append(button);
}
