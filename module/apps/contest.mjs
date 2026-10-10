/**
 * Concours Pokémon intermédiaire (aide du MJ) : quatre épreuves notées sur 25, pénalités, classement
 * et départage (Représentation, puis Coordination du combat double).
 */
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SCOPE = "hakai-kousen";

export const CONTEST_EVENTS = [
  { key: "representation", label: "Représentation et style en duo", criteria: [
    ["styleDresseur", "Style du Dresseur", 2], ["stylePokemon", "Style des Pokémon", 2], ["theme", "Thème", 3],
    ["choregraphie", "Chorégraphie", 4], ["musique", "Musique et mise en scène", 2], ["combinaisons", "Combinaisons d'attaques", 10],
    ["originalite", "Originalité et accessoires", 2]] },
  { key: "force", label: "Démonstration de force", criteria: [
    ["mesure", "Classement mesure de force", 5], ["puissance", "Puissance apparente", 3], ["compatibilite", "Compatibilité des attaques", 3],
    ["controle", "Contrôle", 2], ["spectacle", "Spectacle produit", 2], ["obstacles", "Percée d'obstacles", 10]] },
  { key: "course", label: "Course de Rhinocorne", criteria: [
    ["classement", "Classement de la course (1re 20, 2e 15, 3e 10, 4e 5)", 20], ["relation", "Approche et relation avec la monture", 5]] },
  { key: "combat", label: "Combat double", criteria: [
    ["victoire", "Victoire (vainqueur 10, perdant 0)", 10], ["coordination", "Coordination du duo", 5], ["strategie", "Stratégie", 5],
    ["style", "Style et maîtrise", 5]] }
];

function data() {
  return foundry.utils.mergeObject({ participants: [], scores: {}, penalties: {} }, game.settings.get(SCOPE, "contest") ?? {}, { inplace: false });
}

async function save(update) {
  return game.settings.set(SCOPE, "contest", { ...data(), ...update });
}

/** Points d'une épreuve (plafonnés à 25) et total après pénalité. */
function totals(state, id) {
  const scores = state.scores[id] ?? {};
  const events = CONTEST_EVENTS.map(ev => Math.min(ev.criteria.reduce((sum, [k]) => sum + (Number(scores[`${ev.key}.${k}`]) || 0), 0), 25));
  const penalty = Number(state.penalties[id]) || 0;
  return { events, penalty, total: events.reduce((a, b) => a + b, 0) - penalty, coordination: Number(scores["combat.coordination"]) || 0 };
}

export class ContestApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hk-contest",
    classes: ["hakai-kousen", "hk-contest"],
    window: { title: "Concours Pokémon", icon: "fa-solid fa-trophy", resizable: true },
    position: { width: 760, height: 720 },
    actions: {
      addParticipants: ContestApp.#onAdd,
      removeParticipant: ContestApp.#onRemove,
      reset: ContestApp.#onReset,
      announce: ContestApp.#onAnnounce
    }
  };

  static PARTS = { main: { template: "systems/hakai-kousen/templates/apps/contest.hbs", scrollable: [".hk-contest-body"] } };

  /** @override */
  async _prepareContext() {
    const state = data();
    const ranking = state.participants.map(p => ({ ...p, ...totals(state, p.id) }))
      .sort((a, b) => (b.total - a.total) || (b.events[0] - a.events[0]) || (b.coordination - a.coordination));
    return {
      isGM: game.user.isGM,
      participants: state.participants,
      events: CONTEST_EVENTS.map((ev, i) => ({
        ...ev,
        rows: ev.criteria.map(([key, label, max]) => ({
          key: `${ev.key}.${key}`, label, max,
          cells: state.participants.map(p => ({ id: p.id, value: state.scores[p.id]?.[`${ev.key}.${key}`] ?? "" }))
        })),
        totals: state.participants.map(p => totals(state, p.id).events[i])
      })),
      penalties: state.participants.map(p => ({ id: p.id, value: state.penalties[p.id] ?? 0 })),
      ranking
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if ( !game.user.isGM ) return;
    for ( const input of this.element.querySelectorAll("input[data-score], input[data-penalty]") ) {
      input.addEventListener("change", async () => {
        const state = data();
        const max = Number(input.max) || 25;
        const value = Math.clamp(Number(input.value) || 0, 0, max);
        if ( input.dataset.penalty ) state.penalties[input.dataset.penalty] = value;
        else {
          state.scores[input.dataset.id] ??= {};
          state.scores[input.dataset.id][input.dataset.score] = value;
        }
        await save(state);
        this.render();
      });
    }
  }

  static async #onAdd() {
    const known = new Set(data().participants.map(p => p.id));
    const trainers = game.actors.filter(a => (a.type === "trainer") && !known.has(a.id));
    if ( !trainers.length ) return ui.notifications.warn("Aucun autre Dresseur à inscrire.");
    const ids = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Candidats" },
      content: trainers.map(t => `<label class="checkbox"><input type="checkbox" name="t" value="${t.id}"> ${t.name}</label>`).join(""),
      ok: { label: "Inscrire", callback: (e, b) => [...b.form.querySelectorAll("input[name=t]:checked")].map(i => i.value) },
      rejectClose: false
    });
    if ( !ids?.length ) return;
    const state = data();
    state.participants.push(...ids.map(id => game.actors.get(id)).map(a => ({ id: a.id, name: a.name, img: a.img })));
    await save(state);
    this.render();
  }

  static async #onRemove(event, target) {
    const state = data();
    state.participants = state.participants.filter(p => p.id !== target.dataset.id);
    await save(state);
    this.render();
  }

  static async #onReset() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Nouveau concours" }, content: "<p>Effacer les candidats et les notes ?</p>", rejectClose: false });
    if ( !ok ) return;
    await game.settings.set(SCOPE, "contest", { participants: [], scores: {}, penalties: {} });
    this.render();
  }

  static async #onAnnounce() {
    const { ranking } = await this._prepareContext();
    const rows = ranking.map((p, i) => `<li><strong>${p.name}</strong> : ${p.total} / 100
      <span class="hk-detail">(${p.events.join(" · ")}${p.penalty ? ` · pénalité −${p.penalty}` : ""})</span></li>`).join("");
    await ChatMessage.implementation.create({
      speaker: { alias: "Jury du concours" },
      content: `<div class="hk-card"><header><h3>Résultats du concours</h3>
        <span class="subtitle">Égalité : meilleure Représentation, puis Coordination du combat double</span></header><ol>${rows}</ol></div>`
    });
  }
}

let app = null;
export function openContest() {
  app ??= new ContestApp();
  return app.render({ force: true });
}
