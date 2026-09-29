# Hakai Kousen — système Foundry VTT

Système [Foundry Virtual Tabletop](https://foundryvtt.com) pour **Hakai Kousen**, jeu de rôle communautaire, amateur et gratuit dans l'univers Pokémon.

Compatible **Foundry V13 et V14**.

> Projet non officiel. Hakai Kousen n'est ni affilié, ni approuvé, ni soutenu par Nintendo, Creatures Inc., GAME FREAK inc. ou The Pokémon Company. Pokémon et les éléments associés appartiennent à leurs titulaires respectifs.
> Les règles de Hakai Kousen sont l'œuvre de leurs auteurs (refonte, consolidation et mise en page : Kévin Deus). Ce système est réalisé avec l'accord de l'auteur. Il ne contient pas les manuels : procurez-vous les documents officiels de Hakai Kousen pour jouer.

## Installation

Dans Foundry : **Systèmes de jeu → Installer un système**, puis coller l'URL du manifeste :

```
https://github.com/tomjdr4-hub/hakai-kousen/releases/latest/download/system.json
```

## Fonctionnalités

### Fiche Dresseur
- Caractéristiques DEX, FOR, CON, END, VOL (base + points) et **test de Caractéristique** : 1D6 ≤ Stat, la difficulté agrandit le dé (D8, D10, D12, D20).
- 15 Compétences et 10 Connaissances avec Niveau et Spécialisation : **réserve de D10**, on garde le meilleur (Niveau 0 : 2D10, on garde le moins bon), réussite et échec critiques.
- VIT, XP Dresseur, Pokédollars, repos long.
- Équipe : glisser-déposer des acteurs Pokémon (6 max).
- Mécaniques spéciales (Méga-Évolution, Capacité Z, Téracristallisation, Dynamax), badges.
- Inventaire classé comme sur la fiche papier.

### Fiche Pokémon
- Statistiques Base / IV / EV / Nature → Total, avec les gains par IV/EV (+1, VIT +2, ENE +3) et les 25 Natures.
- Valeur **effective en combat** : modifications temporaires (−6 à +6), puis Brûlure (FOR ÷2), Paralysie (DEX ÷2), affaiblissement à ¼ de VIT (÷2), Bébé.
- Confiance + Obéissance = **Dressage**, et jet d'ordre (1D8 ≤ Dressage sous 8, avec la réaction en cas d'échec).
- **Sensibilités** calculées à partir des types.
- Capacités : ciblez un jeton puis lancez. Le système dépense l'ENE, calcule la marge (FOR − END ou CON − VOL), lit le seuil dans la **Table unique**, lance 1D10 (10 naturel = réussite exceptionnelle, dégâts ×2), applique l'efficacité du type et propose un bouton **Appliquer les dégâts**. Les chances d'effet secondaire sont lancées aussi.
- Compétences Pokémon (Standard / Intermédiaire / Rare, coût du niveau suivant, apprentissage /10), Talents, objets tenus.
- **Initiative** (5.2, 5.3, 5.13) : 1D10 + DEX effective. À égalité, la meilleure DEX agit d'abord ; à DEX égale, le système relance 1D10 automatiquement et l'annonce dans le chat. Dans le suivi de combat, l'éclair ⚡ marque une action prioritaire pour le tour (switch, capacité prioritaire, Baie Chérim) et le clic droit « agit en dernier » : ces combattants passent avant (ou après) l'ordre normal, départagés entre eux par l'Initiative. Les priorités s'effacent à chaque nouveau tour. Un Pokémon ajouté en cours de combat lance son initiative tout seul.

### États et effets des capacités
- En-tête des fiches : les **états** (KO, Brûlure, Paralysie, Poison, Toxik, Gel, Sommeil, Confusion, Apeuré) s'activent d'un clic, avec la règle en info-bulle, le **tour de Toxik** et le **stade de Confusion**. Ce sont les mêmes états que sur les jetons.
- Chaque capacité porte ses **effets** (modification de stat ou altération d'état, sur la cible ou le lanceur, soumis ou non à la chance d'effet secondaire), extraits des descriptions du site et modifiables sur la fiche de la capacité.
- Quand une capacité touche, la carte de chat propose **Appliquer FOR −1 à …**, **Appliquer Toxik à …**, etc. Les modifications vont dans la colonne « Temp. » (−6 à +6) ; les immunités de type (Poison/Acier, Feu, Électrik, Glace) et la règle d'un seul problème de statut majeur sont vérifiées. Si le joueur ne possède pas la cible, le MJ l'applique automatiquement.
- « Apeuré » disparaît à chaque nouveau tour de combat.
- Le bouton ⟳ de l'onglet Capacités met à jour les capacités d'une fiche depuis le compendium.

### Panneau de combat
Bouton **Panneau de combat** dans le suivi de combat (il s'ouvre aussi tout seul à chaque tour).

1. **Réflexion** (5.3) : au début de chaque tour, un chrono synchronisé (30 s par défaut, réglable) laisse chacun, MJ compris, choisir **en secret** l'action de ses Pokémon : attaque (grisée si l'ENE manque) et cible(s), changer de Pokémon, objet, Poké Ball, fuite, ou action libre. Les autres ne voient que « Prêt » ou « Réfléchit… ». Le MJ peut mettre en pause, ajouter 10 s ou révéler plus tôt ; si tout le monde est prêt, la révélation est immédiate.
2. **Révélation** : les choix sont annoncés dans le chat, dans l'ordre de résolution. Le switch est prioritaire (5.13), les capacités « agit toujours en premier » ou « en dernier » et les bonus d'initiative du tour (Vive-Attaque +10, Vitesse Extrême +20…) réordonnent le tour.
3. **Résolution** : au tour de chacun, **Exécuter** lance l'action choisie : test de Dressage si besoin (sous 8), jet de toucher sur la cible, dégâts, ENE ; switch du jeton sur la carte (les attaques visant le Pokémon rappelé touchent le remplaçant) ; objet décompté ; Poké Ball avec test de DEX puis jet de capture secret du MJ. Le tour passe ensuite au suivant.

Réglages : durée de la réflexion, réflexion automatique à chaque tour, ouverture automatique du panneau.

#### Combat de Dresseurs
- **Nouveau combat de Dresseurs** (panneau, sans combat en cours) : type (officiel, sauvage, mortel), format (simple, Duo, Triple), nombre de Pokémon autorisés, Dresseurs engagés. Chacun choisit en secret son ou ses Pokémon de départ ; ils apparaissent à côté du jeton du Dresseur, l'initiative est lancée et le combat commence.
- **Équipes** : un bandeau par Dresseur (fiche de suivi du MJ 7.3) avec jauges de VIT/ENE, seuil ¼, états, KO et Pokémon en jeu. Les adversaires ne voient que les jauges.
- **KO** : le Pokémon est marqué vaincu ; son Dresseur choisit un remplaçant (gratuit, 1D10 + DEX). Un Dresseur sans Pokémon valide est déclaré vaincu. En combat officiel la VIT s'arrête à 0 ; ailleurs elle peut devenir négative (blessure grave, mort à −10, rappel juste à temps pour 1 XP Dresseur).
- **Duo** : avertissement sous Obéissance 6 ; une seule action personnelle du Dresseur (objet, Ball, fuite) par tour.
- **Début de tour** automatique : Brûlure, Poison, Toxik (compteur), Malédiction, Vampigraine, blessure grave ; jets de Gel, Paralysie et Confusion ; Apeuré. Un Pokémon empêché d'agir voit son action annulée.
- **Objets de soin** (VIT, ENE, altérations, Rappel) appliqués automatiquement en combat et depuis l'inventaire du Dresseur ; **Lutte** proposée quand l'ENE manque.
- **Esquive** (Annexe 1) : un Pokémon qui possède la compétence peut la préparer pendant la réflexion ; s'il est attaqué, sa DEX remplace END ou VOL quand elle est meilleure, pour 12 à 2 ENE selon le niveau.
- **Dégâts** : Augmentation Type/Crocs/Griffes/Poings et objet tenu renforçant le Type ajoutés ; Résistance Type réduit le multiplicateur ; Blindage naturel réduit les dégâts physiques.
- **Meute** : le MJ coche des Pokémon semblables pour qu'ils partagent une initiative (MJ 5.9).
- **Terminer** : XP Pokémon distribuée à chaque participant (montant complet), puis fin du combat.

### Objets
Capacités, Compétences Pokémon, Talents et Objets d'inventaire.

### Compendiums
Données issues du site [hakaikousen.fr](https://hakaikousen.fr) (onglet 7G, Système de base), sous licence [CC BY-NC-SA 3.0](http://creativecommons.org/licenses/by-nc-sa/3.0/).

- **Pokédex** : les 251 Pokémon des 1re et 2e générations, rangés par génération, avec types, statistiques de base, talents, évolutions et capacités de départ. L'onglet Capacités de la fiche liste toute la progression (niveau, CT, œuf, tutorat) : un clic sur « + » ajoute la capacité depuis le compendium.
- **Capacités** : toutes les capacités apprises par ces Pokémon (562).
- **Talents** : tous leurs talents (131).
- **Objets** (Recueil des Annexes) : Baies, Poké Balls (modificateur de capture et condition), Soins (effets appliqués automatiquement), 358 CT (liées aux capacités), objets tenus (renforcement de Type), objets d'évolution, équipement, objets rares, entraînement.
- **Compétences Pokémon** (Annexe 1) : Standard, Intermédiaires et Rares.

Glissez un Pokémon du compendium dans l'onglet Acteurs, puis ajoutez IV, Nature, Talent et Dressage.

## Pas encore automatisé

- Capture : rareté, Aberrant / Dominant restent à ajouter par le MJ ; la condition des Balls spéciales est rappelée avec le seuil correspondant.
- Objets tenus autres que les renforçateurs de Type (Restes, Orbe Vie, objets Choix…) et Baies de résistance : effets décrits, à appliquer à la main.
- Objets sans effet de soin renseigné : l'objet est décompté, l'effet est à appliquer sur la fiche.
- Sommeil : sa règle HK n'est pas dans les manuels, un rappel s'affiche au début du tour.
- Effets conditionnels des capacités (« si… », « sinon… », Crocs Feu, Triplattaque…) et modifications de Précision : au MJ.
- Pokédex au-delà de la 2e génération, compendiums d'objets (annexes).

## Développement

Le code est chargé tel quel par Foundry. Les compendiums sont écrits en JSON dans `packs-src/` et compilés en LevelDB dans `packs/` :

```
npm install
npm run build:packs
```

Pour développer, créez un lien symbolique de ce dépôt vers `Data/systems/hakai-kousen` de votre installation Foundry.

Publier une version : créez une release GitHub avec un tag `vX.Y.Z`. Le workflow `.github/workflows/release.yml` inscrit la version dans `system.json`, construit `hakai-kousen.zip` et joint les deux fichiers à la release.
