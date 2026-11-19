#!/bin/sh
# Fige la version stable du widget : copie le code servi par GitHub Pages dans vN/.
# Usage, depuis la racine du dépôt : sh outils/figer-version.sh 1
# À lancer seulement quand les tests passent et que le changement ne casse rien
# pour les documents existants. Un changement qui modifie les tables ou les réglages
# attendus demande un nouveau numéro (2, 3…) : l'ancienne adresse reste en service.
set -e
N="${1:?Indiquez le numéro de version, par exemple : sh outils/figer-version.sh 1}"
cd "$(dirname "$0")/.."
DEST="v$N"
rm -rf "$DEST"
mkdir "$DEST"
for f in *; do
  case "$f" in
    v[0-9]*|tests|docs|outils|modele|widget-test|README.md|*.grist) continue ;;
  esac
  cp -R "$f" "$DEST/"
done
echo "Version stable copiée dans $DEST/"
