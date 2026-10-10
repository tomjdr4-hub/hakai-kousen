#!/bin/bash
# Publie une version : vérifie l'arbre et la version, compile les compendiums, pousse, construit le zip
# et crée la release GitHub sur le commit courant.
# Usage : tools/release.sh vX.Y.Z "Titre" "Notes"
set -e
cd "$(dirname "$0")/.."
test -z "$(git status --porcelain | grep -v '^?? .github')" || { echo "Arbre non propre, abandon"; exit 1; }
grep -q "\"version\": \"${1#v}\"" system.json || { echo "La version de system.json ne correspond pas à $1"; exit 1; }
npm run build:packs >/dev/null
git push -q origin main
rm -f hakai-kousen.zip
python - hakai-kousen.zip <<'PY'
import sys, zipfile, os
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for root in ["system.json", "hakai-kousen.mjs", "README.md", "module", "templates", "styles", "lang", "assets", "packs"]:
        if os.path.isfile(root):
            z.write(root)
            continue
        for dp, _, fs in os.walk(root):
            for f in fs:
                if f != "LOCK":
                    z.write(os.path.join(dp, f).replace("\\", "/"))
    print(len(z.namelist()), "fichiers dans le zip")
PY
gh release create "$1" hakai-kousen.zip system.json --repo tomjdr4-hub/hakai-kousen --target "$(git rev-parse HEAD)" --title "$2" --notes "$3"
rm -f hakai-kousen.zip
echo "Tag distant : $(git ls-remote --tags origin "$1" | cut -c1-7) / HEAD : $(git rev-parse --short HEAD)"
curl -sL "https://github.com/tomjdr4-hub/hakai-kousen/releases/download/$1/system.json" | grep '"version"'
