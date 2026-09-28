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
- Initiative : 1D10 + DEX (à égalité, la meilleure DEX agit d'abord).

### Objets
Capacités, Compétences Pokémon, Talents et Objets d'inventaire.

## Pas encore automatisé

- Capture en combat (seuil, modificateurs de Ball).
- Dégâts périodiques (Poison, Toxik, Brûlure), Gel, Sommeil, Confusion : les états existent sur les jetons mais leurs effets de tour sont à gérer à la main.
- Compétences Augmentation / Résistance de type.
- Compendiums (espèces, capacités, objets).

## Développement

Aucune étape de build : les fichiers sont chargés tels quels par Foundry.

Pour développer, créez un lien symbolique de ce dépôt vers `Data/systems/hakai-kousen` de votre installation Foundry.

Publier une version : créez une release GitHub avec un tag `vX.Y.Z`. Le workflow `.github/workflows/release.yml` inscrit la version dans `system.json`, construit `hakai-kousen.zip` et joint les deux fichiers à la release.
