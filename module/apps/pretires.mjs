/**
 * Fiche « Pokémon pré-tirés » (aide du MJ) : un journal imprimable qui résume les Pokémon d'une scène ou de l'équipe
 * d'un PNJ. Les valeurs inscrites sont les maximums ; VIT et ENE actuelles se suivent sur les fiches.
 */
const { DialogV2 } = foundry.applications.api;
const esc = text => Handlebars.escapeExpression(text ?? "");

/** Carte d'un Pokémon : forme, types, Talent, objet, note, statistiques et cinq attaques au plus. */
function pokemonCard(pokemon, number) {
  const { TYPES, ATTACK_CATEGORIES } = CONFIG.HK;
  const sys = pokemon.system;
  const types = [sys.types.primary, sys.types.secondary].filter(Boolean).map(t => TYPES[t] ?? t).join(" / ");
  const talent = pokemon.itemTypes.talent.map(t => t.name).join(", ") || "—";
  const held = pokemon.itemTypes.gear.find(i => i.system.quantity > 0)?.name ?? "—";
  const note = [sys.encounter?.intention, sys.encounter?.retreat ? `retrait : ${sys.encounter.retreat}` : "",
    sys.boss?.enabled ? "Boss" : "", sys.encounter?.dominant ? "Dominant" : "", sys.encounter?.aberrant ? "Aberrant" : ""]
    .filter(Boolean).join(" · ") || "—";
  const stat = k => sys.stats[k].total;
  const attacks = pokemon.itemTypes.attack.slice(0, 5).map((a, i) => {
    const s = a.system;
    const accuracy = s.sure ? "infaillible" : `${s.accuracy} %`;
    return `<p>${i + 1}. <strong>${esc(a.name)}</strong> — ${esc(TYPES[s.type] ?? s.type)}, ${esc(ATTACK_CATEGORIES[s.category] ?? "")}, `
      + `${s.energy} ENE, ${accuracy}${s.damage ? `, dégâts ${esc(s.damage)}` : ""}</p>`;
  });
  while ( attacks.length < 5 ) attacks.push(`<p>${attacks.length + 1}. ____________________</p>`);
  return `<section class="hk-pretire">
    <h2>${String(number).padStart(2, "0")} ${esc(pokemon.name)}${sys.species && (sys.species !== pokemon.name) ? ` <small>(${esc(sys.species)})</small>` : ""}</h2>
    <p><strong>Types :</strong> ${esc(types)} · <strong>Talent :</strong> ${esc(talent)} · <strong>Objet :</strong> ${esc(held)}</p>
    <p><strong>Note :</strong> ${esc(note)}</p>
    <p><strong>DEX</strong> ${stat("dex")} · <strong>FOR</strong> ${stat("for")} · <strong>CON</strong> ${stat("con")} · <strong>END</strong> ${stat("end")}
      · <strong>VOL</strong> ${stat("vol")} · <strong>VIT</strong> ${sys.vit.max} · <strong>¼ VIT</strong> ${Math.floor(sys.vit.max / 4)} · <strong>ENE</strong> ${sys.ene.max}</p>
    ${attacks.join("")}
  </section>`;
}

/**
 * Crée le journal des Pokémon pré-tirés.
 * @param {object} [options]
 * @param {Actor[]} [options.pokemon]  Pokémon déjà choisis (équipe d'un Dresseur PNJ) ; sinon une fenêtre de choix
 * @param {string} [options.title]
 */
export async function openPretires({ pokemon = null, title = "" } = {}) {
  let chosen = pokemon;
  let scene = title;
  if ( !chosen ) {
    const all = game.actors.filter(a => a.type === "pokemon");
    if ( !all.length ) return ui.notifications.warn("Aucun Pokémon dans l'onglet Acteurs.");
    const byFolder = new Map();
    for ( const p of all ) {
      const label = p.folder?.name ?? "Sans dossier";
      if ( !byFolder.has(label) ) byFolder.set(label, []);
      byFolder.get(label).push(p);
    }
    const groups = [...byFolder].map(([label, list]) => `<fieldset><legend>${esc(label)}</legend>`
      + list.map(p => `<label class="checkbox"><input type="checkbox" name="pokemon" value="${p.id}"> ${esc(p.name)}</label>`).join("")
      + `</fieldset>`).join("");
    const data = await DialogV2.prompt({
      window: { title: "Pokémon pré-tirés", icon: "fa-solid fa-print" },
      position: { width: 460 },
      content: `<p class="hint">Fiche rapide du MJ : les valeurs inscrites sont les maximums ; VIT et ENE actuelles se suivent sur les fiches.</p>
        <div class="form-group"><label>Zone / scène</label><div class="form-fields"><input type="text" name="title" placeholder="Ruines de Sévaro, Arène…"></div></div>
        <div class="hk-zones">${groups}</div>`,
      ok: {
        label: "Créer la fiche",
        icon: "fa-solid fa-print",
        callback: (e, b) => ({
          title: b.form.elements.title.value.trim(),
          ids: [...b.form.querySelectorAll("input[name=pokemon]:checked")].map(i => i.value)
        })
      },
      rejectClose: false
    });
    if ( !data ) return;
    if ( !data.ids.length ) return ui.notifications.warn("Cochez au moins un Pokémon.");
    chosen = data.ids.map(id => game.actors.get(id)).filter(Boolean);
    scene = data.title;
  }
  if ( !chosen.length ) return ui.notifications.warn("Aucun Pokémon à résumer.");
  const name = `Pokémon pré-tirés${scene ? ` : ${scene}` : ""}`;
  const content = `<p><em>Zone / scène : ${esc(scene || "—")}. Valeurs maximales ; VIT et ENE actuelles sur les fiches.</em></p>`
    + chosen.map((p, i) => pokemonCard(p, i + 1)).join("");
  const entry = await JournalEntry.implementation.create({ name, pages: [{ name, type: "text", text: { content } }] });
  ui.notifications.info(`Journal « ${name} » créé : imprimable depuis l'onglet Journal.`);
  entry.sheet.render(true);
  return entry;
}
