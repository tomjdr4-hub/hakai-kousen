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
    <table><thead><tr><th>Jour</th><th>Période</th><th>Activité</th><th>Participants</th><th>Objectif</th><th>Résultat</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>
    <h2>Suivi des objectifs</h2>
    <table><thead><tr><th>Objectif</th><th>Pokémon</th><th>Progression</th><th>Bilan</th></tr></thead>
    <tbody>${"<tr><td></td><td></td><td></td><td></td></tr>".repeat(4)}</tbody></table>
    <p><em>Préciser ce qui est travaillé et comment (« J'entraîne mon Pokémon » est trop vague). Laisser du temps pour dormir, manger,
    se soigner et récupérer l'ENE. Sessions de jeu : Confiance ; Sessions d'entraînement : Obéissance, Compétences, attaques.</em></p>`;
}

export async function openPlanning() {
  const trainers = game.actors.filter(a => (a.type === "trainer") && a.hasPlayerOwner);
  if ( !trainers.length ) return ui.notifications.warn("Aucun Dresseur de joueur.");
  const days = await DialogV2.prompt({
    window: { title: "Planning des temps en off", icon: "fa-solid fa-calendar-days" },
    content: `<div class="form-group"><label>Nombre de jours</label><div class="form-fields"><input type="number" name="days" value="3" min="1" max="14"></div>
      <p class="hint">Une page par Dresseur de joueur, une ligne par demi-journée (MJ 6.4).</p></div>`,
    ok: { label: "Créer le journal", callback: (e, b) => Math.clamp(Number(b.form.elements.days.value) || 3, 1, 14) },
    rejectClose: false
  });
  if ( !days ) return;
  const entry = await JournalEntry.implementation.create({
    name: `Planning des temps en off (${new Date().toLocaleDateString("fr-FR")})`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    pages: trainers.map((t, i) => ({ name: t.name, type: "text", sort: i, text: { content: plan(t, days) } }))
  });
  entry.sheet.render(true);
}
