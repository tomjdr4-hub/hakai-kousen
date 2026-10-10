export class HKActor extends Actor {
  /** @override */
  getRollData() {
    return this.system.getRollData?.() ?? super.getRollData();
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    // Les Dresseurs sont liés à leur jeton par défaut ; les Pokémon sauvages ne le sont pas.
    if ( (this.type === "trainer") && (data.prototypeToken?.actorLink === undefined) ) {
      this.updateSource({ "prototypeToken.actorLink": true });
    }
  }

  /**
   * XP cumulée : toute hausse de l'XP disponible (combat, saisie sur la fiche, récompense) s'ajoute au total ;
   * une dépense ne le diminue pas. Le total reste au moins égal à l'XP disponible.
   * @override
   */
  async _preUpdate(changes, options, user) {
    if ( (await super._preUpdate(changes, options, user)) === false ) return false;
    const get = key => changes[key] ?? foundry.utils.getProperty(changes, key);
    const value = get("system.xp.value");
    if ( (value === undefined) || !this.system.xp ) return;
    const current = this.system.xp;
    const explicit = get("system.xp.total");
    let total = explicit ?? current.total;
    if ( (explicit === undefined) && (value > current.value) ) total += value - current.value;
    total = Math.max(total, value);
    if ( "system.xp.value" in changes ) changes["system.xp.total"] = total;
    else foundry.utils.setProperty(changes, "system.xp.total", total);
  }

  /**
   * Repos long (4.18) : restaure la moitié de la VIT et de l'ENE maximales.
   */
  async longRest() {
    const updates = {};
    const vit = this.system.vit;
    updates["system.vit.value"] = Math.min(vit.value + Math.floor(vit.max / 2), vit.max);
    if ( this.type === "pokemon" ) {
      const ene = this.system.ene;
      updates["system.ene.value"] = Math.min(ene.value + Math.floor(ene.max / 2), ene.max);
    }
    await this.update(updates);
    ui.notifications.info(`${this.name} récupère après un repos long.`);
  }

  /** Soins complets (Centre Pokémon). */
  async fullHeal() {
    const updates = { "system.vit.value": this.system.vit.max };
    if ( this.type === "pokemon" ) {
      updates["system.ene.value"] = this.system.ene.max;
      for ( const k of Object.keys(this.system.stats) ) updates[`system.stats.${k}.temp`] = 0;
      updates["system.accuracyMod"] = 0;
    }
    await this.update(updates);
  }
}
