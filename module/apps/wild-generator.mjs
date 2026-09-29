/**
 * Générateur de Pokémon sauvages (Manuel du MJ 5.1, 7.4 ; Manuel du Joueur 4.5, 4.8) :
 * espèce du Pokédex, profil, Nature tirée au D100, Talent de l'espèce, IV répartis au hasard,
 * Compétence initiale et attaque inhabituelle (1D10), intention et condition de retrait.
 */
import { NATURES, RARITIES, WILD_PROFILES } from "../config.mjs";

const { DialogV2 } = foundry.applications.api;
const IV_STATS = ["dex", "for", "con", "end", "vol", "vit", "ene"];
const NATURE_ORDER = Object.keys(NATURES);
const INITIAL_SKILL = [
  [1, "aucune"], [4, "une Compétence Standard"], [8, "une Compétence Intermédiaire"],
  [9, "une Compétence Rare (de préférence Résistance : Type)"], [10, "une Compétence Rare (de préférence Augmentation : Type)"]
];

async function d(faces) {
  return (await new foundry.dice.Roll(`1d${faces}`).evaluate()).total;
}

/** Dossier « Pokémon sauvages » des acteurs. */
async function wildFolder() {
  return game.folders.find(f => (f.type === "Actor") && (f.name === "Pokémon sauvages"))
    ?? Folder.implementation.create({ name: "Pokémon sauvages", type: "Actor", color: "#3fa129" });
}

export async function openWildGenerator() {
  const pack = game.packs.get("hakai-kousen.pokedex");
  if ( !pack ) return ui.notifications.error("Compendium Pokédex introuvable.");
  const index = await pack.getIndex({ fields: ["system.number"] });
  const species = [...index].sort((a, b) => (a.system?.number ?? "").localeCompare(b.system?.number ?? ""));
  const options = obj => Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.label ?? v}</option>`).join("");
  const content = `
    <div class="form-group"><label>Espèce</label><div class="form-fields">
      <input type="text" name="species" list="hk-species" placeholder="Nom ou numéro" required>
      <datalist id="hk-species">${species.map(s => `<option value="${s.name}">${s.system?.number ?? ""}</option>`).join("")}</datalist>
    </div></div>
    <div class="form-group"><label>Nombre</label><div class="form-fields"><input type="number" name="count" value="1" min="1" max="12"></div></div>
    <div class="form-group"><label>Profil</label><div class="form-fields"><select name="profile">${options(WILD_PROFILES)}</select></div></div>
    <div class="form-group"><label>Points d'IV</label><div class="form-fields"><input type="number" name="iv" value="" min="0" placeholder="selon le profil"></div>
      <p class="hint">Répartis au hasard sur DEX, FOR, CON, END, VOL, VIT et ENE. Les manuels ne chiffrent pas les profils : ajustez librement.</p></div>
    <div class="form-group"><label>Rareté</label><div class="form-fields"><select name="rarity">${options(RARITIES)}</select></div></div>
    <div class="form-group"><label>Particularités</label><div class="form-fields">
      <label class="checkbox"><input type="checkbox" name="aberrant"> Aberrant</label>
      <label class="checkbox"><input type="checkbox" name="shiny"> Chromatique</label>
      <label class="checkbox"><input type="checkbox" name="hidden"> Talent caché possible</label>
    </div></div>
    <div class="form-group"><label>Tirages</label><div class="form-fields">
      <label class="checkbox"><input type="checkbox" name="rollSkill" checked> Compétence initiale (1D10)</label>
      <label class="checkbox"><input type="checkbox" name="rollAttack" checked> Attaque inhabituelle (1D10)</label>
    </div></div>
    <div class="form-group"><label>Intention</label><div class="form-fields"><input type="text" name="intention" placeholder="Défendre son territoire, se nourrir…"></div></div>
    <div class="form-group"><label>Condition de retrait</label><div class="form-fields"><input type="text" name="retreat" placeholder="Fuit à ¼ de VIT…"></div></div>
    <div class="form-group"><label>Placer sur la scène</label><div class="form-fields"><input type="checkbox" name="place" ${canvas.ready ? "checked" : "disabled"}></div></div>`;

  const data = await DialogV2.prompt({
    window: { title: "Générer des Pokémon sauvages", icon: "fa-solid fa-paw" },
    position: { width: 520 },
    content,
    ok: {
      label: "Générer",
      icon: "fa-solid fa-dice",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    },
    rejectClose: false
  });
  if ( !data ) return;

  const query = String(data.species ?? "").trim().toLowerCase();
  const entry = species.find(s => (s.name.toLowerCase() === query) || (s.system?.number === query.padStart(3, "0")));
  if ( !entry ) return ui.notifications.warn(`Espèce introuvable dans le Pokédex : ${data.species}`);
  return generateWild(await pack.getDocument(entry._id), data);
}

/**
 * Crée un ou plusieurs Pokémon sauvages à partir d'une espèce du Pokédex.
 * @param {Actor} source  Espèce du compendium
 * @param {object} data   Options du formulaire
 */
export async function generateWild(source, data) {
  const profile = WILD_PROFILES[data.profile] ?? WILD_PROFILES.ordinaire;
  const ivPoints = Number.isNumeric(data.iv) ? Number(data.iv) : profile.iv;
  const count = Math.clamp(Number(data.count) || 1, 1, 12);
  const folder = await wildFolder();
  const created = [];
  const lines = [];

  for ( let n = 1; n <= count; n++ ) {
    const actorData = game.actors.fromCompendium(source);
    const system = actorData.system;

    // Nature : D100, chaque Nature occupe quatre résultats (4.5).
    const natureRoll = await d(100);
    system.nature = NATURE_ORDER[Math.floor((natureRoll - 1) / 4)];

    // IV répartis au hasard.
    for ( let i = 0; i < ivPoints; i++ ) system.stats[IV_STATS[(await d(IV_STATS.length)) - 1]].iv += 1;

    // Talent de l'espèce : tiré parmi les talents disponibles (le talent caché seulement si autorisé).
    const talents = system.speciesData.talents.filter(t => data.hidden || !t.hidden);
    const talent = talents.length ? talents[(await d(talents.length)) - 1] : null;
    const items = actorData.items ?? [];
    if ( talent?.uuid ) {
      const talentDoc = await fromUuid(talent.uuid);
      if ( talentDoc ) items.push(game.items.fromCompendium(talentDoc));
    }
    actorData.items = items;

    // Réserves pleines : VIT et ENE maximales avec les IV.
    const vitMax = system.stats.vit.base + (system.stats.vit.iv * 2);
    const eneMax = system.stats.ene.base + (system.stats.ene.iv * 3);
    system.vit = { value: vitMax, max: vitMax };
    system.ene = { value: eneMax, max: eneMax };

    system.encounter = {
      rarity: data.rarity ?? "commun",
      dominant: !!profile.dominant,
      aberrant: !!data.aberrant,
      shiny: !!data.shiny,
      intention: data.intention ?? "",
      retreat: data.retreat ?? ""
    };

    const notes = [];
    if ( data.rollSkill ) {
      const r = await d(10);
      const result = INITIAL_SKILL.find(([max]) => r <= max)[1];
      notes.push(`Compétence initiale (1D10 = ${r}) : ${result}.`);
    }
    if ( data.rollAttack ) {
      const r = await d(10);
      notes.push(`Attaque inhabituelle (1D10 = ${r}) : ${r >= 8 ? "oui, à choisir (CT, reproduction, Maître de Capacités…)" : "aucune"}.`);
    }
    system.notes = notes.map(n => `<p>${n}</p>`).join("");

    actorData.name = count > 1 ? `${source.name} ${n}` : source.name;
    actorData.folder = folder.id;
    actorData.prototypeToken = { ...(actorData.prototypeToken ?? {}), name: actorData.name, actorLink: false,
      disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE };
    created.push(actorData);
    lines.push(`<li><strong>${actorData.name}</strong> : ${NATURES[system.nature].label}${talent ? `, ${talent.name}` : ""}${notes.length ? ` · ${notes.join(" ")}` : ""}</li>`);
  }

  const actors = await Actor.implementation.createDocuments(created);
  if ( data.place && canvas.ready ) {
    const size = canvas.grid.size;
    const center = canvas.stage.pivot;
    const tokens = [];
    for ( const [i, actor] of actors.entries() ) {
      const doc = await actor.getTokenDocument({ x: center.x + ((i - (actors.length / 2)) * size), y: center.y });
      tokens.push(doc.toObject());
    }
    await canvas.scene.createEmbeddedDocuments("Token", tokens);
  }
  await ChatMessage.implementation.create({
    speaker: { alias: "Pokémon sauvages" },
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="hk-card"><header><h3>${count} ${source.name} (${profile.label})</h3>
      <span class="subtitle">${ivPoints} point(s) d'IV chacun</span></header><ul>${lines.join("")}</ul></div>`
  });
  return actors;
}
