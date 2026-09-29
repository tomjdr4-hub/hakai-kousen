import { HK } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class HKItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hakai-kousen", "sheet", "item"],
    position: { width: 520, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addEffect: HKItemSheet._onAddEffect,
      removeEffect: HKItemSheet._onRemoveEffect
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/hakai-kousen/templates/item/item-sheet.hbs",
      scrollable: [".sheet-body"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    Object.assign(context, {
      item,
      system: item.system,
      config: HK,
      editable: this.isEditable,
      isType: { [item.type]: true },
      priorities: { 1: "Agit toujours en premier", 0: "Normale", "-1": "Agit en dernier" },
      effects: (item.system.effects ?? []).map((e, index) => ({ ...e, index, isStat: e.kind === "stat" })),
      effectChoices: {
        targets: { target: "Cible", self: "Lanceur" },
        kinds: { stat: "Statistique", status: "État" },
        stats: Object.fromEntries(Object.entries(HK.ATTRIBUTES).map(([k, a]) => [k, a.abbr])),
        statuses: Object.fromEntries(Object.entries(HK.STATUSES).map(([k, st]) => [k, st.label]))
      },
      categories: {
        attack: HK.ATTACK_CATEGORIES,
        pokeskill: Object.fromEntries(Object.entries(HK.POKESKILL_CATEGORIES).map(([k, c]) => [k, `${c.label} (niveau × ${c.cost} XP)`])),
        gear: HK.GEAR_CATEGORIES
      }[item.type],
      enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
        relativeTo: item,
        secrets: item.isOwner
      })
    });
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Les lignes d'effets sont enregistrées en entier à chaque modification.
    for ( const input of this.element.querySelectorAll("[data-effect-field]") ) {
      input.addEventListener("change", event => {
        event.stopPropagation();
        const effects = foundry.utils.deepClone(this.item.system.toObject().effects);
        const effect = effects[Number(input.closest("[data-effect-index]").dataset.effectIndex)];
        const field = input.dataset.effectField;
        effect[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        if ( (field === "kind") && (effect.kind === "status") && !effect.status ) effect.status = "poison";
        this.item.update({ "system.effects": effects });
      });
    }
  }

  static async _onAddEffect() {
    const effects = [...this.item.system.toObject().effects, { kind: "stat", target: "target", stat: "for", value: -1, status: "", secondary: false }];
    return this.item.update({ "system.effects": effects });
  }

  static async _onRemoveEffect(event, target) {
    const index = Number(target.closest("[data-effect-index]").dataset.effectIndex);
    const effects = this.item.system.toObject().effects.filter((e, i) => i !== index);
    return this.item.update({ "system.effects": effects });
  }
}
