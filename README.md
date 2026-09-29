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

### Objets
Capacités, Compétences Pokémon, Talents et Objets d'inventaire.

### Compendiums
Données issues du site [hakaikousen.fr](https://hakaikousen.fr) (onglet 7G, Système de base), sous licence [CC BY-NC-SA 3.0](http://creativecommons.org/licenses/by-nc-sa/3.0/).

- **Pokédex** : les 251 Pokémon des 1re et 2e générations, rangés par génération, avec types, statistiques de base, talents, évolutions et capacités de départ. L'onglet Capacités de la fiche liste toute la progression (niveau, CT, œuf, tutorat) : un clic sur « + » ajoute la capacité depuis le compendium.
- **Capacités** : toutes les capacités apprises par ces Pokémon (562).
- **Talents** : tous leurs talents (131).

Glissez un Pokémon du compendium dans l'onglet Acteurs, puis ajoutez IV, Nature, Talent et Dressage.

## Pas encore automatisé

- Capture en combat (seuil, modificateurs de Ball).
- Dégâts périodiques (Poison, Toxik, Brûlure), Gel, Sommeil, Confusion : les états existent sur les jetons mais leurs effets de tour sont à gérer à la main.
- Compétences Augmentation / Résistance de type.
- Pokédex au-delà de la 2e génération, compendiums d'objets (annexes).

## Développement

Le code est chargé tel quel par Foundry. Les compendiums sont écrits en JSON dans `packs-src/` et compilés en LevelDB dans `packs/` :

```
npm install
npm run build:packs
```

Pour développer, créez un lien symbolique de ce dépôt vers `Data/systems/hakai-kousen` de votre installation Foundry.

Publier une version : créez une release GitHub avec un tag `vX.Y.Z`. Le workflow `.github/workflows/release.yml` inscrit la version dans `system.json`, construit `hakai-kousen.zip` et joint les deux fichiers à la release.
