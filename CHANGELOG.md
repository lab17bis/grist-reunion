# Journal des modifications

Les adresses `/v1/` ne changent pas : chaque version ajoute ou corrige, sans retirer ce qui existe.

## 2026-11-27 (adresse refusée)
- Publication : une adresse de page contenant l'identifiant long du document est refusée avec un message qui explique quoi copier (Grist ignore la page dans ce cas).

## 2026-11-27 (barre stable)
- Barre de réglages : la place du bouton Enregistrer est réservée sur l'onglet de la vue, la barre ne saute plus d'un onglet à l'autre.

## 2026-11-27 (publication réservée)

### Ajouté

- Onglet Publication : section « Lien réservé aux personnes invitées » (collez l'adresse de la page Grist, le lien plein écran se construit, au choix en consultation seule ou avec saisie) et rappel de la différence entre page publique et lien réservé.

## 2026-11-27 (cohérence de la barre de réglages)

### Corrigé

- Le bouton Enregistrer est aligné sur la barre d'onglets, les onglets sont centrés et la pastille « Enregistré / Non enregistré » reste visible sur toutes les pages.

## 2026-11-26 (tables déjà présentes dans le document)

### Corrigé
- Si le document contient déjà une table du même nom que celles de l'outil (`Reunions`, `Points`, `Decisions`, `Actions_reunion`), créée à la main ou par un autre outil, le widget la croyait prête et n'ajoutait pas les colonnes qui lui manquent : les informations ne s'affichaient pas et les enregistrements échouaient, sans message. Le widget signale maintenant les colonnes manquantes et propose « Ajouter les colonnes manquantes ». L'installation complète aussi les tables déjà présentes. Rien n'est renommé ni supprimé.

### Ajouté
- Conseil affiché : si une de vos colonnes contient déjà l'information sous un autre nom, renommez-la dans Grist avec le nom attendu, ses données seront reprises.

## 2026-11-26 (style commun de configuration)

### Corrigé
- Configuration : sur l'onglet de l'outil, le style commun masquait par erreur tout champ dont l'identifiant finit par « -etat » (dans grist-projet : le filtre « État » de la banque et la liste « État » du formulaire de projet). Seul le badge « Enregistré » de la barre est maintenant masqué. Rien à refaire : rechargez la page.

## 2026-11-26 (réunion rattachée à un projet)

### Ajouté
- Si la table `Reunions` a une colonne `Projet` (référence à `Projets`, ajoutée par grist-projet) et que la table `Projets` existe, le formulaire d'une réunion propose « Projet lié » ; le compte rendu l'indique. Une colonne `Notes` éventuelle est proposée en saisie.
- Les réunions créées depuis l'onglet « Rendez-vous » d'un projet s'ouvrent ici comme les autres.

### Inchangé
- Sans ces colonnes, les formulaires et le compte rendu sont identiques à avant.

## 2026-11-26 (champs supplémentaires)

### Ajouté
- Champs supplémentaires des réunions (Configurer › Réglages) : texte court ou long, choix dans une liste, date ou nombre, obligatoires ou non. Chaque champ crée une colonne dans `Reunions` à l'enregistrement des réglages ; il apparaît dans le formulaire de la réunion et dans le compte rendu.

### Inchangé
- Sans champ supplémentaire, les formulaires et le compte rendu sont identiques à avant.

## 2026-11-26 (documentation)

### Corrigé
- README : la rubrique « Limites » affirmait qu'il n'y avait pas de page publique, alors que la page publique du compte rendu diffusé existe. Aucun changement de code.

## 2026-11-25 (mention de conception)

### Ajouté
- Mention discrète en pied de page, sur l'outil comme sur ses pages publiques : « Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims ».

## 2026-11-25 (aperçu réel)

### Amélioré
- Onglet « Aperçu » de la configuration : il montre maintenant l'outil de réunions elle-même, entre l'en-tête et le pied de page, au lieu d'un exemple fixe. Les réglages en cours de saisie, même non enregistrés, s'appliquent le temps de l'aperçu ; en quittant l'onglet, l'outil revient à ses réglages enregistrés.
- Dans l'aperçu, l'outil est réellement actif : ce que vous y faites s'applique au document. Un message le rappelle.

## 2026-11-25 (audit de sécurité)

### Sécurité
- Les liens venant des données ou des réglages sont vérifiés par le navigateur lui-même : une adresse déguisée (« java⇥script: » avec tabulation, retour à la ligne ou caractère de contrôle) n'est plus acceptée. Elle permettait, sur le portail, d'exécuter du script au clic depuis une adresse fabriquée.
- Politique de sécurité de contenu stricte : seuls les scripts du site, l'API Grist et les scripts de la page connus par leur empreinte peuvent s'exécuter. L'évaluation de texte (« unsafe-eval ») reste permise : l'API officielle de Grist en a besoin (sans elle, les widgets restaient bloqués sur « Chargement… » dans Grist le 25/11 au matin). Un script injecté (lien javascript:, attribut onerror…) est bloqué même si un filtre le laissait passer.
- Page publique : message clair si le document Grist est injoignable (au lieu de « Failed to fetch »).

## 2026-11-24 (durcissement)

### Sécurité
- Les pages ajoutent une politique de sécurité de contenu minimale (pas d'objets embarqués, pas de balise base).
- Les pages publiques n'acceptent plus qu'un lien de document Grist en https (http seulement pour localhost, en développement).

## 2026-11-24 (message de lecture publique)

### Corrigé
- Page publique : quand une table est masquée par les règles d'accès du document, le message nomme la table et explique la cause (erreur 403), au lieu de demander si le document est partagé. Comportement vérifié sur un vrai document Grist : une table refusée au public répond 403, une colonne refusée disparaît des lignes, les personnes connectées gardent leurs droits.

## 2026-11-24 (règles d'accès)

### Corrigé
- Page publique : une table ou une colonne masquée par les règles d'accès du document (par exemple les adresses de courriel) n'empêche plus d'afficher le reste de la page.

### Ajouté
- Documentation de la page publique (README) : réglages, ce qui est lu, ce qui reste caché, règles d'accès à poser.

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
