# Journal des modifications

Les adresses `/v1/` ne changent pas : chaque version ajoute ou corrige, sans retirer ce qui existe.

## 2026-11-24 (règles d'accès)

### Corrigé
- Page publique : une table ou une colonne masquée par les règles d'accès du document (par exemple les adresses de courriel) n'empêche plus d'afficher le reste de la page.

## 2026-11-24 (page publique)

### Ajouté
- Page publique dédiée `public.html?doc=<lien du document Grist>` : prochaines réunions, réunions passées, filtre par instance, ordre du jour et compte rendu, en lecture seule.
- Ce qui est publié dépend de l'étape de la réunion : une réunion « En préparation » n'est jamais publiée ; l'ordre du jour apparaît dès l'étape suivante ; notes, décisions et actions seulement à la dernière étape (« Compte rendu diffusé »).
- Les participants et les excusés ne sont affichés que si la case correspondante est cochée dans l'onglet Publication.
- Module commun `commun/page-publique.js` pour les pages publiques dédiées.
- Module commun `commun/grist-public.js` (et `.css`) : lit le document par l'API REST de Grist, en lecture seule, sans compte.
- Onglet Publication : saisissez le lien du document Grist partagé en lecture publique, l'outil construit le lien de la page publique, à copier ou à ouvrir ; le lien est enregistré avec les réglages.
- Option `integre=1` : page sans en-tête ni pied propres, pour l'intégrer dans un autre site.

## 2026-11-24 (documentation)

### Modifié
- Documentation : l'outil de consultation s'appelle désormais `grist-consultation` (ancien nom `grist-decision`).

## 2026-11-24 (barre d'onglets permanente)

### Modifié
- Le widget s'ouvre désormais sur une barre d'onglets, comme le catalogue et le questionnaire : *Réunions*, puis les onglets de réglages, En-tête et pied, Aperçu, Publication. L'outil lui-même est le premier onglet.
- Le bouton « Configurer » laisse la place à la barre d'onglets ; les anciens liens et boutons « Réglages » restent actifs et ouvrent l'onglet Réglages.
- L'enregistrement des réglages reste dans la colonne de configuration existante : rien à migrer.

## 2026-11-24

### Ajouté
- Page de configuration unique, ouverte par le bouton « Configurer » (l'ancien lien « Réglages » en bas de page reste actif) : onglets Réglages, En-tête et pied, Aperçu, Publication.
- Onglet Aperçu : l'en-tête et le pied de page tels qu'ils seront affichés, avec les réglages en cours, même non enregistrés.
- Onglet Publication : explique que l'outil est réservé aux personnes connectées, comment inviter l'équipe, et donne l'adresse du widget à copier.
- Module commun `commun/configuration.js` et `commun/configuration.css`, partagé avec les autres widgets de la famille.

### Modifié
- Les réglages existants (listes de valeurs, durée par défaut, en-tête et pied) sont conservés tels quels et lus au même endroit : colonne `Config_reunion`.
- En mode démonstration, la page de configuration est visible mais n'enregistre rien.

## Versions antérieures

Voir l'historique des commits.
