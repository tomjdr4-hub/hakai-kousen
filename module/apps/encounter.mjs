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

/** Table de zone : son nom commence par « Rencontres » (convention du système). */
const ZONE_NAME = /^rencontres?\b/i;
const EXAMPLE = "Rencontres : Grandes Oliveraies (exemple)";

/** Crée une table de zone dans le monde à partir de l'exemple du Manuel du MJ, et l'ouvre pour la remplir. */
export async function createZoneTable() {
  const pack = game.packs.get("hakai-kousen.tables");
  const entry = pack ? [...await pack.getIndex()].find(e => e.name === EXAMPLE) : null;
  if ( !entry ) return ui.notifications.error("Table d'exemple introuvable dans le compendium.");
  const name = await DialogV2.prompt({
    window: { title: "Nouvelle table de zone", icon: "fa-solid fa-map-location-dot" },
    content: `<div class="form-group"><label>Nom de la zone</label><div class="form-fields">
      <input type="text" name="zone" placeholder="Forêt de Jade, Route 3…" autofocus></div></div>
      <p class="hint">La table est copiée depuis l'exemple « Grandes Oliveraies » : remplacez les lignes par les Pokémon et événements de votre zone.
      Environ 74 résultats de Pokémon ordinaires, environ 25 événements répartis sur 01–99, et le 100 réservé au chromatique (MJ 4.5).</p>`,
    ok: { label: "Créer et ouvrir", callback: (e, b) => b.form.elements.zone.value.trim() || "Nouvelle zone" },
    rejectClose: false
  });
  if ( !name ) return null;
  const source = await pack.getDocument(entry._id);
  const data = game.tables.fromCompendium(source);
  data.name = `Rencontres : ${name}`;
  const table = await RollTable.implementation.create(data);
  table.sheet.render(true);
  return table;
}

/**
 * Rencontre aléatoire : 1. choisir la zone où se trouvent les personnages ; 2. le D100 est tiré sur sa table ;
 * 3. le MJ valide les Pokémon générés et placés sur la scène.
 */
export async function rollEncounter() {
  const pack = game.packs.get("hakai-kousen.tables");
  const example = pack ? [...await pack.getIndex()].find(e => e.name === EXAMPLE) : null;
  const zones = game.tables.filter(t => ZONE_NAME.test(t.name)).map(t => ({ uuid: t.uuid, name: t.name.replace(/^rencontres?\s*:?\s*/i, "") }));
  if ( example ) zones.push({ uuid: example.uuid, name: "Grandes Oliveraies (exemple du Manuel du MJ)" });

  const list = zones.map((z, i) => `<label class="hk-zone"><input type="radio" name="zone" value="${z.uuid}" ${i === 0 ? "checked" : ""}> ${z.name}</label>`).join("");
  const action = await DialogV2.wait({
    window: { title: "Rencontre aléatoire", icon: "fa-solid fa-dice-d20" },
    position: { width: 460 },
    content: `<ol class="hk-steps">
        <li>Choisissez la <strong>zone</strong> où se trouvent les personnages.</li>
        <li>Le <strong>D100</strong> est tiré sur la table de la zone (sur un 100 : Pokémon chromatique, l'espèce est relancée).</li>
        <li>Vous <strong>validez</strong> les Pokémon générés et placés sur la scène.</li>
      </ol>
      <fieldset class="hk-zones"><legend>Zone</legend>${list || "<p class='hint'>Aucune zone pour l'instant.</p>"}</fieldset>
      <p class="hint">Vos zones sont les tables du monde dont le nom commence par « Rencontres ».</p>`,
    buttons: [
      { action: "roll", label: "Tirer la rencontre", icon: "fa-solid fa-dice-d20", default: true, disabled: !zones.length,
        callback: (e, b) => b.form.querySelector("input[name=zone]:checked")?.value ?? null },
      { action: "create", label: "Créer une table de zone", icon: "fa-solid fa-plus" }
    ],
    rejectClose: false
  });
  if ( action === "create" ) return createZoneTable();
  if ( !action || (action === "roll") ) return;
  const table = await fromUuid(action);
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
