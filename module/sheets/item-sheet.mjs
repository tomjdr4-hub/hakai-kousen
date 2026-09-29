import { HK } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class HKItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hakai-kousen", "sheet", "item"],
    position: { width: 520, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true }
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
}
