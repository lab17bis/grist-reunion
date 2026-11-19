# grist-reunion

> **Widget-outil pour Grist, clé en main.** Il transforme un document Grist en outil de réunion d'équipe, au Système de design de l'État (DSFR) : l'équipe propose des points, l'animateur arrête l'ordre du jour, la séance est prise en notes avec ses décisions et ses actions, et le compte rendu se met en page tout seul.

Tout se règle dans Grist, sans toucher au code : en-tête et pied de page, instances (types de réunion), étapes, types de points, états des actions, durée par défaut d'un point. Le dépôt ne contient que le code : aucune donnée, aucune réunion réelle.

## À quoi ça sert

| Moment | Ce que l'outil permet |
| --- | --- |
| **Avant** | Créer une réunion, recueillir les propositions de points de l'équipe (sujet, précisions, type, durée souhaitée, qui présente), les retenir, les reporter ou les écarter, ordonner l'ordre du jour. Les horaires de chaque point se calculent et un avertissement apparaît si l'ordre du jour dépasse la durée prévue |
| **Pendant** | Prendre des notes point par point, ajouter des décisions et des actions (responsable, échéance), suivre le temps avec un minuteur, marquer un point traité ou le reporter, revoir les actions encore ouvertes des réunions précédentes |
| **Après** | Un compte rendu au DSFR : informations pratiques, notes, décisions, relevé des actions, points reportés. Impression ou PDF, copie du texte pour un courriel, marquage « diffusé » |
| **Entre deux réunions** | *Suivi des actions* : toutes les actions ouvertes (en retard, dans les 7 jours, plus tard, sans échéance), filtrables par responsable et par instance. *Préparer la réunion suivante* reprend les informations pratiques et propose les points reportés |

Une **instance** regroupe les réunions d'une même série (réunion d'équipe, comité de pilotage…). Les actions ouvertes d'une instance réapparaissent à la réunion suivante de la même instance.

L'outil s'utilise **dans Grist** : chaque personne qui propose un point ou prend des notes doit être connectée au document. Pour recueillir des propositions de personnes qui n'ont pas accès au document, branchez [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) sur la table `Points`.

Démonstration avec des données fictives (rien n'est enregistré) : <https://lab17bis.github.io/grist-reunion/>

## Le brancher en 3 minutes

1. **Créer un document Grist vide** (ou ouvrir un document existant).
2. **Ajouter le widget** : *Ajouter › Ajouter une page › Personnalisé*, sur n'importe quelle table. Dans le panneau de droite, choisissez *URL personnalisée*, saisissez `https://lab17bis.github.io/grist-reunion/` et donnez l'**accès complet au document**.
3. **Installer** : le widget propose *Créer les tables*, ou *Créer les tables avec un exemple fictif* pour essayer. Il crée `Reunions`, `Points`, `Decisions` et `Actions_reunion` sans toucher aux tables existantes. À faire par un propriétaire du document.

Ensuite, invitez l'équipe dans le document (*Partager*), en éditeur pour proposer des points et prendre des notes. Pour plus de clarté, vous pouvez rattacher la vue personnalisée à la table `Reunions` et supprimer la table de départ.

## Le régler

L'écran *Réglages* regroupe l'en-tête et le pied de page, les listes de valeurs (instances, étapes d'une réunion, types de points, états des actions) et la durée proposée par défaut pour un point. Les choix des colonnes Grist sont mis à jour en même temps.

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_reunion`** de la table `Reunions`. Ne supprimez pas cette colonne.

## Modèle de données

| Table | Colonnes |
| --- | --- |
| `Reunions` | `Titre`, `Instance` (choix), `Date` (date), `Heure` (texte, « 09:30 »), `Duree_prevue` (entier, minutes), `Lieu`, `Animation`, `Secretariat`, `Participants`, `Excuses`, `Objectif`, `Statut` (choix), `Config_reunion` |
| `Points` | `Reunion` (référence), `Titre`, `Description`, `Type` (choix), `Duree` (entier, minutes), `Porteur`, `Statut` (Proposé, Retenu, Reporté, Écarté), `Ordre` (nombre), `Notes`, `Traite` (case à cocher), `Propose_par` et `Propose_le` (remplis par Grist à la création : `user.Name` et `NOW()`) |
| `Decisions` | `Reunion` (référence), `Point` (référence), `Texte` |
| `Actions_reunion` | `Reunion` (référence), `Point` (référence), `Intitule`, `Responsable` (texte), `Echeance` (date), `Etat` (choix) |

Les quatre statuts de `Points` sont utilisés par le code : ne les renommez pas. La table des actions s'appelle `Actions_reunion` pour pouvoir partager un document avec [grist-projet](https://github.com/lab17bis/grist-projet), qui a sa propre table `Actions`.

## Le reprendre et l'adapter

- **L'utiliser tel quel** : ajoutez le widget dans Grist. Aucune installation n'est nécessaire.
- **L'héberger chez vous** : copiez le dépôt (*Fork*), activez GitHub Pages ou déposez les fichiers sur un serveur web statique, puis changez l'adresse du widget dans Grist. Aucune compilation.
- **Modifier le code** :

| Dossier ou fichier | Rôle |
| --- | --- |
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

- Fonctionne uniquement dans Grist, avec des personnes connectées. Pas de page publique.
- Deux personnes qui modifient les notes du même point en même temps : la dernière enregistrée l'emporte.
- Le responsable d'une action est un texte libre, pas une référence à un annuaire.
- Aucun audit RGAA n'a été mené.

## Espaces clés en main

Ce widget est déjà assemblé, avec d'autres, dans des **espaces** : des documents Grist complets à importer en une fois, vides ou avec un exemple fictif.

- [espace-pilotage](https://github.com/lab17bis/espace-pilotage) : piloter une équipe : management visuel, réunions, projets et indicateurs.
- [espace-collaboratif](https://github.com/lab17bis/espace-collaboratif) : travailler ensemble : réunions, projets partagés et ressources communes.

## Autres outils de la même famille

- [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) : questionnaires au DSFR avec logique conditionnelle.
- [grist-catalogue](https://github.com/lab17bis/grist-catalogue) : catalogue public de fiches au DSFR.
- [grist-graphique](https://github.com/lab17bis/grist-graphique) : tableaux de bord et graphiques au DSFR.
- [grist-projet](https://github.com/lab17bis/grist-projet) : espace d'équipe pour gérer des projets.
- [grist-management](https://github.com/lab17bis/grist-management) : écran de management visuel d'équipe, qui affiche aussi la prochaine réunion et les actions ouvertes.

Ils partagent les mêmes réglages d'en-tête et de pied de page.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents publics par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)). Son usage est réservé aux sites des services de l'État.
- **[Communauté Grist francophone](https://forum.grist.libre.sh/)**.

## Mots-clés

Grist, widget Grist, widget-outil, réunion, ordre du jour, compte rendu, procès-verbal, relevé de décisions, plan d'action, suivi des actions, prise de notes, comité de pilotage, réunion d'équipe, DSFR, Système de design de l'État, La Suite numérique, DINUM, service public, clé en main, logiciel libre.

## Licence

Code sous licence MIT (voir `LICENSE`). Le DSFR embarqué dans `vendor/dsfr/` conserve sa propre licence. Réutilisation, adaptation et contributions bienvenues.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>
