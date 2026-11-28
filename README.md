# grist-reunion

> **Widget-outil pour Grist, clé en main.** Il transforme un document Grist en outil de réunion d'équipe, au Système de design de l'État (DSFR) : l'équipe propose des points, l'animateur arrête l'ordre du jour, la séance est prise en notes avec ses décisions et ses actions, et le compte rendu se met en page tout seul.

Tout se règle dans Grist, sans toucher au code : en-tête et pied de page, instances (types de réunion), étapes, types de points, états des actions, durée par défaut d'un point. Le dépôt ne contient que le code : aucune donnée, aucune réunion réelle.

## À quoi ça sert

| Moment | Ce que l'outil permet |
| --- | --- |
| **Avant** | Créer une réunion, recueillir les propositions de points de l'équipe (sujet, précisions, type, durée souhaitée, qui présente), les retenir, les reporter ou les écarter, ordonner l'ordre du jour. Les horaires de chaque point se calculent et un avertissement apparaît si l'ordre du jour dépasse la durée prévue. En option : une date limite des propositions, des propositions envoyées sans compte Grist par un formulaire, et l'ordre du jour réservé à la personne qui anime (voir *Ordre du jour participatif*) |
| **Pendant** | Prendre des notes point par point, ajouter des décisions et des actions (responsable, échéance), suivre le temps avec un minuteur, marquer un point traité ou le reporter, revoir les actions encore ouvertes des réunions précédentes |
| **Après** | Un compte rendu au DSFR : informations pratiques, notes, décisions, relevé des actions, points reportés. Impression ou PDF, copie du texte pour un courriel, marquage « diffusé » |
| **Entre deux réunions** | *Suivi des actions* : toutes les actions ouvertes (en retard, dans les 7 jours, plus tard, sans échéance), filtrables par responsable et par instance. *Préparer la réunion suivante* reprend les informations pratiques et propose les points reportés |

Une **instance** regroupe les réunions d'une même série (réunion d'équipe, comité de pilotage…). Les actions ouvertes d'une instance réapparaissent à la réunion suivante de la même instance.

L'outil s'utilise **dans Grist** : chaque personne qui propose un point ou prend des notes doit être connectée au document. Pour recueillir des propositions de personnes qui n'ont pas accès au document, branchez [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) sur la table `Propositions_publiques`, **jamais sur `Points`** : un formulaire Grist publié écrit toutes les colonnes de sa table sans tenir compte des règles d'accès, il pourrait inscrire un point directement à l'ordre du jour.

Démonstration avec des données fictives (rien n'est enregistré) : <https://lab17bis.github.io/grist-reunion/v1/>

## Le brancher en 3 minutes

1. **Créer un document Grist vide** (ou ouvrir un document existant).
2. **Ajouter le widget** : *Ajouter › Ajouter une page › Personnalisé*, sur n'importe quelle table. Dans le panneau de droite, choisissez *URL personnalisée*, saisissez `https://lab17bis.github.io/grist-reunion/v1/` et donnez l'**accès complet au document**.
3. **Installer** : le widget propose *Créer les tables*, ou *Créer les tables avec un exemple fictif* pour essayer. Il crée `Reunions`, `Points`, `Decisions` et `Actions_reunion` sans toucher aux tables existantes. À faire par un propriétaire du document.

Ensuite, invitez l'équipe dans le document (*Partager*), en éditeur pour proposer des points et prendre des notes. Pour plus de clarté, vous pouvez rattacher la vue personnalisée à la table `Reunions` et supprimer la table de départ.

## Le régler

La barre de l'éditeur est commune à tous les widgets : nom du widget et statut d'enregistrement à gauche, onglets *Réglages*, *En-tête et pied*, *Aperçu* et *Publication* au centre, bouton *Enregistrer* à droite. L'outil s'utilise dans l'onglet *Aperçu*, ouvert par défaut, avec son en-tête et son pied de page. *Réglages* regroupe l'en-tête et le pied de page, les listes de valeurs (instances, étapes d'une réunion, types de points, états des actions) et la durée proposée par défaut pour un point. Les choix des colonnes Grist sont mis à jour en même temps.

**Éditeur du widget ou page d'usage, avec le même lien.** Chaque vue Grist choisit ce qu'elle affiche (onglet *Publication*, rubrique *Affichage de cette vue Grist*) : l'**éditeur du widget** (affichage par défaut) ou la **page d'usage** (l'outil avec son en-tête et son pied de page, sans barre de réglages ; un lien *Éditer le widget*, en bas de page, rouvre l'éditeur). Après *Appliquer à cette vue*, cliquez sur *Enregistrer* en haut à droite de la vue Grist pour garder le choix. Pour avoir les deux dans un document, ajoutez deux vues Personnalisées avec la même adresse. Ce choix n'est pas une protection : les droits restent ceux du document (Partager, Permissions avancées).

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_reunion`** de la table `Reunions`. Ne supprimez pas cette colonne.

La section *Champs supplémentaires des réunions* permet d'ajouter ses propres champs à la fiche d'une réunion (texte court ou long, choix dans une liste, date, nombre ; obligatoires ou non). Chaque champ devient une colonne de la table `Reunions`, créée à l'enregistrement des réglages ; il apparaît dans le formulaire de la réunion et dans le compte rendu. Retirer un champ des réglages ne supprime ni la colonne ni ses données.

## Ordre du jour participatif

L'équipe propose des points ; la personne qui anime les retient, les reporte ou les écarte. Trois compléments facultatifs, à activer dans *Réglages › Général* puis *Réglages › Données* (un propriétaire du document) :

| Complément | Ce qu'il fait | Ce qu'il demande |
| --- | --- | --- |
| **Date limite des propositions** | Un champ « Date limite des propositions de points » dans les informations de chaque réunion (dernier jour compris). Ensuite, le formulaire « Proposer un point » est replié et Grist refuse les nouveaux points, sauf ceux de la personne qui anime. | Bouton *Ajouter la date limite des propositions* (déjà présent dans un document installé depuis le 28/11/2026), puis la règle d'accès proposée. |
| **Propositions sans compte Grist** | Une table `Propositions_publiques`, où un questionnaire public dépose les propositions sans toucher à l'ordre du jour. Elles s'affichent à part (« Reçues par formulaire »), avec le nom déclaré, à reprendre dans les propositions ou à écarter. Chaque réunion en préparation propose « Copier le lien de proposition », avec la réunion déjà choisie. | Bouton *Créer la table des propositions sans compte*, un questionnaire [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) sur cette table (champs Titre, Description, Type, Duree, Porteur, Nom ; champ Reunion figé ou masqué), son lien dans *Publication*. |
| **Ordre du jour réservé à l'animation** | Seule la personne qui anime retient, reporte, écarte ou ordonne les points, reprend ou écarte les propositions reçues par formulaire, change la date limite et passe l'animation à une autre personne. Les autres ajoutent des points seulement comme propositions. | La table `Personnes` (annuaire) avec la colonne `Email`, les colonnes de lien `Animation_email` et les règles d'accès proposées (*Réglages › Données*). |

**Comment Grist tient la date limite.** La date d'une proposition (`Propose_le`, `Envoye_le`) peut être falsifiée par un envoi fait exprès. Quand la date limite est passée, l'outil note donc le numéro du dernier point reçu (`Reunions.Cloture_points`, et `Cloture_publiques` pour le formulaire) : tout point plus récent est refusé, quelle que soit sa date. Seules la personne qui anime et les propriétaires écrivent ces colonnes ; le gel se pose à la première ouverture de l'outil par l'une d'elles après la date limite. Les propositions par formulaire se ferment aussi quand la réunion quitte sa première étape. Repousser la date rouvre.

**Comment la personne qui anime est reconnue.** Par son nom dans le champ Animation, retrouvé dans `Personnes` : son adresse (`Animation_email`) n'est retenue que si un seul nom correspond, pour qu'un homonyme ajouté exprès ne prenne pas sa place. Cette protection vaut ce que valent les règles de `Personnes` : si un éditeur peut modifier l'adresse d'une autre fiche, il peut prendre sa place. Vérifiez avec *Voir en tant que*.

**Limites.** Dans un widget, Grist ne transmet pas le message d'une règle refusée : l'outil affiche le motif probable de l'action refusée. Les boutons Retenir, Reporter et Écarter restent visibles pour tout le monde, car un widget ne connaît pas l'adresse de la personne connectée : c'est Grist qui refuse. Sans les colonnes `Animation_email`, la date limite n'admet plus que les propriétaires.

## Modèle de données

| Table | Colonnes |
| --- | --- |
| `Reunions` | `Titre`, `Instance` (choix), `Date` (date), `Heure` (texte, « 09:30 »), `Duree_prevue` (entier, minutes), `Lieu`, `Animation`, `Secretariat`, `Participants`, `Excuses`, `Objectif`, `Statut` (choix), vos champs supplémentaires éventuels (une colonne chacun), `Config_reunion` |
| `Points` | `Reunion` (référence), `Titre`, `Description`, `Type` (choix), `Duree` (entier, minutes), `Porteur`, `Statut` (Proposé, Retenu, Reporté, Écarté), `Ordre` (nombre), `Notes`, `Traite` (case à cocher), `Propose_par` et `Propose_le` (remplis par Grist à la création : `user.Name` et `NOW()`) |
| `Decisions` | `Reunion` (référence), `Point` (référence), `Texte` |
| Ordre du jour participatif (facultatif) | `Reunions.Fin_propositions` (date), `Reunions.Cloture_points` et `Cloture_publiques` (entiers, posés par l'outil) ; `Points.Origine` (texte), `Points.Hors_delai` (calculée) ; table `Propositions_publiques` : `Reunion`, `Titre`, `Description`, `Type`, `Duree`, `Porteur`, `Nom` (déclaré), `Envoye_le` (`NOW()` à la création), `Recevable` (calculée), `Suite` (Reprise, Écartée), `Point` (référence au point créé) ; colonnes de lien `Animation_email` (Reunions, Points, Propositions_publiques) |
| `Actions_reunion` | `Reunion` (référence), `Point` (référence), `Intitule`, `Responsable` (texte), `Echeance` (date), `Etat` (choix) |

Les quatre statuts de `Points` sont utilisés par le code : ne les renommez pas. La table des actions s'appelle `Actions_reunion` pour pouvoir partager un document avec [grist-projet](https://github.com/lab17bis/grist-projet), qui a sa propre table `Actions`.

## Le reprendre et l'adapter

- **L'utiliser tel quel** : ajoutez le widget dans Grist. Aucune installation n'est nécessaire.
- **L'héberger chez vous** : copiez le dépôt (*Fork*), activez GitHub Pages ou déposez les fichiers sur un serveur web statique, puis changez l'adresse du widget dans Grist. Aucune compilation.
- **Modifier le code** :

| Dossier ou fichier | Rôle |
| --- | --- |
| `v1/` | Version stable figée, servie à l'adresse `…/v1/`. Ne pas modifier à la main. |
| `outils/figer-version.sh` | Copie la version en cours dans `vN/`. |
| `index.html`, `js/app.js`, `css/app.css` | L'application : réunions, ordre du jour, séance, compte rendu, suivi des actions, réglages |
| `commun/` | En-tête et pied de page configurables, communs aux outils `grist-*` |
| `exemples/demo.json` | Jeu d'exemple inventé, utilisé par la démonstration (dates relatives, « J+2 ») |
| `tests/` | Tests automatisés de l'interface : `python3 tests/test_reunion.py` (Playwright) |
| `vendor/dsfr/` | DSFR 1.15.4, embarqué pour ne dépendre d'aucun service externe |

## Fonctionnement et sécurité

- Le widget lit et écrit dans le document Grist avec les droits de la personne connectée. Il ne contourne aucune règle d'accès : si Grist refuse une écriture, le widget affiche le refus.
- Les propositions des collègues sont relues toutes les minutes et à la demande (bouton *Actualiser*). Une mise à jour n'interrompt jamais une saisie en cours.
- Le dépôt ne contient jamais de données réelles, de clé, d'adresse de document Grist, de nom ni d'adresse électronique réelle.

## Limites

- L'outil de travail fonctionne uniquement dans Grist, avec des personnes connectées. Une page publique en lecture seule existe pour le compte rendu diffusé (voir « Page publique »).
- Deux personnes qui modifient les notes du même point en même temps : la dernière enregistrée l'emporte.
- Le responsable d'une action est un texte libre, pas une référence à un annuaire.
- Aucun audit RGAA n'a été mené.

## Version stable et version en cours

Dans Grist, utilisez l'adresse de la **version stable** : `https://lab17bis.github.io/grist-reunion/v1/`. Elle ne change que pour corriger un défaut, sans toucher aux tables ni aux réglages. Une évolution qui les modifie paraît sous une nouvelle adresse (`v2/`) : les documents déjà en service restent sur `v1/` tant que vous ne changez pas l'adresse du widget.

L'adresse sans numéro (`https://lab17bis.github.io/grist-reunion/`) suit la version en cours de développement. Elle sert à essayer les nouveautés ; ne l'utilisez pas pour un document en service.

Pour figer une nouvelle version stable après des tests réussis : `sh outils/figer-version.sh 1` (ou `2` pour une version qui change les tables), puis publiez le dépôt.

## Données partagées avec les autres outils

Plusieurs outils de la même famille peuvent travailler dans un même document Grist. Ils suivent une règle commune pour ne pas dupliquer les données :

- **Une seule table `Personnes`** par document. Colonne commune : `Nom`. Colonnes facultatives reconnues par tous : `Email` et `Structure` (référence à `Structures`). Un outil lit cette table si elle existe et la crée seulement si elle manque. Il n'y ajoute que ses propres colonnes.
- **Une seule table `Structures`** pour les équipes, services ou établissements : `Nom`, `Sigle`, `Type`, `Parent` (structure de rattachement).
- **Aucun outil ne supprime ni ne renomme** une table ou une colonne qu'il n'a pas créée.
- **Les autres tables portent des noms propres à chaque outil**, pour éviter les collisions (par exemple `Actions` pour grist-projet, `Actions_reunion` pour grist-reunion). Les réglages sont rangés dans la description d'une colonne technique propre à l'outil (`Config_…`).
- **Identifier la personne connectée** : un widget ne connaît pas l'adresse de la personne connectée. Les colonnes « créé par » utilisent une formule `user.Email` calculée à la création. Seul un outil qui doit relier la personne connectée à sa fiche crée la table `Comptes`.
- **Une seule table `Reunions`**, celle de cet outil. Un outil de suivi de projets s'y branche avec deux colonnes facultatives : `Projet` (référence à `Projets`) et `Notes`. Si elles existent, le formulaire d'une réunion propose « Projet lié » et « Notes », et le compte rendu indique le projet.

Ce que fait cet outil : Il ne crée pas de table de personnes. Si `Personnes` existe, ses noms sont proposés dans les champs Animation, Secrétariat, Participants, Qui présente ? et Responsable.

**Réglages › Données** montre, pour ce document : les tables partagées et les outils qui s'en servent ; l'état des règles d'accès ; les colonnes de lien. Rien n'est modifié sans un clic d'un propriétaire.

- **Règles d'accès proposées** : l'auteur et la date d'une proposition de point (`Points.Propose_par`, `Points.Propose_le`) ne se modifient pas, sauf par les propriétaires. Avec l'ordre du jour participatif : date limite, ordre du jour réservé à l'animation, propositions reçues par formulaire non modifiables, non supprimables et illisibles sans compte (voir *Ordre du jour participatif*). Les règles d'une version précédente de l'outil sont remplacées au clic. Elle est posée à l'installation des tables ; dans un document existant, bouton *Installer les règles proposées*. Une règle n'est ajoutée que sur une table ou une colonne qui n'en a aucune : les règles existantes ne sont jamais modifiées. L'outil ne restreint pas la suppression des réunions : le suivi de projets crée et supprime aussi des lignes de `Reunions` (rendez-vous d'un projet).
- **Colonnes de lien** (bouton *Ajouter les colonnes de lien*) : `Reunions.Animation_email`, `Points.Animation_email` et `Propositions_publiques.Animation_email` donnent l'adresse de la personne qui anime, pour les règles d'accès ; `Points.Porteur_fiche`, `Actions_reunion.Responsable_fiche`, `Reunions.Animation_fiche` et `Reunions.Secretariat_fiche` relient le nom saisi à la fiche de `Personnes` (même nom, sans tenir compte des majuscules ni des espaces autour) ; `Actions_reunion.Projet` reprend le projet de la réunion (si `Reunions.Projet` existe). Ce sont des colonnes calculées par Grist : le texte saisi est gardé, une case vide signale un nom absent de l'annuaire ou écrit autrement, et supprimer une de ces colonnes ne perd aucune donnée. Le champ Participants, qui contient plusieurs noms, n'est pas relié.

## Espaces clés en main

Ce widget est déjà assemblé, avec d'autres, dans des **espaces** : des documents Grist complets à importer en une fois, vides ou avec un exemple fictif.

- [espace-pilotage](https://github.com/lab17bis/espace-pilotage) : piloter une équipe : management visuel, réunions, projets et indicateurs.
- [espace-collaboratif](https://github.com/lab17bis/espace-collaboratif) : travailler ensemble : réunions, projets partagés et ressources communes.
- [espace-communaute](https://github.com/lab17bis/espace-communaute) : animer une communauté de pratique ou un réseau : membres, groupes, rencontres et présences, ressources partagées (proposées aussi par formulaire public), retours et indicateurs.

## Autres outils de la même famille

- [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) : questionnaires au DSFR avec logique conditionnelle.
- [grist-catalogue](https://github.com/lab17bis/grist-catalogue) : catalogue public de fiches au DSFR.
- [grist-graphique](https://github.com/lab17bis/grist-graphique) : tableaux de bord et graphiques au DSFR.
- [grist-projet](https://github.com/lab17bis/grist-projet) : espace d'équipe pour gérer des projets.
- [grist-management](https://github.com/lab17bis/grist-management) : écran de management visuel d'équipe.
- [grist-consultation](https://github.com/lab17bis/grist-consultation) : consultations : boîte à idées, valorisation des réalisations, votes et suites données.
- [grist-annuaire](https://github.com/lab17bis/grist-annuaire) : annuaire des personnes et des structures d'un document : recherche, fiches, doublons, import, protection des données.
- [grist-carte](https://github.com/lab17bis/grist-carte) : carte interactive des lignes d'une table, au fond de l'IGN.
- [grist-graphe](https://github.com/lab17bis/grist-graphe) : cartographie des acteurs et de leurs liens.

Les widgets qui ont un en-tête et un pied de page partagent les mêmes réglages.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents publics par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)). Son usage est réservé aux sites des services de l'État.
- **[Communauté Grist francophone](https://forum.grist.libre.sh/)**.

## Mots-clés

Grist, widget Grist, widget-outil, réunion, ordre du jour, compte rendu, procès-verbal, relevé de décisions, plan d'action, suivi des actions, prise de notes, comité de pilotage, réunion d'équipe, DSFR, Système de design de l'État, La Suite numérique, DINUM, service public, clé en main, logiciel libre.

## Page publique

Page dédiée : `public.html?doc=<lien du document>`. Ce qui est publié dépend de l'étape de la réunion : « En préparation » n'est jamais publiée ; l'ordre du jour apparaît à l'étape suivante ; notes, décisions et actions seulement à la dernière étape (« Compte rendu diffusé »). Les participants et les excusés ne sont affichés que si la case correspondante est cochée dans l'onglet Publication.

L'onglet **Publication** construit le lien d'une page publique : collez le lien du document Grist partagé en lecture publique (*Partager › Accès public : Lecteur*), puis copiez ou ouvrez le lien obtenu. La page est en lecture seule, sans compte, et n'écrit jamais dans le document. L'option `integre=1` retire l'en-tête et le pied de page pour intégrer la page dans un autre site ou dans le [portail](https://github.com/lab17bis/grist-portail).

Le partage en lecture publique rend lisibles **toutes** les tables du document, pas seulement celles que la page affiche. Pour masquer une table ou une colonne au public, utilisez les règles d'accès de Grist, par exemple avec la condition `not user.IsLoggedIn` (lecture refusée). La page tolère une table masquée. Testez en navigation privée avant de diffuser le lien.

## Licence

Code sous licence MIT (voir `LICENSE`). Le DSFR embarqué dans `vendor/dsfr/` conserve sa propre licence. Réutilisation, adaptation et contributions bienvenues.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>

Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims.
