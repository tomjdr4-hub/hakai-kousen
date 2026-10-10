/**
 * Planning des temps en off (Manuel du MJ 6.4 à 6.6 ; aide « Planning des temps en off ») :
 * un journal avec une page par Dresseur, une ligne par demi-journée, et le suivi des objectifs.
 */
const { DialogV2 } = foundry.applications.api;

function plan(trainer, days) {
  const team = trainer.system.team.map(u => fromUuidSync(u)?.name).filter(Boolean).join(", ");
  const rows = [];
  for ( let d = 1; d <= days; d++ ) {
    for ( const period of ["Matin", "Après-midi", "Soirée"] ) {
      rows.push(`<tr><td>Jour ${d}</td><td>${period}</td><td></td><td></td><td></td><td></td></tr>`);
    }
  }
  return `<p><strong>Équipe :</strong> ${team || "—"}</p>
    <p><em>Exemple : Matin — Entraînement — Salamèche — apprendre Esquive (2/10) — progrès validé par le MJ.</em></p>
    <table><thead><tr><th>Jour</th><th>Période</th><th>Activité</th><th>Participants</th><th>Objectif</th><th>Résultat</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>
    <h2>Suivi des objectifs</h2>
    <table><thead><tr><th>Objectif</th><th>Pokémon</th><th>Progression</th><th>Bilan</th></tr></thead>
    <tbody>${"<tr><td></td><td></td><td></td><td></td></tr>".repeat(4)}</tbody></table>
    <p><em>Préciser ce qui est travaillé et comment (« J'entraîne mon Pokémon » est trop vague). Laisser du temps pour dormir, manger,
    se soigner et récupérer l'ENE. Sessions de jeu : Confiance ; Sessions d'entraînement : Obéissance, Compétences, attaques.</em></p>`;
}

/**
 * Crée le journal de planning. Les Dresseurs de joueurs sont cochés par défaut ; tous les Dresseurs peuvent être choisis.
 */
export async function openPlanning() {
  const trainers = game.actors.filter(a => a.type === "trainer");
  if ( !trainers.length ) return ui.notifications.warn("Aucun Dresseur dans le monde.");
  const anyPlayer = trainers.some(t => t.hasPlayerOwner);
  const data = await DialogV2.prompt({
    window: { title: "Planning des temps en off", icon: "fa-solid fa-calendar-days" },
    position: { width: 480 },
    content: `<p>Les <strong>temps en off</strong> sont les périodes entre deux scènes d'aventure (séjour en ville, voyage calme, ellipse de quelques jours).
      Chaque joueur y note ce que fait son Dresseur, <strong>demi-journée par demi-journée</strong> : entraîner un Pokémon, travailler, jouer avec lui,
      se soigner… Le MJ s'en sert pour décider des progrès (Compétences, Confiance, Obéissance), des revenus et des imprévus (Manuel du MJ 6.4 à 6.6).</p>
      <p class="hint">Résultat : un journal avec une page par Dresseur, à remplir pendant la séance.</p>
      <fieldset><legend>Dresseurs</legend>
        ${trainers.map(t => `<label class="checkbox"><input type="checkbox" name="trainer" value="${t.id}" ${(t.hasPlayerOwner || !anyPlayer) ? "checked" : ""}> ${t.name}</label>`).join("")}
      </fieldset>
      <div class="form-group"><label>Nombre de jours</label><div class="form-fields"><input type="number" name="days" value="3" min="1" max="14"></div></div>`,
    ok: {
      label: "Créer le journal",
      icon: "fa-solid fa-book-open",
      callback: (e, b) => ({
        days: Math.clamp(Number(b.form.elements.days.value) || 3, 1, 14),
        ids: [...b.form.querySelectorAll("input[name=trainer]:checked")].map(i => i.value)
      })
    },
    rejectClose: false
  });
  if ( !data ) return;
  if ( !data.ids.length ) return ui.notifications.warn("Cochez au moins un Dresseur.");
  const chosen = data.ids.map(id => game.actors.get(id)).filter(Boolean);
  const entry = await JournalEntry.implementation.create({
    name: `Temps en off (${new Date().toLocaleDateString("fr-FR")})`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    pages: chosen.map((t, i) => ({ name: t.name, type: "text", sort: i, text: { content: plan(t, data.days) } }))
  });
  ui.notifications.info(`Journal « ${entry.name} » créé dans l'onglet Journal.`);
  entry.sheet.render(true);
}
