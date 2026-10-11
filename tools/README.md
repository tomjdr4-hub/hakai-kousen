# Outils de génération

Les compendiums sont écrits en JSON dans `packs-src/` puis compilés en LevelDB (`npm run build:packs`).

| Script | Rôle |
|---|---|
| `pokedex.py [N]` | Pokédex 1 à N, Capacités et Talents depuis hakaikousen.fr (onglet 7G, Système de base). Pages en cache dans `tools/.cache`, 1,5 s entre deux requêtes. |
| `annexes.py <pdf>` | Objets et Compétences Pokémon depuis les tableaux du Recueil des Annexes (PyMuPDF). |
| `tables.py [--voyage <pdf>]` | Tables aléatoires (Natures, Compétence initiale, Minage, exemple de zone…). Avec `--voyage`, ajoute les 21 tables D100 de l'aide « Voyage de Sévaro à Porto Marinada » (dossier dédié). |
| `effects_parser.py` | Lecture des descriptions : effets (stats, précision, états) et mécaniques (recul, drain, frappes, deux tours…). |
| `update_attacks.py` | Réapplique le parseur aux capacités existantes, sans retélécharger le site. |
| `build-packs.mjs` | Compilation des compendiums. |
| `release.sh vX.Y.Z "Titre" "Notes"` | Publication d'une version sur GitHub. |
