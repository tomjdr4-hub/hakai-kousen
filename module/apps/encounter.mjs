/**
 * Rencontre en un clic (Manuel du MJ 4.5, 4.6) : tirage sur une table de zone, relance de l'espèce sur un 100
 * (chromatique), lecture du résultat (nombre, Dominant, Aberrant, événement) et génération des Pokémon sauvages.
 */
import { generateWild } from "./wild-generator.mjs";

const { DialogV2 } = foundry.applications.api;
const EVENT = /^(ÉVÉNEMENT|EVENEMENT|HORDE|NID|BRACONNIERS)\b/i;

function resultText(result) {
  return (result?.name || result?.description || result?.text || "").replace(/<[^>]+>/g, "").trim();
}

/** Espèces du Pokédex citées dans le texte (« Pichu ou Toudoudou » : les deux). */
function findAllSpecies(text, index) {
  const lower = text.toLowerCase();
  return [...index].filter(e => new RegExp(`(^|[^a-zà-ÿ])${e.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ÿ]|$)`).test(lower));
}

function findSpecies(text, index) {
  return findAllSpecies(text, index)[0] ?? null;
}

export async function rollEncounter() {
  const pack = game.packs.get("hakai-kousen.tables");
  const packTables = pack ? [...await pack.getIndex()].map(e => ({ uuid: e.uuid, name: `${e.name} (compendium)` })) : [];
  const tables = [...game.tables.map(t => ({ uuid: t.uuid, name: t.name })), ...packTables];
  if ( !tables.length ) return ui.notifications.warn("Aucune table aléatoire.");
  const uuid = await DialogV2.prompt({
    window: { title: "Rencontre", icon: "fa-solid fa-dice-d20" },
    content: `<div class="form-group"><label>Table de zone</label><div class="form-fields"><select name="table">
      ${tables.map(t => `<option value="${t.uuid}">${t.name}</option>`).join("")}</select></div>
      <p class="hint">Sur un 100, l'espèce chromatique est relancée sur la même table (MJ 4.5).</p></div>`,
    ok: { label: "Tirer", icon: "fa-solid fa-dice-d20", callback: (e, b) => b.form.elements.table.value },
    rejectClose: false
  });
  if ( !uuid ) return;
  const table = await fromUuid(uuid);
  const pokedex = game.packs.get("hakai-kousen.pokedex");
  const index = pokedex ? await pokedex.getIndex() : [];

  let draw = await table.draw({ displayChat: true });
  let text = resultText(draw.results[0]);
  let shiny = false;
  // 100 naturel : relancer jusqu'à obtenir une espèce ordinaire.
  if ( (draw.roll?.total === 100) || /chromatique/i.test(text) ) {
    shiny = true;
    for ( let i = 0; i < 20; i++ ) {
      draw = await table.draw({ displayChat: true });
      text = resultText(draw.results[0]);
      if ( (draw.roll?.total !== 100) && !EVENT.test(text) && !/dominant|aberrant|chromatique/i.test(text) && findSpecies(text, index) ) break;
    }
  }

  const found = findAllSpecies(text, index);
  const event = EVENT.test(text);
  if ( !found.length ) {
    return ui.notifications.info(event ? "Événement : à mettre en scène (aucune espèce à générer)." : "Aucune espèce du Pokédex reconnue dans ce résultat.");
  }
  const dice = text.match(/(\d*)\s*d\s*(\d+)/i);
  let count = 1;
  if ( dice ) count = (await new foundry.dice.Roll(`${dice[1] || 1}d${dice[2]}`).evaluate()).total;
  const dominant = /dominant/i.test(text);
  const aberrant = /aberrant/i.test(text);
  const chosenId = await DialogV2.prompt({
    window: { title: "Générer la rencontre" },
    content: `<p><strong>${text}</strong></p>
      <div class="form-group"><label>Espèce</label><div class="form-fields"><select name="species">
        ${found.map(e => `<option value="${e._id}">${e.name}</option>`).join("")}</select></div></div>
      <p>${count} Pokémon${dominant ? " (Dominant)" : ""}${aberrant ? " (Aberrant)" : ""}${shiny ? ", chromatique" : ""}, placés sur la scène.</p>
      ${event ? `<p class="hint">C'est un événement : le MJ décide si les Pokémon combattent, fuient ou demandent de l'aide.</p>` : ""}`,
    ok: { label: "Générer", callback: (e, b) => b.form.elements.species.value },
    rejectClose: false
  });
  if ( !chosenId ) return;
  const species = found.find(e => e._id === chosenId);
  return generateWild(await pokedex.getDocument(species._id), {
    count, profile: dominant ? "dominant" : "ordinaire", rarity: "commun", aberrant, shiny, hidden: false,
    rollSkill: true, rollAttack: true, intention: "", retreat: "", place: canvas.ready
  });
}
