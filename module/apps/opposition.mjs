/**
 * Tests en opposition (Manuel du Joueur 2.6) :
 * - Caractéristiques : si un seul réussit, il l'emporte ; si les deux échouent, personne ne prend l'avantage ;
 *   si les deux réussissent, la meilleure marge (score − résultat) l'emporte.
 * - Compétences / Connaissances : le meilleur résultat l'emporte ; à égalité, on compare le deuxième dé, puis le suivant.
 */
const { DialogV2 } = foundry.applications.api;
const esc = text => Handlebars.escapeExpression(text ?? "");

/** Tests possibles pour un acteur : Caractéristiques, puis domaines (Dresseur) ou Compétences Pokémon. */
function testsOf(actor, mode) {
  const { ATTRIBUTES, SKILLS, KNOWLEDGES } = CONFIG.HK;
  if ( mode === "attribute" ) {
    return Object.entries(ATTRIBUTES).map(([k, a]) => ({
      key: k, label: a.label,
      value: actor.type === "pokemon" ? actor.system.stats[k].value : actor.system.attributes[k].value
    }));
  }
  if ( actor.type === "pokemon" ) return actor.itemTypes.pokeskill.map(i => ({ key: i.id, label: i.name, level: i.system.level }));
  const domains = (group, labels) => Object.entries(labels).map(([k, label]) => ({
    key: `${group}.${k}`, label, level: actor.system[group][k].level, spec: actor.system[group][k].spec
  }));
  return [...domains("skills", SKILLS), ...domains("knowledges", KNOWLEDGES)];
}

/** Lance un côté de l'opposition. */
async function rollSide(actor, test, mode, faces) {
  if ( mode === "attribute" ) {
    const roll = await new foundry.dice.Roll(`1d${faces}`).evaluate();
    const success = roll.total <= test.value;
    return { roll, success, margin: test.value - roll.total,
      text: `${test.label} ${test.value} · 1D${faces} = ${roll.total} → ${success ? `réussite (marge ${test.value - roll.total})` : "échec"}` };
  }
  const level = test.level;
  const roll = await new foundry.dice.Roll(level > 0 ? `${level}d10` : "2d10").evaluate();
  const values = roll.dice[0].results.map(r => r.result);
  // Niveau 0 : on garde le moins bon ; à égalité, on compare ensuite l'autre dé.
  const ordered = level > 0 ? [...values].sort((a, b) => b - a) : [...values].sort((a, b) => a - b);
  return { roll, ordered,
    text: `${test.label} niv. ${level}${test.spec ? ` (${esc(test.spec)})` : ""} · ${values.join(", ")} → résultat ${ordered[0]}` };
}

/** Compare deux suites de dés : le meilleur résultat, puis le deuxième, puis le suivant. */
function comparePools(a, b) {
  for ( let i = 0; i < Math.max(a.length, b.length); i++ ) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if ( x !== y ) return x > y ? 1 : -1;
  }
  return 0;
}

export async function openOpposition() {
  const actors = game.actors.filter(a => ["trainer", "pokemon"].includes(a.type)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  if ( actors.length < 2 ) return ui.notifications.warn("Il faut au moins deux personnages ou Pokémon.");
  const onScene = new Set(canvas.ready ? canvas.tokens.placeables.map(t => t.actor?.id) : []);
  const options = selected => actors.map(a => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}${onScene.has(a.id) ? " ●" : ""}</option>`).join("");
  const controlled = canvas.ready ? canvas.tokens.controlled.map(t => t.actor?.id).filter(Boolean) : [];
  const first = await DialogV2.prompt({
    window: { title: "Test en opposition", icon: "fa-solid fa-scale-balanced" },
    position: { width: 440 },
    content: `<p class="hint">Deux personnages tentent de prendre l'avantage l'un sur l'autre (2.6). ● : présent sur la scène.</p>
      <div class="form-group"><label>Premier</label><div class="form-fields"><select name="a">${options(controlled[0])}</select></div></div>
      <div class="form-group"><label>Second</label><div class="form-fields"><select name="b">${options(controlled[1] ?? actors.find(a => a.id !== controlled[0])?.id)}</select></div></div>
      <div class="form-group"><label>Type de test</label><div class="form-fields"><select name="mode">
        <option value="attribute">Caractéristique (1D6 ou plus ≤ score)</option>
        <option value="pool">Compétence / Connaissance (réserve de D10)</option></select></div></div>`,
    ok: { label: "Suivant", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !first ) return;
  const sides = [game.actors.get(first.a), game.actors.get(first.b)];
  if ( !sides[0] || !sides[1] || (sides[0] === sides[1]) ) return ui.notifications.warn("Choisissez deux participants différents.");
  const mode = first.mode;
  const lists = sides.map(a => testsOf(a, mode));
  if ( lists.some(l => !l.length) ) return ui.notifications.warn("Un participant n'a aucun test de ce type (un Pokémon doit posséder la Compétence).");
  const { ATTRIBUTE_DIFFICULTIES } = CONFIG.HK;
  const sideFields = (actor, list, i) => `<fieldset><legend>${esc(actor.name)}</legend>
    <div class="form-group"><label>Test</label><div class="form-fields"><select name="test${i}">
      ${list.map((t, k) => `<option value="${k}">${esc(t.label)}${mode === "attribute" ? ` (${t.value})` : ` (niv. ${t.level})`}</option>`).join("")}</select></div></div>
    ${mode === "attribute" ? `<div class="form-group"><label>Difficulté</label><div class="form-fields"><select name="die${i}">
      ${Object.entries(ATTRIBUTE_DIFFICULTIES).map(([f, l]) => `<option value="${f}">${l}</option>`).join("")}</select></div></div>` : ""}</fieldset>`;
  const second = await DialogV2.prompt({
    window: { title: "Test en opposition", icon: "fa-solid fa-scale-balanced" },
    position: { width: 440 },
    content: sideFields(sides[0], lists[0], 0) + sideFields(sides[1], lists[1], 1),
    ok: { label: "Lancer", icon: "fa-solid fa-dice", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if ( !second ) return;

  const results = [];
  for ( const i of [0, 1] ) results.push(await rollSide(sides[i], lists[i][Number(second[`test${i}`])], mode, Number(second[`die${i}`]) || 6));
  let winner = null;
  let verdict;
  if ( mode === "attribute" ) {
    const [a, b] = results;
    if ( a.success !== b.success ) winner = a.success ? 0 : 1;
    else if ( !a.success ) verdict = "Les deux échouent : personne ne prend immédiatement l'avantage, le MJ décide de la suite.";
    else if ( a.margin !== b.margin ) winner = a.margin > b.margin ? 0 : 1;
    else verdict = "Mêmes marges : égalité, le MJ tranche.";
  }
  else {
    const cmp = comparePools(results[0].ordered, results[1].ordered);
    if ( cmp ) winner = cmp > 0 ? 0 : 1;
    else verdict = "Égalité parfaite sur tous les dés : le MJ tranche.";
  }
  if ( winner !== null ) verdict = `<strong>${esc(sides[winner].name)}</strong> remporte l'opposition.`;
  return ChatMessage.implementation.create({
    speaker: { alias: "Opposition" },
    rolls: results.map(r => r.roll),
    content: `<div class="hk-card"><header><h3>Test en opposition</h3>
      <span class="subtitle">${mode === "attribute" ? "Caractéristiques" : "Compétences / Connaissances"}</span></header>
      ${results.map((r, i) => `<p class="hk-detail"><strong>${esc(sides[i].name)}</strong> : ${r.text}</p>`).join("")}
      <div class="hk-outcome ${winner !== null ? "success" : "failure"}">${verdict}</div></div>`
  });
}
