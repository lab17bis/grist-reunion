/*
 * grist-reunion – préparer, tenir et restituer des réunions, widget-outil Grist au DSFR.
 *
 * Avant : l'équipe propose des points, l'animateur arrête l'ordre du jour.
 * Pendant : notes, décisions et actions par point, minuteur.
 * Après : compte rendu mis en page, imprimable, et suivi des actions.
 *
 * Le widget lit et écrit dans le document Grist avec les droits de la personne
 * connectée. Hors de Grist (page ouverte directement), il charge des données
 * fictives et simule les écritures en mémoire.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Référentiels par défaut (remplaçables dans les réglages)
  // ---------------------------------------------------------------------------

  var DEFAUTS = {
    instances: ["Réunion d'équipe", 'Comité de pilotage', 'Comité technique', 'Point projet', 'Séminaire'],
    statutsReunion: ['En préparation', 'Ordre du jour arrêté', 'Tenue', 'Compte rendu diffusé'],
    typesPoint: ['Information', 'Échange', 'Décision'],
    etatsAction: ['À faire', 'En cours', 'Fait', 'Abandonné']
  };
  var STATUTS_POINT = ['Proposé', 'Retenu', 'Reporté', 'Écarté'];
  var COULEUR_TYPE = { 'Information': 'info', 'Échange': 'new', 'Décision': 'warning' };
  var COULEUR_ETAT = { 'À faire': '', 'En cours': 'info', 'Fait': 'success', 'Abandonné': '' };
  var COULEUR_STATUT = { 'En préparation': 'new', 'Ordre du jour arrêté': 'info', 'Tenue': 'warning', 'Compte rendu diffusé': 'success' };

  var NOM_COLONNE_CONFIG = 'Config_reunion';
  var TABLES = ['Reunions', 'Points', 'Decisions', 'Actions_reunion'];
  // Nom distinct de la table Actions de grist-projet : les deux outils peuvent partager un document.
  var T_ACTIONS = 'Actions_reunion';
  // Ordre du jour participatif (facultatif, installé depuis Réglages) : date limite des propositions et propositions
  // reçues par un formulaire public. Un formulaire Grist publié écrit toutes les colonnes de sa table sans tenir compte
  // des règles d'accès : il est branché sur une table à part, jamais sur Points.
  var T_PUBLICS = 'Propositions_publiques';
  var F_HORS_DELAI = 'r = $Reunion\nif not r:\n  return False\nif r.Cloture_points and $id > r.Cloture_points:\n  return True\n' +
    'return bool(r.Fin_propositions and $Propose_le and $Propose_le.date() > r.Fin_propositions)';
  var F_RECEVABLE = 'r = $Reunion\nif not r or not ($Titre or "").strip():\n  return False\nif r.Cloture_publiques and $id > r.Cloture_publiques:\n  return False\n' +
    'return not (r.Fin_propositions and $Envoye_le and $Envoye_le.date() > r.Fin_propositions)';
  // Adresse de la personne qui anime : retenue seulement si un seul nom de Personnes correspond (un homonyme ajouté
  // exprès rend l'adresse vide, et la personne n'est alors plus reconnue).
  var F_EMAIL_ANIMATION = 'nom = ($Animation or "").strip().lower()\nif not nom:\n  return ""\n' +
    'l = [p for p in Personnes.all if (p.Nom or "").strip().lower() == nom]\nreturn (l[0].Email or "").strip() if len(l) == 1 else ""';
  var L = {};            // listes en vigueur
  var reglages = {};
  var DUREE_DEFAUT = 10;

  function appliquerReglages(r) {
    reglages = r || {};
    var l = reglages.listes || {};
    Object.keys(DEFAUTS).forEach(function (k) { L[k] = Array.isArray(l[k]) && l[k].length ? l[k] : DEFAUTS[k]; });
    DUREE_DEFAUT = Number(reglages.dureeDefaut) > 0 ? Number(reglages.dureeDefaut) : 10;
    var page = Object.assign({ marque: '', titre: 'Réunions', pied: { accessibilite: '' } }, reglages.page || {});
    if (window.PageDSFR) {
      var cible = window.PageDSFR.appliquer(page, { entete: document.getElementById('entete'), pied: document.getElementById('pied'), accueil: '#/' });
      cible.entete.id = 'entete';
      cible.pied.id = 'pied';
    }
  }

  // ---------------------------------------------------------------------------
  // État
  // ---------------------------------------------------------------------------

  var DEMO = window.self === window.top;
  var meta = { colonnes: [], tables: [], colConfig: false };
  var data = {}, idx = {};
  var etat = {
    alerte: null,
    brouillons: {},
    suppression: null,
    filtreInstance: '',
    filtreResponsable: '',
    passees: false,
    chrono: null,          // { point, debut } : minuteur du point en cours
    rendreApresSaisie: false
  };
  var app = document.getElementById('rn-app');

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function texteMultiligne(t) { return esc(t).replace(/\n/g, '<br>'); }

  // Les colonnes Date de Grist sont des secondes depuis 1970, à minuit UTC.
  function dateTexte(sec, long) {
    if (!sec) return '';
    return new Date(sec * 1000).toLocaleDateString('fr-FR', long ? { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { timeZone: 'UTC' });
  }
  function dateVersSaisie(sec) { return sec ? new Date(sec * 1000).toISOString().slice(0, 10) : ''; }
  function saisieVersDate(txt) {
    var p = String(txt || '').split('-');
    return p.length === 3 ? Date.UTC(+p[0], +p[1] - 1, +p[2]) / 1000 : null;
  }
  function aujourdhui() { var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; }
  function minutesVersHeure(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function heureVersMinutes(h) { var m = String(h || '').match(/^(\d{1,2})[:h](\d{2})?$/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null; }
  function dureeTexte(min) { min = num(min); if (!min) return ''; return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') : ''); }

  function badge(texte, couleur) {
    if (!texte) return '';
    return '<span class="fr-badge fr-badge--sm fr-badge--no-icon' + (couleur ? ' fr-badge--' + couleur : '') + '">' + esc(texte) + '</span>';
  }
  function lignesDepuisColonnes(cols) {
    var ids = cols.id || [], cles = Object.keys(cols), res = [];
    for (var i = 0; i < ids.length; i++) { var l = {}; cles.forEach(function (k) { l[k] = cols[k][i]; }); res.push(l); }
    return res;
  }
  function brouillon(cle) { return (etat.brouillons[cle] = etat.brouillons[cle] || {}); }

  // ---------------------------------------------------------------------------
  // Données
  // ---------------------------------------------------------------------------

  function chargerDemo() {
    appliquerReglages({ page: { titre: 'Réunions', sousTitre: 'Démonstration' } });
    return fetch('exemples/demo.json').then(function (r) { return r.json(); }).then(function (json) {
      // Dates relatives (« J+7 ») pour que la démonstration reste à jour.
      var auj = aujourdhui();
      TABLES.forEach(function (t) {
        data[t] = (json[t] || []).map(function (l) {
          var c = Object.assign({}, l);
          ['Date', 'Echeance', 'Fin_propositions'].forEach(function (k) {
            if (typeof c[k] === 'string') { var m = c[k].match(/^J([+-]\d+)$/); c[k] = m ? auj + 86400 * (+m[1]) : saisieVersDate(c[k]); }
          });
          return c;
        });
      });
      data.Personnes = json.Personnes || [];
      data.Projets = json.Projets || [];
      data[T_PUBLICS] = (json[T_PUBLICS] || []).map(function (l) { return Object.assign({}, l); });
    });
  }

  function chargerGrist() {
    var config = Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')])
      .then(function (m) {
        var tables = lignesDepuisColonnes(m[0]), cols = lignesDepuisColonnes(m[1]);
        var t = tables.filter(function (x) { return x.tableId === 'Reunions'; })[0];
        meta.tables = tables; meta.colonnes = cols;
        var c = t && cols.filter(function (x) { return x.parentId === t.id && x.colId === NOM_COLONNE_CONFIG; })[0];
        meta.colConfig = !!c;
        var r = {};
        try { r = c && c.description ? JSON.parse(c.description) : {}; } catch (e) { r = {}; }
        appliquerReglages(r);
      }).catch(function () { appliquerReglages({}); });
    // Table Personnes partagée avec les autres outils (facultative) : ses noms sont proposés à la saisie.
    var personnes = grist.docApi.fetchTable('Personnes').then(function (c) { data.Personnes = lignesDepuisColonnes(c); }).catch(function () { data.Personnes = []; });
    // Table Projets de l'outil de suivi de projets (facultative) : proposée pour rattacher une réunion à un projet.
    var projets = grist.docApi.fetchTable('Projets').then(function (c) { data.Projets = lignesDepuisColonnes(c); }).catch(function () { data.Projets = []; });
    // Propositions reçues par formulaire public (facultatives) et sections Grist (formulaire publié sur Points ?).
    var publics = grist.docApi.fetchTable(T_PUBLICS).then(function (c) { data[T_PUBLICS] = lignesDepuisColonnes(c); }).catch(function () { data[T_PUBLICS] = []; });
    var sections = grist.docApi.fetchTable('_grist_Views_section').then(function (v) { meta.sections = lignesDepuisColonnes(v); }).catch(function () { meta.sections = null; });
    return Promise.all([config, personnes, projets, publics, sections].concat(TABLES.map(function (t) {
      return grist.docApi.fetchTable(t).then(function (c) { data[t] = lignesDepuisColonnes(c); }).catch(function () { data[t] = []; });
    })));
  }

  function charger() {
    return (DEMO ? chargerDemo() : chargerGrist()).then(indexer).then(function () { if (!DEMO) gelerPropositions(); });
  }
  // Date limite des propositions. Quand elle est passée, l'outil note le numéro du dernier point (et de la dernière
  // proposition reçue par formulaire) : Grist refuse ensuite tout point plus récent (colonne Hors_delai, règle d'accès),
  // même avec une date falsifiée. Les propositions par formulaire se ferment aussi quand la réunion quitte sa première
  // étape. Repousser la date rouvre. Écrit par qui en a le droit (règles posées : l'animation et les propriétaires).
  function gelerPropositions() {
    if (!aColonne('Reunions', 'Cloture_points')) return;
    var auj = aujourdhui(), acts = [];
    var dernier = function (l) { return (l || []).reduce(function (m, x) { return Math.max(m, num(x.id)); }, 0) || -1; };
    var dp = dernier(data.Points), dpub = dernier(data[T_PUBLICS]), avecPub = aColonne('Reunions', 'Cloture_publiques') && aTablePublics();
    (data.Reunions || []).forEach(function (r) {
      var fin = num(r.Fin_propositions), ferme = !!fin && auj > fin, champs = {};
      if (ferme && !num(r.Cloture_points)) champs.Cloture_points = dp;
      else if (!ferme && num(r.Cloture_points)) champs.Cloture_points = 0;
      if (avecPub) {
        var fermePub = ferme || ((r.Statut || L.statutsReunion[0]) !== L.statutsReunion[0]);
        if (fermePub && !num(r.Cloture_publiques)) champs.Cloture_publiques = dpub;
        else if (!fermePub && num(r.Cloture_publiques)) champs.Cloture_publiques = 0;
      }
      if (Object.keys(champs).length) { acts.push(['UpdateRecord', 'Reunions', r.id, champs]); Object.assign(r, champs); }
    });
    if (acts.length) grist.docApi.applyUserActions(acts).catch(function () { /* sans droit : le gel attendra l'animation */ });
  }
  function propositionsOuvertes(r) { var fin = num(r && r.Fin_propositions); return !fin || aujourdhui() <= fin; }
  function propositionsPubliques(rid) {
    return (data[T_PUBLICS] || []).filter(function (x) { return num(x.Reunion) === rid && x.Recevable && !x.Suite; })
      .sort(function (a, b) { return a.id - b.id; });
  }
  function lienProposition(r) {
    var u = reglages.publication && reglages.publication.lienProposition;
    if (!u || !r) return '';
    u = String(u).replace(/\{reunion\}/g, r.id);
    var base = window.PageDSFR && window.PageDSFR.adresseSure ? window.PageDSFR.adresseSure(u) : '';
    if (!base) return '';
    try { var x = new URL(base); if (!x.searchParams.has('pre_Reunion')) x.searchParams.set('pre_Reunion', r.id); return x.href; } catch (e) { return ''; }
  }
  function indexer() {
    idx = {};
    TABLES.concat([T_PUBLICS]).forEach(function (t) { idx[t] = {}; (data[t] || []).forEach(function (l) { idx[t][l.id] = l; }); });
  }

  function pointsDe(rid, statut) {
    return data.Points.filter(function (p) { return num(p.Reunion) === rid && (!statut || (p.Statut || 'Proposé') === statut); })
      .sort(function (a, b) { return (a.Ordre || 0) - (b.Ordre || 0) || a.id - b.id; });
  }
  function decisionsDe(rid, pid) { return data.Decisions.filter(function (d) { return num(d.Reunion) === rid && (pid === undefined || num(d.Point) === pid); }); }
  function actionsDe(rid, pid) { return data[T_ACTIONS].filter(function (a) { return num(a.Reunion) === rid && (pid === undefined || num(a.Point) === pid); }); }
  function actionOuverte(a) { return a.Etat !== 'Fait' && a.Etat !== 'Abandonné'; }

  // Actions encore ouvertes des réunions précédentes de la même instance.
  function actionsPrecedentes(r) {
    var avant = data.Reunions.filter(function (x) {
      return x.id !== r.id && (x.Instance || '') === (r.Instance || '') && (x.Date || 0) <= (r.Date || 9e12);
    }).map(function (x) { return x.id; });
    return data[T_ACTIONS].filter(function (a) { return avant.indexOf(num(a.Reunion)) >= 0 && actionOuverte(a); })
      .sort(function (a, b) { return (a.Echeance || 9e12) - (b.Echeance || 9e12); });
  }

  function reunionsTriees(passees) {
    var auj = aujourdhui();
    return data.Reunions.filter(function (r) {
      var finie = (r.Date && r.Date < auj) || r.Statut === 'Compte rendu diffusé';
      if (etat.filtreInstance && (r.Instance || '') !== etat.filtreInstance) return false;
      return passees ? finie : !finie;
    }).sort(function (a, b) { return passees ? (b.Date || 0) - (a.Date || 0) : (a.Date || 9e12) - (b.Date || 9e12); });
  }

  // ---------------------------------------------------------------------------
  // Écritures
  // ---------------------------------------------------------------------------

  function ecrire(actions) {
    if (!DEMO) return grist.docApi.applyUserActions(actions);
    var ret = [];
    actions.forEach(function (a) {
      var t = a[1];
      if (a[0] === 'AddRecord') {
        var id = data[t].reduce(function (m, l) { return Math.max(m, l.id); }, 0) + 1;
        var l = Object.assign({ id: id }, a[3]);
        if (t === 'Points') { l.Propose_par = 'Vous (démonstration)'; l.Propose_le = Date.now() / 1000; }
        data[t].push(l); ret.push(id);
      } else if (a[0] === 'UpdateRecord') {
        Object.assign(idx[t][a[2]], a[3]); ret.push(null);
      } else if (a[0] === 'RemoveRecord') {
        data[t] = data[t].filter(function (l) { return l.id !== a[2]; }); ret.push(null);
      }
      indexer();
    });
    return Promise.resolve({ retValues: ret });
  }

  function executer(actions, message, apres) {
    return ecrire(actions).then(function (res) {
      if (apres) apres(res);
      etat.alerte = message ? { type: 'success', texte: message } : null;
      return DEMO ? null : charger();
    }).then(rendre).catch(refus);
  }
  // Refus d'une règle d'accès : Grist transmet le message de la règle (memo), plus parlant que le détail technique.
  function refus(err) {
    var memos = ((err && err.details && err.details.memos) || []).map(function (m) { return typeof m === 'string' ? m : (m && m.text) || ''; })
      .filter(function (m, i, l) { return m && l.indexOf(m) === i; });
    var msg = String((err && err.message) || err);
    etat.alerte = { type: 'error', texte: memos.length ? 'Enregistrement refusé : ' + memos.join(' ') :
      /access rules/i.test(msg) ? 'Enregistrement refusé par les règles d\'accès du document.' :
      'Enregistrement refusé par Grist. Vérifiez vos droits sur le document. (' + msg + ')' };
    rendre();
  }

  // ---------------------------------------------------------------------------
  // Routage
  // ---------------------------------------------------------------------------

  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'reunion' && num(h[1])) return { vue: 'reunion', id: num(h[1]), onglet: h[2] || 'ordre' };
    if (h[0] === 'nouvelle') return { vue: 'nouvelle', depuis: num(h[1]) };
    if (h[0] === 'actions') return { vue: 'actions' };
    if (h[0] === 'reglages') return { vue: 'reglages' };
    return { vue: 'accueil' };
  }

  function rendre() {
    var r = route(), html;
    monterCoque();
    if (!DEMO && tablesManquantes().length) { app.innerHTML = vueInstallation(); return; }
    if (r.vue === 'reunion') html = vueReunion(r.id, r.onglet);
    else if (r.vue === 'nouvelle') html = vueNouvelle(r.depuis);
    else if (r.vue === 'actions') html = vueActions();
    else html = vueAccueil();
    // Une seule liste de suggestions de noms par écran.
    if (html.indexOf('list="rn-personnes"') >= 0 && html.indexOf('id="rn-personnes"') < 0) html += datalistPersonnes(r.id ? (idx.Reunions || {})[r.id] : null);
    app.innerHTML = blocColonnesManquantes() + html;
    majChrono();
  }

  function navigation(active) {
    var liens = [['#/', 'Réunions', 'accueil'], ['#/actions', 'Suivi des actions', 'actions']];
    return '<nav class="rn-nav" aria-label="Navigation de l\'outil"><ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--sm">' +
      liens.map(function (l) {
        return '<li><a class="fr-btn ' + (l[2] === active ? '' : 'fr-btn--secondary') + '" href="' + l[0] + '"' + (l[2] === active ? ' aria-current="page"' : '') + '>' + l[1] + '</a></li>';
      }).join('') + '<li class="rn-nav__config"><a class="fr-btn fr-btn--tertiary" href="#/reglages">Configurer</a></li></ul></nav>';
  }

  function blocAlerte() {
    if (!etat.alerte) return '';
    return '<div class="fr-alert fr-alert--sm fr-alert--' + etat.alerte.type + ' rn-alerte" role="' + (etat.alerte.type === 'error' ? 'alert' : 'status') + '"><p>' + esc(etat.alerte.texte) + '</p></div>';
  }

  function champ(id, lib, val, o) {
    o = o || {};
    var attrs = (o.attrs || '') + (o.requis ? ' required' : '');
    var aide = o.aide ? '<span class="fr-hint-text">' + esc(o.aide) + '</span>' : '';
    var saisie = o.multiligne ?
      '<textarea class="fr-input" id="' + id + '" rows="' + (o.lignes || 3) + '" ' + attrs + '>' + esc(val) + '</textarea>' :
      '<input class="fr-input" id="' + id + '" type="' + (o.type || 'text') + '" value="' + esc(val) + '" ' + attrs + '>';
    return '<div class="fr-input-group' + (o.classe ? ' ' + o.classe : '') + '"><label class="fr-label" for="' + id + '">' + esc(lib) + (o.requis ? ' <span class="rn-requis">(obligatoire)</span>' : '') + aide + '</label>' + saisie + '</div>';
  }
  function select(id, lib, val, options, attrs, vide) {
    var h = '<div class="fr-select-group"><label class="fr-label" for="' + id + '">' + esc(lib) + '</label><select class="fr-select" id="' + id + '" ' + (attrs || '') + '>';
    if (vide !== undefined) h += '<option value="">' + esc(vide) + '</option>';
    options.forEach(function (o) { h += '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; });
    return h + '</select></div>';
  }

  // ---------------------------------------------------------------------------
  // Vue : liste des réunions
  // ---------------------------------------------------------------------------

  function carteReunion(r) {
    var retenus = pointsDe(r.id, 'Retenu'), proposes = pointsDe(r.id, 'Proposé');
    var duree = retenus.reduce(function (s, p) { return s + num(p.Duree); }, 0);
    var ouvertes = actionsDe(r.id).filter(actionOuverte).length;
    return '<div class="fr-card fr-enlarge-link fr-card--sm"><div class="fr-card__body"><div class="fr-card__content">' +
      '<h3 class="fr-card__title"><a href="#/reunion/' + r.id + '">' + esc(r.Titre || 'Réunion sans titre') + '</a></h3>' +
      '<p class="fr-card__desc">' + esc(dateTexte(r.Date, true)) + (r.Heure ? ' à ' + esc(r.Heure) : '') + (r.Lieu ? ' · ' + esc(r.Lieu) : '') + '</p>' +
      '<div class="fr-card__start"><ul class="rn-badges">' + '<li>' + badge(r.Statut || L.statutsReunion[0], COULEUR_STATUT[r.Statut || L.statutsReunion[0]]) + '</li>' +
      (r.Instance ? '<li>' + badge(r.Instance) + '</li>' : '') + '</ul></div>' +
      '<div class="fr-card__end"><p class="fr-card__detail">' + retenus.length + ' point' + (retenus.length > 1 ? 's' : '') + ' à l\'ordre du jour' + (duree ? ' (' + dureeTexte(duree) + ')' : '') +
      (proposes.length ? ' · ' + proposes.length + ' proposition' + (proposes.length > 1 ? 's' : '') + ' à examiner' : '') +
      (ouvertes ? ' · ' + ouvertes + ' action' + (ouvertes > 1 ? 's' : '') + ' ouverte' + (ouvertes > 1 ? 's' : '') : '') + '</p></div>' +
      '</div></div></div>';
  }

  function vueAccueil() {
    var avenir = reunionsTriees(false), passees = reunionsTriees(true);
    var instances = L.instances.slice();
    data.Reunions.forEach(function (r) { if (r.Instance && instances.indexOf(r.Instance) < 0) instances.push(r.Instance); });
    var h = navigation('accueil') + '<div class="rn-titre-ligne"><h1 class="fr-h3">Réunions</h1>' +
      '<a class="fr-btn fr-icon-add-line fr-btn--icon-left" href="#/nouvelle">Nouvelle réunion</a></div>' + blocAlerte() +
      '<div class="rn-filtres">' + select('f-instance', 'Instance', etat.filtreInstance, instances, 'data-filtre="instance"', 'Toutes les instances') + '</div>' +
      '<h2 class="fr-h5">À venir et en cours</h2>' +
      (avenir.length ? '<div class="rn-cartes">' + avenir.map(carteReunion).join('') + '</div>' :
        '<p>Aucune réunion à venir. <a href="#/nouvelle">Préparer une réunion</a>.</p>') +
      '<h2 class="fr-h5 fr-mt-4w">Réunions passées <span class="rn-compte">(' + passees.length + ')</span></h2>';
    if (passees.length) {
      var visibles = etat.passees ? passees : passees.slice(0, 6);
      h += '<div class="rn-cartes">' + visibles.map(carteReunion).join('') + '</div>';
      if (passees.length > 6) h += '<button type="button" class="fr-btn fr-btn--tertiary fr-btn--sm fr-mt-2w" data-action="voir-passees">' + (etat.passees ? 'Afficher moins' : 'Afficher toutes les réunions passées') + '</button>';
    } else h += '<p>Aucune réunion passée.</p>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Vue : nouvelle réunion (vide ou suite d'une réunion)
  // ---------------------------------------------------------------------------

  function vueNouvelle(depuis) {
    var src = depuis ? idx.Reunions[depuis] : null;
    var b = brouillon('nouvelle-' + (depuis || 0));
    if (!b._init) {
      Object.assign(b, { _init: true, Titre: src ? src.Titre : '', Instance: src ? src.Instance : '', Date: '', Heure: src ? src.Heure : '', Duree_prevue: src ? src.Duree_prevue : '',
        Lieu: src ? src.Lieu : '', Animation: src ? src.Animation : '', Secretariat: src ? src.Secretariat : '', Participants: src ? src.Participants : '', Objectif: '' });
    }
    var reportes = src ? pointsDe(src.id, 'Reporté') : [];
    var h = navigation('') + '<div class="rn-titre-ligne"><h1 class="fr-h3">' + (src ? 'Préparer la réunion suivante' : 'Nouvelle réunion') + '</h1><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="' + (src ? '#/reunion/' + src.id : '#/') + '">Retour</a></div>' + blocAlerte();
    if (src) h += '<p>Les informations pratiques reprennent celles de « ' + esc(src.Titre) + ' ». ' +
      (reportes.length ? reportes.length + ' point(s) reporté(s) seront proposés à l\'ordre du jour.' : '') + '</p>';
    h += '<form data-form="nouvelle" data-depuis="' + (depuis || 0) + '" class="rn-form">' + formulaireReunion('n', b, 'data-brouillon="nouvelle-' + (depuis || 0) + '"') +
      '<ul class="fr-btns-group fr-btns-group--inline-md"><li><button class="fr-btn" type="submit">Créer la réunion</button></li></ul></form>';
    return h;
  }

  function formulaireReunion(p, b, attrs) {
    var instances = L.instances.slice();
    if (b.Instance && instances.indexOf(b.Instance) < 0) instances.push(b.Instance);
    function a(c) { return attrs + ' data-champ="' + c + '"'; }
    return '<div class="rn-grille">' +
      champ(p + '-titre', 'Titre', b.Titre, { requis: true, attrs: a('Titre'), classe: 'rn-large' }) +
      select(p + '-instance', 'Instance', b.Instance || '', instances, a('Instance'), '— Aucune —') +
      champ(p + '-date', 'Date', b.Date ? (typeof b.Date === 'number' ? dateVersSaisie(b.Date) : b.Date) : '', { type: 'date', attrs: a('Date') }) +
      champ(p + '-heure', 'Heure de début', b.Heure, { type: 'time', attrs: a('Heure') }) +
      champ(p + '-duree', 'Durée prévue (minutes)', b.Duree_prevue || '', { type: 'number', attrs: a('Duree_prevue') + ' min="0" step="5"' }) +
      champ(p + '-lieu', 'Lieu ou lien de visioconférence', b.Lieu, { attrs: a('Lieu') }) +
      champ(p + '-anim', 'Animation', b.Animation, { attrs: a('Animation') + ' list="rn-personnes"' }) +
      champ(p + '-secr', 'Secrétariat de séance', b.Secretariat, { attrs: a('Secretariat') + ' list="rn-personnes"' }) +
      (DEMO || aColonne('Reunions', 'Fin_propositions') ? champ(p + '-finprop', 'Date limite des propositions de points', b.Fin_propositions ? (typeof b.Fin_propositions === 'number' ? dateVersSaisie(b.Fin_propositions) : b.Fin_propositions) : '',
        { type: 'date', aide: 'Facultatif. Le dernier jour compris. Ensuite, seule la personne qui anime ajoute des points (si les règles d\'accès proposées sont posées).', attrs: a('Fin_propositions') }) : '') +
      champ(p + '-obj', 'Objectif de la réunion', b.Objectif, { multiligne: true, lignes: 2, attrs: a('Objectif'), classe: 'rn-large' }) +
      champ(p + '-part', 'Participants', b.Participants, { multiligne: true, lignes: 2, aide: 'Noms séparés par des virgules ou des retours à la ligne.', attrs: a('Participants'), classe: 'rn-large' }) +
      ajoutParticipants(p) +
      (p === 'i' ? champ(p + '-exc', 'Excusés', b.Excuses, { multiligne: true, lignes: 2, attrs: a('Excuses'), classe: 'rn-large' }) : '') +
      champProjetLie(p, b, a) +
      (aColonne('Reunions', 'Notes') ? champ(p + '-notes', 'Notes', b.Notes || '', { multiligne: true, lignes: 3, attrs: a('Notes'), classe: 'rn-large' }) : '') +
      champsPersoFormulaire(p, b, attrs) +
      '</div>';
  }

  // Colonne Projet de la table Reunions, partagée avec l'outil de suivi de projets : une réunion peut être rattachée à un projet.
  function nomProjet(r) {
    var x = r && r.Projet ? (data.Projets || []).filter(function (y) { return y.id === num(r.Projet); })[0] : null;
    return x ? String(x.Titre || '').trim() : '';
  }
  function champProjetLie(p, b, a) {
    var projets = aColonne('Reunions', 'Projet') ? (data.Projets || []).filter(function (x) { return String(x.Titre || '').trim(); }) : [];
    if (!projets.length) return '';
    return '<div class="fr-select-group rn-large"><label class="fr-label" for="' + p + '-projet">Projet lié<span class="fr-hint-text">Facultatif. La réunion apparaît alors dans l\'onglet Rendez-vous du projet.</span></label>' +
      '<select class="fr-select" id="' + p + '-projet" ' + a('Projet') + '><option value="">— Aucun —</option>' +
      projets.map(function (x) { return '<option value="' + x.id + '"' + (num(b.Projet) === x.id ? ' selected' : '') + '>' + esc(x.Titre) + '</option>'; }).join('') + '</select></div>';
  }

  // Liste déroulante qui ajoute une personne de la table Personnes au champ Participants.
  function ajoutParticipants(p) {
    var noms = nomsPersonnes();
    if (!noms.length) return '';
    return '<div class="fr-select-group rn-large fr-mb-3w"><label class="fr-label" for="' + p + '-ajout">Ajouter une personne de la table Personnes</label>' +
      '<select class="fr-select" id="' + p + '-ajout" data-ajout-participant="' + p + '-part"><option value="">Choisir une personne</option>' +
      noms.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('') + '</select></div>';
  }

  function manquesPerso(b) { return champsPerso().filter(function (c) { return c.requis && (b[c.id] === undefined || b[c.id] === null || String(b[c.id]).trim() === ''); }).map(function (c) { return '« ' + c.label + ' »'; }); }
  function champsReunion(b) {
    var plus = {};
    if (aColonne('Reunions', 'Projet')) plus.Projet = num(b.Projet) || 0;
    if (aColonne('Reunions', 'Notes')) plus.Notes = b.Notes || '';
    if (DEMO || aColonne('Reunions', 'Fin_propositions')) plus.Fin_propositions = typeof b.Fin_propositions === 'number' ? b.Fin_propositions : (saisieVersDate(b.Fin_propositions) || null);
    return Object.assign(plus, { Titre: String(b.Titre || '').trim(), Instance: b.Instance || '', Date: typeof b.Date === 'number' ? b.Date : saisieVersDate(b.Date),
      Heure: b.Heure || '', Duree_prevue: num(b.Duree_prevue) || null, Lieu: b.Lieu || '', Animation: b.Animation || '', Secretariat: b.Secretariat || '',
      Participants: b.Participants || '', Objectif: b.Objectif || '', Excuses: b.Excuses || '' });
  }
  function champsReunionComplets(b) {
    return Object.assign(champsReunion(b), champsPersoValeurs(b));
  }

  // ---------------------------------------------------------------------------
  // Vue : une réunion
  // ---------------------------------------------------------------------------

  var ONGLETS = [['ordre', "Ordre du jour"], ['seance', 'Séance'], ['cr', 'Compte rendu'], ['infos', 'Informations']];

  function vueReunion(id, onglet) {
    var r = idx.Reunions[id];
    if (!r) return navigation('') + '<div class="fr-alert fr-alert--error"><p>Réunion introuvable. <a href="#/">Retour à la liste</a></p></div>';
    var statut = r.Statut || L.statutsReunion[0];
    var h = navigation('') + '<div class="rn-titre-ligne rn-ecran"><div><h1 class="fr-h3">' + esc(r.Titre || 'Réunion sans titre') + '</h1>' +
      '<p class="rn-meta">' + esc(dateTexte(r.Date, true)) + (r.Heure ? ' à ' + esc(r.Heure) : '') + (r.Lieu ? ' · ' + esc(r.Lieu) : '') + '</p>' +
      '<ul class="rn-badges"><li>' + badge(statut, COULEUR_STATUT[statut]) + '</li>' + (r.Instance ? '<li>' + badge(r.Instance) + '</li>' : '') + '</ul></div>' +
      '<div class="rn-statut">' + select('r-statut', 'Étape', statut, L.statutsReunion, 'data-statut="' + r.id + '"') + '</div></div>' +
      '<nav class="rn-onglets rn-ecran" aria-label="Sections de la réunion"><ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--sm">' +
      ONGLETS.map(function (o) {
        var actif = o[0] === onglet;
        return '<li><a class="fr-btn ' + (actif ? '' : 'fr-btn--tertiary') + '" href="#/reunion/' + id + '/' + o[0] + '"' + (actif ? ' aria-current="page"' : '') + '>' + o[1] + '</a></li>';
      }).join('') + '</ul></nav>' + '<div class="rn-ecran">' + blocAlerte() + '</div>';
    if (onglet === 'seance') h += ongletSeance(r);
    else if (onglet === 'cr') h += ongletCompteRendu(r);
    else if (onglet === 'infos') h += ongletInfos(r);
    else h += ongletOrdre(r);
    return h;
  }

  // --- Ordre du jour ---------------------------------------------------------

  function horaires(r, points) {
    var debut = heureVersMinutes(r.Heure), t = debut;
    return points.map(function (p) { var s = t; if (t !== null) t += num(p.Duree); return s === null ? '' : minutesVersHeure(s); });
  }

  function ongletOrdre(r) {
    var retenus = pointsDe(r.id, 'Retenu'), proposes = pointsDe(r.id, 'Proposé');
    var autres = pointsDe(r.id).filter(function (p) { return p.Statut === 'Reporté' || p.Statut === 'Écarté'; });
    var total = retenus.reduce(function (s, p) { return s + num(p.Duree); }, 0);
    var hor = horaires(r, retenus);
    var h = '';
    if (r.Objectif) h += '<p class="rn-objectif"><strong>Objectif :</strong> ' + esc(r.Objectif) + '</p>';
    h += '<div class="rn-colonnes"><section class="rn-col-principale"><h2 class="fr-h5">Ordre du jour</h2>';
    h += '<p class="rn-total">' + retenus.length + ' point' + (retenus.length > 1 ? 's' : '') + ' · ' + (dureeTexte(total) || '0 min') +
      (r.Duree_prevue ? ' sur ' + dureeTexte(r.Duree_prevue) + ' prévues' : '') + '</p>';
    if (r.Duree_prevue && total > num(r.Duree_prevue)) {
      h += '<div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w"><p>L\'ordre du jour dépasse la durée prévue de ' + dureeTexte(total - num(r.Duree_prevue)) + '.</p></div>';
    }
    if (!retenus.length) h += '<p>Aucun point retenu. Retenez des propositions ou ajoutez un point.</p>';
    else {
      h += '<ol class="rn-odj">';
      retenus.forEach(function (p, i) {
        h += '<li class="rn-point"><div class="rn-point__tete"><span class="rn-point__heure">' + esc(hor[i]) + '</span>' +
          '<div class="rn-point__corps"><p class="rn-point__titre">' + esc(p.Titre) + '</p>' +
          '<p class="rn-point__meta">' + badge(p.Type, COULEUR_TYPE[p.Type]) + ' ' + esc(dureeTexte(p.Duree)) + (p.Porteur ? ' · porté par ' + esc(p.Porteur) : '') + '</p>' +
          (p.Description ? '<p class="rn-point__desc">' + texteMultiligne(p.Description) + '</p>' : '') + '</div>' +
          '<ul class="rn-point__outils">' +
          '<li><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-up-line" title="Monter" data-deplacer="' + p.id + '" data-sens="-1"' + (i === 0 ? ' disabled' : '') + '>Monter</button></li>' +
          '<li><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-down-line" title="Descendre" data-deplacer="' + p.id + '" data-sens="1"' + (i === retenus.length - 1 ? ' disabled' : '') + '>Descendre</button></li>' +
          '<li><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" data-point-statut="' + p.id + '" data-valeur="Proposé">Retirer</button></li></ul></div></li>';
      });
      h += '</ol>';
    }
    // Suivi des actions des réunions précédentes de la même instance.
    var prec = actionsPrecedentes(r);
    if (prec.length) {
      h += '<h3 class="fr-h6 fr-mt-3w">Actions en cours des réunions précédentes</h3>' + tableauActions(prec, true);
    }
    h += '</section><aside class="rn-col-laterale">';
    var pubs = propositionsPubliques(r.id), ouvert = propositionsOuvertes(r), lp = lienProposition(r);
    h += '<h2 class="fr-h5">Propositions <span class="rn-compte">(' + (proposes.length + pubs.length) + ')</span></h2>';
    if (num(r.Fin_propositions)) h += '<p class="fr-text--sm rn-limite">' + (ouvert ? 'Propositions ouvertes jusqu\'au ' + esc(dateTexte(r.Fin_propositions, true)) + ' inclus.' :
      'Date limite des propositions passée (' + esc(dateTexte(r.Fin_propositions, true)) + ').') + '</p>';
    if (lp && ouvert && (r.Statut || L.statutsReunion[0]) === L.statutsReunion[0]) h += '<p><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-links-line fr-btn--icon-left" data-action="copier-lien-proposition" data-lien="' + esc(lp) + '">Copier le lien de proposition</button></p>';
    if (!proposes.length && !pubs.length) h += '<p class="fr-text--sm">Aucune proposition en attente.</p>';
    proposes.forEach(function (p) {
      h += '<div class="rn-proposition"><p class="rn-point__titre">' + esc(p.Titre) + '</p>' +
        '<p class="rn-point__meta">' + badge(p.Type, COULEUR_TYPE[p.Type]) + ' ' + esc(dureeTexte(p.Duree)) +
          (p.Origine ? ' · ' + esc(p.Origine) + (p.Propose_par ? ', repris par ' + esc(p.Propose_par) : '') : (p.Propose_par ? ' · proposé par ' + esc(p.Propose_par) : '')) + '</p>' +
        (p.Description ? '<p class="fr-text--sm fr-mb-1w">' + texteMultiligne(p.Description) + '</p>' : '') +
        '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm">' +
        '<li><button type="button" class="fr-btn" data-point-statut="' + p.id + '" data-valeur="Retenu">Retenir</button></li>' +
        '<li><button type="button" class="fr-btn fr-btn--secondary" data-point-statut="' + p.id + '" data-valeur="Reporté">Reporter</button></li>' +
        '<li><button type="button" class="fr-btn fr-btn--tertiary" data-point-statut="' + p.id + '" data-valeur="Écarté">Écarter</button></li></ul></div>';
    });
    if (pubs.length) {
      h += '<h3 class="fr-h6 fr-mt-2w">Reçues par formulaire <span class="rn-compte">(' + pubs.length + ')</span></h3>' +
        '<p class="fr-text--xs">Envoyées sans compte Grist : le nom est celui que la personne a déclaré, il n\'est pas vérifié.</p>';
      pubs.forEach(function (x) {
        h += '<div class="rn-proposition rn-proposition--publique"><p class="rn-point__titre">' + esc(x.Titre) + '</p>' +
          '<p class="rn-point__meta">' + badge(x.Type, COULEUR_TYPE[x.Type]) + ' ' + esc(dureeTexte(x.Duree)) + ' · envoyé par ' + esc(String(x.Nom || '').trim() || 'une personne sans nom') + '</p>' +
          (x.Description ? '<p class="fr-text--sm fr-mb-1w">' + texteMultiligne(x.Description) + '</p>' : '') +
          '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm">' +
          '<li><button type="button" class="fr-btn fr-btn--secondary" data-publique="' + x.id + '" data-valeur="Reprise">Reprendre dans les propositions</button></li>' +
          '<li><button type="button" class="fr-btn fr-btn--tertiary" data-publique="' + x.id + '" data-valeur="Écartée">Écarter</button></li></ul></div>';
      });
    }
    var b = brouillon('point-' + r.id);
    var a = 'data-brouillon="point-' + r.id + '"';
    if (!ouvert) h += '<h2 class="fr-h5 fr-mt-3w">Proposer un point</h2><p class="fr-text--sm">La date limite est passée : seule la personne qui anime ajoute encore des points.</p>' +
      '<details class="rn-hors-delai"><summary>Ajouter un point (animation)</summary>';
    h += (ouvert ? '<h2 class="fr-h5 fr-mt-3w">Proposer un point</h2>' : '') + '<form data-form="point" data-reunion="' + r.id + '">' +
      champ('p-titre-' + r.id, 'Sujet', b.Titre || '', { requis: true, attrs: a + ' data-champ="Titre"' }) +
      champ('p-desc-' + r.id, 'Précisions', b.Description || '', { multiligne: true, lignes: 2, attrs: a + ' data-champ="Description"' }) +
      select('p-type-' + r.id, 'Type de point', b.Type || L.typesPoint[0], L.typesPoint, a + ' data-champ="Type"') +
      champ('p-duree-' + r.id, 'Durée souhaitée (minutes)', b.Duree || DUREE_DEFAUT, { type: 'number', attrs: a + ' data-champ="Duree" min="1"' }) +
      champ('p-porteur-' + r.id, 'Qui présente ?', b.Porteur || '', { attrs: a + ' data-champ="Porteur" list="rn-personnes"' }) +
      '<button class="fr-btn fr-btn--secondary" type="submit">Proposer ce point</button></form>' + (ouvert ? '' : '</details>');
    if (autres.length) {
      h += '<h2 class="fr-h6 fr-mt-3w">Reportés ou écartés</h2><ul class="rn-liste-simple">' + autres.map(function (p) {
        return '<li>' + esc(p.Titre) + ' ' + badge(p.Statut) + ' <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" data-point-statut="' + p.id + '" data-valeur="Proposé">Remettre en proposition</button></li>';
      }).join('') + '</ul>';
    }
    h += '</aside></div>';
    return h;
  }

  // --- Séance ----------------------------------------------------------------

  function ongletSeance(r) {
    var retenus = pointsDe(r.id, 'Retenu');
    var hor = horaires(r, retenus);
    var h = '<p class="fr-text--sm">Les notes sont enregistrées quand vous quittez le champ. Décisions et actions alimentent le compte rendu et le suivi des actions.</p>';
    var prec = actionsPrecedentes(r);
    if (prec.length) h += '<section class="rn-seance-point"><h2 class="fr-h5">Revue des actions précédentes</h2>' + tableauActions(prec, true) + '</section>';
    if (!retenus.length) h += '<p>L\'ordre du jour est vide. <a href="#/reunion/' + r.id + '/ordre">Composer l\'ordre du jour</a>.</p>';
    retenus.forEach(function (p, i) {
      var actif = etat.chrono && etat.chrono.point === p.id;
      var decs = decisionsDe(r.id, p.id), acts = actionsDe(r.id, p.id);
      var bd = brouillon('dec-' + p.id), ba = brouillon('act-' + p.id);
      h += '<section class="rn-seance-point' + (p.Traite ? ' rn-traite' : '') + (actif ? ' rn-actif' : '') + '" id="point-' + p.id + '">' +
        '<div class="rn-seance-point__tete"><h2 class="fr-h5">' + (i + 1) + '. ' + esc(p.Titre) + '</h2>' +
        '<div class="rn-chrono">' + (actif ? '<p class="rn-chrono__temps" data-chrono="' + p.id + '" data-duree="' + num(p.Duree) + '" aria-live="off"></p>' +
          '<button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-action="arreter-chrono">Arrêter le minuteur</button>' :
          '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-timer-line fr-btn--icon-left" data-chrono-demarrer="' + p.id + '">Démarrer (' + esc(dureeTexte(p.Duree) || 'sans durée') + ')</button>') + '</div></div>' +
        '<p class="rn-point__meta">' + esc(hor[i]) + ' ' + badge(p.Type, COULEUR_TYPE[p.Type]) + (p.Porteur ? ' porté par ' + esc(p.Porteur) : '') + '</p>' +
        champ('notes-' + p.id, 'Notes', p.Notes || '', { multiligne: true, lignes: 4, attrs: 'data-notes="' + p.id + '"' }) +
        '<div class="rn-seance-grille"><div><h3 class="fr-h6">Décisions</h3>' +
        (decs.length ? '<ul class="rn-liste-simple">' + decs.map(function (d) { return '<li>' + esc(d.Texte) + ' <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" data-supprimer="Decisions:' + d.id + '">Supprimer</button></li>'; }).join('') + '</ul>' : '') +
        '<form data-form="decision" data-reunion="' + r.id + '" data-point="' + p.id + '" class="rn-ajout">' +
        champ('dec-' + p.id + '-t', 'Nouvelle décision', bd.Texte || '', { attrs: 'data-brouillon="dec-' + p.id + '" data-champ="Texte"' }) +
        '<button class="fr-btn fr-btn--sm fr-btn--secondary" type="submit">Ajouter la décision</button></form></div>' +
        '<div><h3 class="fr-h6">Actions</h3>' + (acts.length ? tableauActions(acts, false) : '') +
        '<form data-form="action" data-reunion="' + r.id + '" data-point="' + p.id + '" class="rn-ajout rn-ajout--action">' +
        champ('act-' + p.id + '-i', 'Action à mener', ba.Intitule || '', { attrs: 'data-brouillon="act-' + p.id + '" data-champ="Intitule"' }) +
        champ('act-' + p.id + '-r', 'Responsable', ba.Responsable || '', { attrs: 'data-brouillon="act-' + p.id + '" data-champ="Responsable" list="rn-personnes"' }) +
        champ('act-' + p.id + '-e', 'Échéance', ba.Echeance || '', { type: 'date', attrs: 'data-brouillon="act-' + p.id + '" data-champ="Echeance"' }) +
        '<button class="fr-btn fr-btn--sm fr-btn--secondary" type="submit">Ajouter l\'action</button></form></div></div>' +
        '<div class="rn-seance-point__pied"><div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="traite-' + p.id + '" data-traite="' + p.id + '"' + (p.Traite ? ' checked' : '') + '>' +
        '<label class="fr-label" for="traite-' + p.id + '">Point traité</label></div>' +
        '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-point-statut="' + p.id + '" data-valeur="Reporté">Reporter à une prochaine réunion</button></div></section>';
    });
    h += datalistPersonnes(r);
    return h;
  }

  function nomsPersonnes() {
    return (data.Personnes || []).map(function (p) { return String(p.Nom || '').trim(); }).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  }
  function datalistPersonnes(r) {
    var noms = {};
    nomsPersonnes().forEach(function (n) { noms[n] = 1; });
    String((r && r.Participants) || '').split(/[,\n;]+/).forEach(function (n) { n = n.trim(); if (n) noms[n] = 1; });
    data[T_ACTIONS].forEach(function (a) { if (a.Responsable) noms[a.Responsable] = 1; });
    return '<datalist id="rn-personnes">' + Object.keys(noms).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }

  function tableauActions(acts, avecOrigine) {
    var auj = aujourdhui();
    return '<div class="fr-table fr-table--sm fr-table--no-caption rn-table"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content"><table><caption>Actions</caption><thead><tr>' +
      '<th scope="col">Action</th><th scope="col">Responsable</th><th scope="col">Échéance</th><th scope="col">État</th>' + (avecOrigine ? '<th scope="col">Réunion</th>' : '') + '</tr></thead><tbody>' +
      acts.map(function (a) {
        var retard = a.Echeance && a.Echeance < auj && actionOuverte(a);
        var r = idx.Reunions[num(a.Reunion)];
        return '<tr><td>' + esc(a.Intitule) + '</td><td>' + esc(a.Responsable) + '</td><td>' + esc(dateTexte(a.Echeance)) + (retard ? ' ' + badge('En retard', 'error') : '') + '</td>' +
          '<td><label class="fr-sr-only" for="ea-' + a.id + '">État de « ' + esc(a.Intitule) + ' »</label><select class="fr-select fr-select--sm rn-select-etat" id="ea-' + a.id + '" data-etat-action="' + a.id + '">' +
          L.etatsAction.map(function (e) { return '<option' + ((a.Etat || L.etatsAction[0]) === e ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select></td>' +
          (avecOrigine ? '<td>' + (r ? '<a href="#/reunion/' + r.id + '/cr">' + esc(r.Titre) + '</a> <span class="rn-meta">' + esc(dateTexte(r.Date)) + '</span>' : '') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div></div></div></div>';
  }

  // --- Compte rendu ----------------------------------------------------------

  function ongletCompteRendu(r) {
    var retenus = pointsDe(r.id, 'Retenu');
    var acts = actionsDe(r.id);
    var h = '<div class="rn-ecran rn-outils-cr"><ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm fr-btns-group--icon-left">' +
      '<li><button type="button" class="fr-btn fr-icon-printer-line fr-btn--icon-left" data-action="imprimer">Imprimer ou enregistrer en PDF</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--secondary fr-icon-file-text-line fr-btn--icon-left" data-action="copier-cr" data-reunion="' + r.id + '">Copier le texte</button></li>' +
      (r.Statut !== 'Compte rendu diffusé' ? '<li><button type="button" class="fr-btn fr-btn--tertiary" data-diffuser="' + r.id + '">Marquer comme diffusé</button></li>' : '') + '</ul></div>';
    h += '<article class="rn-cr"><h2 class="fr-h4">Compte rendu – ' + esc(r.Titre) + '</h2>' +
      '<dl class="rn-cr__infos"><div><dt>Date</dt><dd>' + esc(dateTexte(r.Date, true)) + (r.Heure ? ' à ' + esc(r.Heure) : '') + '</dd></div>' +
      (r.Lieu ? '<div><dt>Lieu</dt><dd>' + esc(r.Lieu) + '</dd></div>' : '') +
      (nomProjet(r) ? '<div><dt>Projet</dt><dd>' + esc(nomProjet(r)) + '</dd></div>' : '') +
      (r.Animation ? '<div><dt>Animation</dt><dd>' + esc(r.Animation) + '</dd></div>' : '') +
      (r.Secretariat ? '<div><dt>Secrétariat</dt><dd>' + esc(r.Secretariat) + '</dd></div>' : '') +
      (r.Participants ? '<div><dt>Participants</dt><dd>' + texteMultiligne(r.Participants) + '</dd></div>' : '') +
      (r.Excuses ? '<div><dt>Excusés</dt><dd>' + texteMultiligne(r.Excuses) + '</dd></div>' : '') +
      champsPerso().map(function (c) { var v = valeurPerso(c, r); return v ? '<div><dt>' + esc(c.label) + '</dt><dd>' + esc(v) + '</dd></div>' : ''; }).join('') + '</dl>' +
      (r.Objectif ? '<p><strong>Objectif :</strong> ' + esc(r.Objectif) + '</p>' : '');
    if (!retenus.length) h += '<p>Aucun point à l\'ordre du jour.</p>';
    retenus.forEach(function (p, i) {
      var decs = decisionsDe(r.id, p.id);
      h += '<section class="rn-cr__point"><h3 class="fr-h6">' + (i + 1) + '. ' + esc(p.Titre) + (p.Porteur ? ' <span class="rn-meta">(' + esc(p.Porteur) + ')</span>' : '') + '</h3>' +
        (p.Notes ? '<p>' + texteMultiligne(p.Notes) + '</p>' : '<p class="rn-meta">Pas de notes.</p>') +
        (decs.length ? '<p class="fr-text--bold fr-mb-1v">Décision' + (decs.length > 1 ? 's' : '') + '</p><ul>' + decs.map(function (d) { return '<li>' + esc(d.Texte) + '</li>'; }).join('') + '</ul>' : '') + '</section>';
    });
    if (acts.length) {
      h += '<h3 class="fr-h5">Relevé des actions</h3><div class="fr-table fr-table--sm"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content"><table><caption>Actions décidées en séance</caption><thead><tr><th scope="col">Action</th><th scope="col">Responsable</th><th scope="col">Échéance</th><th scope="col">État</th></tr></thead><tbody>' +
        acts.map(function (a) { return '<tr><td>' + esc(a.Intitule) + '</td><td>' + esc(a.Responsable) + '</td><td>' + esc(dateTexte(a.Echeance)) + '</td><td>' + esc(a.Etat || L.etatsAction[0]) + '</td></tr>'; }).join('') +
        '</tbody></table></div></div></div></div>';
    }
    var reportes = pointsDe(r.id, 'Reporté');
    if (reportes.length) h += '<p><strong>Points reportés :</strong> ' + reportes.map(function (p) { return esc(p.Titre); }).join(', ') + '.</p>';
    h += '</article>';
    h += '<div class="rn-ecran fr-mt-4w"><a class="fr-btn fr-btn--secondary fr-icon-calendar-line fr-btn--icon-left" href="#/nouvelle/' + r.id + '">Préparer la réunion suivante</a></div>';
    return h;
  }

  function texteCompteRendu(r) {
    var t = 'Compte rendu – ' + r.Titre + '\n' + dateTexte(r.Date, true) + (r.Heure ? ' à ' + r.Heure : '') + (r.Lieu ? ' – ' + r.Lieu : '') + '\n';
    if (r.Participants) t += 'Participants : ' + String(r.Participants).replace(/\n/g, ', ') + '\n';
    if (r.Excuses) t += 'Excusés : ' + String(r.Excuses).replace(/\n/g, ', ') + '\n';
    pointsDe(r.id, 'Retenu').forEach(function (p, i) {
      t += '\n' + (i + 1) + '. ' + p.Titre + '\n' + (p.Notes ? p.Notes + '\n' : '');
      decisionsDe(r.id, p.id).forEach(function (d) { t += 'Décision : ' + d.Texte + '\n'; });
    });
    var acts = actionsDe(r.id);
    if (acts.length) {
      t += '\nActions\n';
      acts.forEach(function (a) { t += '- ' + a.Intitule + (a.Responsable ? ' (' + a.Responsable + ')' : '') + (a.Echeance ? ', pour le ' + dateTexte(a.Echeance) : '') + '\n'; });
    }
    return t;
  }

  // --- Informations ----------------------------------------------------------

  function ongletInfos(r) {
    var cle = 'infos-' + r.id, b = brouillon(cle);
    if (!b._init) { Object.assign(b, r, { _init: true }); }
    var h = '<form data-form="infos" data-reunion="' + r.id + '" class="rn-form">' + formulaireReunion('i', b, 'data-brouillon="' + cle + '"') +
      '<ul class="fr-btns-group fr-btns-group--inline-md"><li><button class="fr-btn" type="submit">Enregistrer</button></li>' +
      '<li><a class="fr-btn fr-btn--secondary" href="#/nouvelle/' + r.id + '">Préparer la réunion suivante</a></li></ul></form>';
    if (etat.suppression === 'Reunions:' + r.id) {
      h += '<div class="fr-alert fr-alert--warning fr-mt-3w"><p>Supprimer cette réunion, ses points, décisions et actions ? Cette suppression est définitive.</p>' +
        '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm fr-mt-1w"><li><button type="button" class="fr-btn" data-confirmer-reunion="' + r.id + '">Supprimer définitivement</button></li>' +
        '<li><button type="button" class="fr-btn fr-btn--secondary" data-action="annuler-suppression">Annuler</button></li></ul></div>';
    } else {
      h += '<button type="button" class="fr-btn fr-btn--tertiary fr-btn--sm fr-mt-3w fr-icon-delete-line fr-btn--icon-left" data-demander-suppression="Reunions:' + r.id + '">Supprimer la réunion</button>';
    }
    return h;
  }

  // ---------------------------------------------------------------------------
  // Vue : suivi des actions
  // ---------------------------------------------------------------------------

  function vueActions() {
    var auj = aujourdhui(), semaine = auj + 7 * 86400;
    var responsables = {};
    data[T_ACTIONS].forEach(function (a) { if (a.Responsable) responsables[a.Responsable] = 1; });
    var ouvertes = data[T_ACTIONS].filter(function (a) {
      var r = idx.Reunions[num(a.Reunion)];
      if (!actionOuverte(a)) return false;
      if (etat.filtreResponsable && a.Responsable !== etat.filtreResponsable) return false;
      if (etat.filtreInstance && (!r || (r.Instance || '') !== etat.filtreInstance)) return false;
      return true;
    }).sort(function (a, b) { return (a.Echeance || 9e12) - (b.Echeance || 9e12); });
    var groupes = [
      ['En retard', ouvertes.filter(function (a) { return a.Echeance && a.Echeance < auj; })],
      ['Dans les 7 jours', ouvertes.filter(function (a) { return a.Echeance && a.Echeance >= auj && a.Echeance <= semaine; })],
      ['Plus tard', ouvertes.filter(function (a) { return a.Echeance && a.Echeance > semaine; })],
      ['Sans échéance', ouvertes.filter(function (a) { return !a.Echeance; })]
    ];
    var instances = L.instances.slice();
    var h = navigation('actions') + '<h1 class="fr-h3">Suivi des actions</h1>' + blocAlerte() +
      '<div class="rn-filtres">' + select('f-resp', 'Responsable', etat.filtreResponsable, Object.keys(responsables).sort(), 'data-filtre="responsable"', 'Tout le monde') +
      select('f-inst', 'Instance', etat.filtreInstance, instances, 'data-filtre="instance"', 'Toutes les instances') + '</div>' +
      '<ul class="rn-chiffres">' + groupes.map(function (g) { return '<li><span class="rn-chiffres__n">' + g[1].length + '</span> ' + g[0].toLowerCase() + '</li>'; }).join('') + '</ul>';
    if (!ouvertes.length) h += '<p>Aucune action ouverte.</p>';
    groupes.forEach(function (g) { if (g[1].length) h += '<h2 class="fr-h5 fr-mt-3w">' + g[0] + ' <span class="rn-compte">(' + g[1].length + ')</span></h2>' + tableauActions(g[1], true); });
    return h;
  }

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------

  var brouillonReglages = null;
  var LISTES_REGLABLES = [
    ['instances', 'Instances (types de réunion)', 'Reunions', 'Instance'],
    ['statutsReunion', 'Étapes d\'une réunion', 'Reunions', 'Statut'],
    ['typesPoint', 'Types de points', 'Points', 'Type'],
    ['etatsAction', 'États des actions', 'Actions_reunion', 'Etat']
  ];


  // ---------------------------------------------------------------------------
  // Champs supplémentaires des réunions (colonnes ajoutées à la table Reunions)
  // ---------------------------------------------------------------------------

  var TYPES_CHAMP = [['court', 'Texte court'], ['long', 'Texte long'], ['choix', 'Choix dans une liste'], ['date', 'Date'], ['nombre', 'Nombre']];
  var nouveauChamp = { label: '', type: 'court', choix: '', requis: false };
  function aColonne(table, col) {
    var t = meta.tables.filter(function (x) { return x.tableId === table; })[0];
    return !!(t && meta.colonnes.filter(function (x) { return x.parentId === t.id && x.colId === col; })[0]);
  }
  // Champs dont la colonne existe dans la table Reunions.
  function champsPerso() {
    return (Array.isArray(reglages.champsPerso) ? reglages.champsPerso : []).filter(function (c) {
      return c && /^[A-Za-z][A-Za-z0-9_]*$/.test(c.id || '') && c.label && (DEMO || aColonne('Reunions', c.id));
    });
  }
  function identifiantChamp(lib) {
    var id = String(lib || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) return '';
    id = id.charAt(0).toUpperCase() + id.slice(1);
    return /^[0-9]/.test(id) ? 'C_' + id : id;
  }
  function valeurPerso(c, r) {
    var v = r[c.id];
    if (v === null || v === undefined || v === '') return '';
    return c.type === 'date' ? dateTexte(v, true) : String(v);
  }
  function champsPersoFormulaire(p, b, attrs) {
    return champsPerso().map(function (c) {
      var id = p + '-' + c.id, a = attrs + ' data-champ="' + c.id + '"', v = b[c.id] === null || b[c.id] === undefined ? '' : b[c.id];
      if (c.type === 'choix') return select(id, c.label, v, c.choix || [], a, 'Choisir…');
      if (c.type === 'date') return champ(id, c.label, v ? (typeof v === 'number' ? dateVersSaisie(v) : v) : '', { type: 'date', attrs: a, requis: !!c.requis });
      if (c.type === 'nombre') return champ(id, c.label, v, { type: 'number', attrs: a, requis: !!c.requis });
      if (c.type === 'long') return champ(id, c.label, v, { multiligne: true, lignes: 3, attrs: a, classe: 'rn-large', requis: !!c.requis });
      return champ(id, c.label, v, { attrs: a, requis: !!c.requis });
    }).join('');
  }
  function champsPersoValeurs(b) {
    var o = {};
    champsPerso().forEach(function (c) {
      var v = b[c.id];
      if (c.type === 'date') o[c.id] = typeof v === 'number' ? v : saisieVersDate(v);
      else if (c.type === 'nombre') o[c.id] = v === '' || v === undefined || v === null || isNaN(Number(v)) ? null : Number(v);
      else o[c.id] = v === undefined || v === null ? '' : String(v);
    });
    return o;
  }
  function blocChampsPerso() {
    var b = brouillonReglages; b.champsPerso = b.champsPerso || [];
    var h = '<h2 class="fr-h5 fr-mt-4w">Champs supplémentaires des réunions</h2>' +
      '<p class="fr-text--sm">Ajoutez vos propres champs à la fiche d\'une réunion (par exemple « Salle » ou « Budget »). Chaque champ devient une colonne de la table <code>Reunions</code>, créée à l\'enregistrement des réglages ; il apparaît dans le formulaire de la réunion et dans le compte rendu. Retirer un champ des réglages ne supprime ni la colonne ni ses données.</p>';
    if (!b.champsPerso.length) h += '<p class="fr-text--sm"><em>Aucun champ supplémentaire.</em></p>';
    b.champsPerso.forEach(function (c) {
      var t = TYPES_CHAMP.filter(function (x) { return x[0] === c.type; })[0];
      h += '<div class="rn-champ-perso"><p class="fr-mb-1v"><strong>' + esc(c.label) + '</strong> · ' + esc(t ? t[1] : c.type) + ' · colonne <code>' + esc(c.id) + '</code>' +
        (DEMO || aColonne('Reunions', c.id) ? '' : ' <span class="fr-badge fr-badge--sm fr-badge--info">Créée à l\'enregistrement</span>') + '</p>' +
        '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="cp-req-' + esc(c.id) + '" data-cp-requis="' + esc(c.id) + '"' + (c.requis ? ' checked' : '') + '><label class="fr-label" for="cp-req-' + esc(c.id) + '">Obligatoire</label></div>' +
        '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-cp="retirer" data-id="' + esc(c.id) + '">Retirer des réglages</button></div>';
    });
    var n = nouveauChamp;
    h += '<h3 class="fr-h6 fr-mt-2w">Ajouter un champ</h3><div class="rn-champ-perso">' +
      '<div class="fr-input-group"><label class="fr-label" for="nc-label">Libellé</label><input class="fr-input" id="nc-label" data-nc="label" value="' + esc(n.label) + '"></div>' +
      '<div class="fr-select-group"><label class="fr-label" for="nc-type">Type</label><select class="fr-select" id="nc-type" data-nc="type">' +
      TYPES_CHAMP.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === n.type ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
      (n.type === 'choix' ? '<div class="fr-input-group"><label class="fr-label" for="nc-choix">Valeurs possibles<span class="fr-hint-text">Une par ligne.</span></label><textarea class="fr-input" rows="3" id="nc-choix" data-nc="choix">' + esc(n.choix) + '</textarea></div>' : '') +
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="nc-requis" data-nc="requis"' + (n.requis ? ' checked' : '') + '><label class="fr-label" for="nc-requis">Obligatoire</label></div>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-mt-1w" data-cp="ajouter">Ajouter ce champ</button></div>';
    return h;
  }
  var zoneReglages = null;
  // Les listes de valeurs sont lues dans le DOM à l'enregistrement : on les range dans le brouillon avant de redessiner.
  function redessinerReglages() {
    if (!zoneReglages) return;
    LISTES_REGLABLES.forEach(function (l) {
      var n = document.getElementById('rg-' + l[0]); if (!n) return;
      brouillonReglages.listes = brouillonReglages.listes || {};
      var v = n.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (v.length) brouillonReglages.listes[l[0]] = v;
    });
    var d = document.getElementById('rg-duree'); if (d) brouillonReglages.dureeDefaut = num(d.value) || 10;
    zoneReglages.innerHTML = reglagesPropres();
  }
  function brancherReglages(zone) {
    zoneReglages = zone;
    if (zone.__brancheRN) return;
    zone.__brancheRN = true;
    zone.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-nc')) {
        nouveauChamp[t.getAttribute('data-nc')] = t.type === 'checkbox' ? t.checked : t.value;
        if (t.getAttribute('data-nc') === 'type') redessinerReglages();
        return;
      }
      if (t.hasAttribute('data-cp-requis')) {
        var cp = (brouillonReglages.champsPerso || []).filter(function (x) { return x.id === t.getAttribute('data-cp-requis'); })[0];
        if (cp) { cp.requis = t.checked; if (configLab) configLab.modifie(true); }
      }
    });
    zone.addEventListener('input', function (e) { var t = e.target; if (t.hasAttribute('data-nc') && t.type !== 'checkbox' && t.tagName !== 'SELECT') nouveauChamp[t.getAttribute('data-nc')] = t.value; });
    zone.addEventListener('click', function (e) {
      var bp = e.target.closest('button[data-rn-participatif]');
      if (bp) { bp.disabled = true; installerParticipatif(bp.getAttribute('data-rn-participatif') === 'publics'); return; }
      var b = e.target.closest('button[data-cp]'); if (!b) return;
      if (b.getAttribute('data-cp') === 'ajouter') ajouterChampPerso();
      else { brouillonReglages.champsPerso = (brouillonReglages.champsPerso || []).filter(function (x) { return x.id !== b.getAttribute('data-id'); }); if (configLab) configLab.modifie(true); redessinerReglages(); }
    });
  }
  function ajouterChampPerso() {
    var b = brouillonReglages; b.champsPerso = b.champsPerso || [];
    var n = nouveauChamp, label = String(n.label || '').trim();
    function refus(t) { if (configLab) configLab.message('error', t); }
    if (!label) { refus('Indiquez le libellé du champ.'); return; }
    var id = identifiantChamp(label);
    if (!id) { refus('Le libellé doit contenir au moins une lettre ou un chiffre.'); return; }
    if (aColonne('Reunions', id) || b.champsPerso.some(function (c) { return c.id === id; })) { refus('Le nom de colonne « ' + id + ' » est déjà pris : choisissez un autre libellé.'); return; }
    var choix = String(n.choix || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    if (n.type === 'choix' && !choix.length) { refus('Indiquez au moins une valeur possible pour un champ « Choix ».'); return; }
    b.champsPerso.push({ id: id, label: label, type: n.type, requis: !!n.requis, choix: n.type === 'choix' ? choix : [] });
    nouveauChamp = { label: '', type: 'court', choix: '', requis: false };
    if (configLab) { configLab.modifie(true); configLab.message('info', 'Champ « ' + label + ' » ajouté. Enregistrez les réglages pour créer la colonne dans Grist.'); }
    redessinerReglages();
  }
  function colonnesChampsPerso(b) {
    var acts = [];
    (b.champsPerso || []).forEach(function (c) {
      if (!c || !/^[A-Za-z][A-Za-z0-9_]*$/.test(c.id || '') || aColonne('Reunions', c.id)) return;
      var d = { type: c.type === 'date' ? 'Date' : c.type === 'nombre' ? 'Numeric' : c.type === 'choix' ? 'Choice' : 'Text', label: c.label };
      if (c.type === 'choix') d.widgetOptions = JSON.stringify({ choices: c.choix || [] });
      acts.push(['AddColumn', 'Reunions', c.id, d]);
    });
    return acts;
  }

  function reglagesPropres() {
    var b = brouillonReglages; b.listes = b.listes || {};
    var h = '<div class="cl-panneau"><p class="fr-text--sm">Réservé aux propriétaires du document. Les réglages sont enregistrés dans la description de la colonne <code>' + NOM_COLONNE_CONFIG + '</code> de la table Reunions.</p>' +
      '<h2 class="fr-h5">Listes de valeurs</h2><p class="fr-text--sm">Une valeur par ligne. Les listes de choix des colonnes Grist sont mises à jour à l\'enregistrement. La première étape d\'une réunion est celle des réunions nouvelles.</p>';
    LISTES_REGLABLES.forEach(function (l) {
      h += '<div class="fr-input-group"><label class="fr-label" for="rg-' + l[0] + '">' + esc(l[1]) + '<span class="fr-hint-text">Colonne ' + l[2] + '.' + l[3] + '</span></label>' +
        '<textarea class="fr-input" rows="4" id="rg-' + l[0] + '">' + esc((b.listes[l[0]] && b.listes[l[0]].length ? b.listes[l[0]] : DEFAUTS[l[0]]).join('\n')) + '</textarea></div>';
    });
    h += '<h2 class="fr-h5 fr-mt-3w">Autres réglages</h2>' + champ('rg-duree', 'Durée proposée par défaut pour un point (minutes)', b.dureeDefaut || 10, { type: 'number', attrs: 'min="1"' }) + blocParticipatif() + blocChampsPerso() + '</div>';
    return h;
  }
  // Réglages › Données (commun/donnees.js) : tables partagées, règles d'accès proposées, colonnes de lien.
  // Rien n'est modifié sans un clic d'un propriétaire.
  var PARTAGE = [['Reunions', 'suivi de projets (rendez-vous d\'un projet, colonne Projet)', 'réunions'],
    [T_ACTIONS, 'management visuel (lit les actions, change leur état)', 'actions décidées en réunion'],
    ['Personnes', 'annuaire (outil de référence), suivi de projets', 'noms proposés à la saisie, en lecture seule'],
    ['Projets', 'suivi de projets (outil de référence)', 'rattacher une réunion à un projet, en lecture seule']];
  // Pas de restriction de suppression des réunions : le suivi de projets crée et supprime aussi des lignes de Reunions (rendez-vous).
  var REGLES_ACCES = [{ table: 'Points', cols: 'Propose_par,Propose_le', formule: 'user.Access != OWNER', droits: '-U',
    memo: 'L’auteur et la date d’une proposition de point ne se modifient pas.', effet: 'l\'auteur et la date d\'une proposition ne se modifient pas (traçabilité de l\'ordre du jour)' }];
  var NP = 'user.Access != OWNER';
  var ANIME = function (x) { return '(' + x + '.Animation_email and user.Email and ' + x + '.Animation_email.lower() == user.Email.lower())'; };
  var M_STATUT = 'Seule la personne qui anime retient, reporte, écarte ou ordonne les points.';
  var M_HORS = 'La date limite des propositions de points est passée.';
  var M_HORS_ANIM = 'La date limite des propositions de points est passée : seule la personne qui anime ajoute encore des points.';
  var M_ANIM = 'Seule la personne qui anime (ou un propriétaire) change l\'animation, la date limite et la clôture des propositions.';
  // Règles de cet outil d'une version à l'autre : remplacées par la version actuelle quand on met à jour.
  var ANCIENS_MEMOS = [M_STATUT, M_HORS, M_HORS_ANIM, M_ANIM];
  function reglesAcces() {
    var r = REGLES_ACCES.slice();
    var anim = aColonne('Points', 'Animation_email') && aColonne('Reunions', 'Animation_email');
    if (anim) {
      r.push({ table: 'Points', cols: 'Statut,Ordre', formule: NP + ' and not ' + ANIME('rec'), droits: '-U', memo: M_STATUT,
        effet: 'seule la personne qui anime la réunion retient, reporte, écarte ou ordonne les points (reconnue par son adresse dans Personnes)' });
      r.push({ table: 'Points', cols: '*', formule: NP + ' and newRec.Statut and newRec.Statut != "Proposé" and not ' + ANIME('newRec'), droits: '-C', memo: M_STATUT,
        effet: 'les autres personnes ajoutent des points seulement comme propositions' });
    }
    if (aColonne('Points', 'Hors_delai')) r.push({ table: 'Points', cols: '*', formule: NP + ' and newRec.Hors_delai' + (anim ? ' and not ' + ANIME('newRec') : ''), droits: '-C',
      memo: anim ? M_HORS_ANIM : M_HORS, effet: anim ? 'après la date limite, seule la personne qui anime ajoute des points' : 'après la date limite, seuls les propriétaires ajoutent des points' });
    if (anim && ['Fin_propositions', 'Cloture_points', 'Cloture_publiques'].every(function (c) { return aColonne('Reunions', c); })) {
      r.push({ table: 'Reunions', cols: 'Animation,Fin_propositions,Cloture_points,Cloture_publiques', formule: NP + ' and not ' + ANIME('rec'), droits: '-U', memo: M_ANIM,
        effet: 'personne ne se désigne animateur d\'une réunion existante, ni ne change la date limite ou ne rouvre les propositions, sauf la personne qui anime et les propriétaires' });
    }
    if (aTablePublics()) {
      r.push({ table: T_PUBLICS, cols: 'Reunion,Titre,Description,Type,Duree,Porteur,Nom,Envoye_le', formule: NP, droits: '-U',
        memo: 'Le contenu d\'une proposition reçue par formulaire ne se modifie pas.', effet: 'le contenu d\'une proposition reçue par formulaire ne se modifie pas (sauf propriétaires)' });
      r.push({ table: T_PUBLICS, cols: '*', formule: NP, droits: '-D', memo: 'Seuls les propriétaires retirent une proposition reçue par formulaire.',
        effet: 'seuls les propriétaires retirent une proposition reçue par formulaire' });
      r.push({ table: T_PUBLICS, cols: '*', formule: 'not user.IsLoggedIn', droits: '-R', memo: 'Les propositions reçues par formulaire ne sont pas lisibles sans compte.',
        effet: 'les propositions reçues par formulaire (et les noms déclarés) ne sont pas lisibles sans compte (document public)' });
    }
    return r;
  }
  var NOTE_REGLES = 'Réserver l\'ordre du jour à la personne qui anime demande la table <code>Personnes</code> (annuaire) avec la colonne <code>Email</code>, puis les colonnes de lien <code>Animation_email</code> ci-dessous : la personne est reconnue par son nom dans Animation, s\'il ne correspond qu\'à une seule fiche. Cette protection vaut ce que valent les règles de la table Personnes : si un éditeur peut modifier l\'adresse d\'une autre fiche, il peut prendre sa place. Un formulaire public se publie sur <code>' + T_PUBLICS + '</code>, jamais sur <code>Points</code>. Après la pose des règles, vérifiez avec <strong>Voir en tant que</strong>.';
  var LIENS = [window.DonneesLab ? DonneesLab.lienPersonne('Points', 'Porteur', 'relie la personne qui présente le point à sa fiche') : null,
    window.DonneesLab ? DonneesLab.lienPersonne(T_ACTIONS, 'Responsable', 'relie la personne responsable de l\'action à sa fiche') : null,
    window.DonneesLab ? DonneesLab.lienPersonne('Reunions', 'Animation', 'relie la personne qui anime à sa fiche') : null,
    window.DonneesLab ? DonneesLab.lienPersonne('Reunions', 'Secretariat', 'relie le secrétariat de séance à sa fiche') : null,
    { table: T_ACTIONS, col: 'Projet', type: 'Ref:Projets', cible: 'Projets', affichage: 'Titre', source: 'Reunion', requis: [['Reunions', 'Projet']],
      formule: '$Reunion.Projet', effet: 'reprend le projet de la réunion : l\'action se rattache au même projet' },
    { table: 'Reunions', col: 'Animation_email', type: 'Text', cible: 'Personnes', source: 'Animation', requis: [['Personnes', 'Email']],
      formule: F_EMAIL_ANIMATION, effet: 'adresse de la personne qui anime, si son nom ne correspond qu\'à une seule fiche : sert aux règles qui lui réservent l\'ordre du jour' },
    { table: 'Points', col: 'Animation_email', type: 'Text', cible: 'Personnes', source: 'Reunion', requis: [['Personnes', 'Email']],
      formule: 'return $Reunion.Animation_email if $Reunion else ""', effet: 'reprend l\'adresse de la personne qui anime la réunion du point (pour les règles d\'accès)' }].filter(Boolean);
  var aclDonnees = null;
  function optionsDonnees() { return { demo: DEMO, tables: TABLES.concat(aTablePublics() ? [T_PUBLICS] : []), partage: PARTAGE, regles: reglesAcces(), anciens: ANCIENS_MEMOS, liens: LIENS, noteRegles: NOTE_REGLES }; }
  function rendreDonnees(zone) {
    if (!window.DonneesLab) { zone.innerHTML = ''; return; }
    if (!DEMO && !aclDonnees) DonneesLab.lire().then(function (a) { aclDonnees = a; if (configLab) configLab.rafraichir('donnees'); });
    zone.innerHTML = DonneesLab.html(aclDonnees, meta, optionsDonnees());
    if (zone.getAttribute('data-branche')) return;
    zone.setAttribute('data-branche', '1');
    zone.addEventListener('click', function (e) {
      var b = e.target.closest('[data-donnees]');
      if (!b || b.disabled) return;
      b.disabled = true;
      var regles = b.getAttribute('data-donnees') === 'regles';
      (regles ? DonneesLab.installerRegles(aclDonnees, meta, reglesAcces(), ANCIENS_MEMOS) : DonneesLab.ajouterLiens(meta, LIENS)).then(function (n) {
        aclDonnees = null;
        if (configLab) configLab.message('success', regles ? n + ' règle(s) d\'accès installée(s). Grist recharge le document.' : n + ' colonne(s) de lien ajoutée(s).');
        return charger();
      }).then(function () { rendre(); if (configLab) configLab.rafraichir('donnees'); }).catch(function (err) {
        b.disabled = false;
        if (configLab) configLab.message('error', 'Modification refusée par Grist : seuls les propriétaires du document le peuvent. (' + ((err && err.message) || err) + ')');
      });
    });
  }

  var configLab = null, avantApercu = null;
  function monterCoque() {
    var z = document.getElementById('rn-coque');
    if (configLab || !z || !window.ConfigLab) return;
    brouillonReglages = JSON.parse(JSON.stringify(reglages || {}));
    brouillonReglages.page = brouillonReglages.page || { marque: '', titre: 'Réunions', pied: { accessibilite: '' } };
    configLab = window.ConfigLab.monter(z, {
      nom: 'Widget réunion',
      vue: { libelle: 'Réunions', element: app },
      ongletInitial: route().vue === 'reglages' ? 'reglages' : 'vue',
      page: brouillonReglages.page,
      onglets: [{ id: 'reglages', libelle: 'Général', rendre: function (zone) { zone.innerHTML = reglagesPropres(); brancherReglages(zone); } },
        { id: 'donnees', libelle: 'Données', rendre: rendreDonnees }],
      // Aperçu réel : l'outil lui-même s'affiche sous l'en-tête, avec les listes en cours de saisie (même non enregistrées).
      surApercu: function (ouvert) {
        if (ouvert && configLab && configLab.estModifie() && brouillonReglages) {
          avantApercu = reglages;
          var d = JSON.parse(JSON.stringify(brouillonReglages)); d.listes = d.listes || {};
          LISTES_REGLABLES.forEach(function (l) {
            var n = document.getElementById('rg-' + l[0]); if (!n) return;
            var v = n.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
            if (!v.length || v.join('|') === DEFAUTS[l[0]].join('|')) delete d.listes[l[0]]; else d.listes[l[0]] = v;
          });
          d.dureeDefaut = num(document.getElementById('rg-duree').value) || 10;
          appliquerReglages(d); rendre();
        } else if (!ouvert && avantApercu) { appliquerReglages(avantApercu); avantApercu = null; rendre(); }
      },
      publication: { mode: 'connecte', adresseWidget: location.href.split('#')[0].split('?')[0],
        publier: {
          lienDoc: (brouillonReglages.publication && brouillonReglages.publication.lienDoc) || '',
          texte: 'Page publique en lecture seule : prochaines réunions, instances, ordre du jour, puis compte rendu une fois la réunion à la dernière étape (« Compte rendu diffusé »). Une réunion « En préparation » n\'est jamais publiée.',
          champs: [{ type: 'case', libelle: 'Afficher les participants et les excusés', aide: 'Désactivé par défaut : ce sont des noms de personnes.', valeur: !!(brouillonReglages.publication && brouillonReglages.publication.participants) },
            { libelle: 'Lien du questionnaire de proposition de points (facultatif)', aide: 'Questionnaire grist-questionnaire branché sur la table ' + T_PUBLICS + ' (jamais sur Points). Chaque réunion en préparation propose alors « Copier le lien de proposition », avec la réunion déjà choisie : {reunion} est remplacé par son numéro, sinon pre_Reunion est ajouté au lien.',
              exemple: 'https://lab17bis.github.io/grist-questionnaire/v1/formulaire.html?grist=…&pre_Reunion={reunion}', valeur: (brouillonReglages.publication && brouillonReglages.publication.lienProposition) || '' }],
          construire: function (l) { return window.GristPublic ? window.GristPublic.lien(location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, 'public.html'), { doc: l }) : null; },
          surChangement: function (l, champs) { brouillonReglages.publication = { lienDoc: l, participants: !!(champs && champs[0] && champs[0].valeur), lienProposition: String((champs && champs[1] && champs[1].valeur) || '').trim() }; }
        } },
      surEnregistrer: enregistrerReglages
    });
  }
  function enregistrerReglages() {
    var b = brouillonReglages;
    if (DEMO) { if (configLab) configLab.message('info', 'Mode démonstration : rien n\'est enregistré. Dans Grist, les réglages sont enregistrés dans le document.'); return; }
    LISTES_REGLABLES.forEach(function (l) {
      var v = document.getElementById('rg-' + l[0]).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!v.length || v.join('|') === DEFAUTS[l[0]].join('|')) delete b.listes[l[0]]; else b.listes[l[0]] = v;
    });
    b.dureeDefaut = num(document.getElementById('rg-duree').value) || 10;
    var actions = colonnesChampsPerso(b);
    if (!meta.colConfig) actions.push(['AddColumn', 'Reunions', NOM_COLONNE_CONFIG, { type: 'Text', label: NOM_COLONNE_CONFIG }]);
    actions.push(['ModifyColumn', 'Reunions', NOM_COLONNE_CONFIG, { description: JSON.stringify(b) }]);
    LISTES_REGLABLES.forEach(function (l) {
      var liste = b.listes[l[0]] || DEFAUTS[l[0]];
      var t = meta.tables.filter(function (x) { return x.tableId === l[2]; })[0];
      var c = t && meta.colonnes.filter(function (x) { return x.parentId === t.id && x.colId === l[3]; })[0];
      if (!c || !/^Choice/.test(c.type)) return;
      var o = {}; try { o = JSON.parse(c.widgetOptions || '{}'); } catch (e) { o = {}; }
      o.choices = liste;
      actions.push(['ModifyColumn', l[2], l[3], { widgetOptions: JSON.stringify(o) }]);
    });
    grist.docApi.applyUserActions(actions).then(function () {
      return Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]).then(function (m) { meta.tables = lignesDepuisColonnes(m[0]); meta.colonnes = lignesDepuisColonnes(m[1]); });
    }).then(function () {
      meta.colConfig = true; appliquerReglages(b);
      if (configLab) { configLab.enregistre(); configLab.message('success', 'Réglages enregistrés.'); }
      rendre();
    }).catch(function (err) {
      if (configLab) configLab.message('error', 'Enregistrement impossible : seuls les propriétaires du document peuvent modifier les réglages. (' + ((err && err.message) || err) + ')');
    });
  }


  // ---------------------------------------------------------------------------
  // Installation dans un document vide : création des tables, exemple facultatif
  // ---------------------------------------------------------------------------

  function choix(l) { return { type: 'Choice', widgetOptions: JSON.stringify({ choices: l }) }; }
  function schema() {
    return {
      Reunions: [['Titre', { type: 'Text' }], ['Instance', choix(L.instances)], ['Date', { type: 'Date' }], ['Heure', { type: 'Text' }],
        ['Duree_prevue', { type: 'Int' }], ['Lieu', { type: 'Text' }], ['Animation', { type: 'Text' }], ['Secretariat', { type: 'Text' }],
        ['Participants', { type: 'Text' }], ['Excuses', { type: 'Text' }], ['Objectif', { type: 'Text' }], ['Statut', choix(L.statutsReunion)],
        [NOM_COLONNE_CONFIG, { type: 'Text' }]],
      Points: [['Reunion', { type: 'Ref:Reunions' }], ['Titre', { type: 'Text' }], ['Description', { type: 'Text' }], ['Type', choix(L.typesPoint)],
        ['Duree', { type: 'Int' }], ['Porteur', { type: 'Text' }], ['Statut', choix(STATUTS_POINT)], ['Ordre', { type: 'Numeric' }],
        ['Notes', { type: 'Text' }], ['Traite', { type: 'Bool' }],
        ['Propose_par', { type: 'Text', isFormula: false, formula: 'user.Name' }],
        ['Propose_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }]],
      Decisions: [['Reunion', { type: 'Ref:Reunions' }], ['Point', { type: 'Ref:Points' }], ['Texte', { type: 'Text' }]],
      Actions_reunion: [['Reunion', { type: 'Ref:Reunions' }], ['Point', { type: 'Ref:Points' }], ['Intitule', { type: 'Text' }], ['Responsable', { type: 'Text' }],
        ['Echeance', { type: 'Date' }], ['Etat', choix(L.etatsAction)]]
    };
  }
  // Ordre du jour participatif : colonnes et table facultatives, ajoutées à l'installation ou depuis Réglages.
  function donneeCol(def) { return Object.assign({ isFormula: false }, def); }
  function schemaParticipatif() {
    return {
      Reunions: [['Fin_propositions', donneeCol({ type: 'Date' })], ['Cloture_points', donneeCol({ type: 'Int' })], ['Cloture_publiques', donneeCol({ type: 'Int' })]],
      Points: [['Origine', donneeCol({ type: 'Text' })], ['Hors_delai', { type: 'Bool', isFormula: true, formula: F_HORS_DELAI }]]
    };
  }
  function schemaPublics() {
    return [['Reunion', donneeCol({ type: 'Ref:Reunions' })], ['Titre', donneeCol({ type: 'Text' })], ['Description', donneeCol({ type: 'Text' })],
      ['Type', donneeCol(choix(L.typesPoint))], ['Duree', donneeCol({ type: 'Int' })], ['Porteur', donneeCol({ type: 'Text' })], ['Nom', donneeCol({ type: 'Text' })],
      ['Envoye_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }],
      ['Recevable', { type: 'Bool', isFormula: true, formula: F_RECEVABLE }],
      ['Suite', donneeCol(choix(['Reprise', 'Écartée']))], ['Point', donneeCol({ type: 'Ref:Points' })]];
  }
  function aTablePublics() { return !!meta.tables.filter(function (x) { return x.tableId === T_PUBLICS; })[0]; }
  function participatifPret() {
    var sc = schemaParticipatif();
    return Object.keys(sc).every(function (t) { return sc[t].every(function (c) { return aColonne(t, c[0]); }); });
  }
  function publicsPrets() { return aTablePublics() && schemaPublics().every(function (c) { return aColonne(T_PUBLICS, c[0]); }); }
  function actionsParticipatif(avecPublics) {
    var sc = schemaParticipatif(), a = [];
    Object.keys(sc).forEach(function (t) { sc[t].forEach(function (c) { if (!aColonne(t, c[0])) a.push(['AddColumn', t, c[0], Object.assign({}, c[1])]); }); });
    if (avecPublics) {
      if (!aTablePublics()) a.push(['AddTable', T_PUBLICS, schemaPublics().map(function (c) { return Object.assign({ id: c[0] }, c[1]); })]);
      else schemaPublics().forEach(function (c) { if (!aColonne(T_PUBLICS, c[0])) a.push(['AddColumn', T_PUBLICS, c[0], Object.assign({}, c[1])]); });
    }
    return a;
  }
  // Libellés lisibles des références de la table des propositions publiques.
  function affichagePublics() {
    return Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]).then(function (m) {
      var tabs = lignesDepuisColonnes(m[0]), cols = lignesDepuisColonnes(m[1]);
      function col(t, c) { var tb = tabs.filter(function (x) { return x.tableId === t; })[0]; return tb && cols.filter(function (x) { return x.parentId === tb.id && x.colId === c; })[0]; }
      var aff = [];
      [[T_PUBLICS, 'Reunion', 'Reunions', 'Titre'], [T_PUBLICS, 'Point', 'Points', 'Titre']].forEach(function (r) {
        var c = col(r[0], r[1]), v = col(r[2], r[3]);
        if (c && v && !c.visibleCol) { aff.push(['ModifyColumn', r[0], r[1], { visibleCol: v.id }]); aff.push(['SetDisplayFormula', r[0], null, c.id, '$' + r[1] + '.' + r[3]]); }
      });
      return aff.length ? grist.docApi.applyUserActions(aff) : null;
    });
  }
  function installerParticipatif(avecPublics) {
    if (DEMO) { if (configLab) configLab.message('info', 'Mode démonstration : dans Grist, ce bouton ajoute les colonnes et la table au document.'); return; }
    var a = actionsParticipatif(avecPublics);
    if (!a.length) return;
    grist.docApi.applyUserActions(a).then(function () { return avecPublics ? affichagePublics() : null; }).then(function () { return charger(); }).then(function () {
      if (configLab) { configLab.message('success', avecPublics ? 'Table ' + T_PUBLICS + ' créée. Publiez le questionnaire de proposition sur cette table, puis posez les règles d\'accès (Réglages › Données).' :
        'Date limite des propositions ajoutée : réglez-la dans les informations de chaque réunion. Posez ensuite les règles d\'accès (Réglages › Données).'); configLab.rafraichir('reglages'); }
      rendre();
    }).catch(function (err) {
      if (configLab) configLab.message('error', 'Ajout impossible : seuls les propriétaires du document peuvent ajouter des colonnes et des tables. (' + ((err && err.message) || err) + ')');
    });
  }
  // Un formulaire Grist publié sur Points permet d'y écrire toutes les colonnes (Statut, Ordre, auteur) : à signaler.
  function formulairePublieSurPoints() {
    var t = meta.tables.filter(function (x) { return x.tableId === 'Points'; })[0];
    if (!t || !meta.sections) return false;
    return meta.sections.some(function (sec) {
      if (sec.tableRef !== t.id || sec.parentKey !== 'form') return false;
      try { var o = JSON.parse(sec.shareOptions || '{}'); return !!(o.publish && o.form); } catch (e) { return false; }
    });
  }
  function blocParticipatif() {
    var h = '<h2 class="fr-h5 fr-mt-3w">Ordre du jour participatif</h2>' +
      '<p class="fr-text--sm">L\'équipe propose des points ; la personne qui anime les retient, les reporte ou les écarte. Deux compléments facultatifs :</p>';
    if (formulairePublieSurPoints()) h += '<div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w"><p>Un formulaire Grist est publié sur la table <code>Points</code>. Grist laisse un formulaire publié écrire toutes les colonnes de sa table, y compris le statut et l\'auteur : n\'importe qui peut alors inscrire un point directement à l\'ordre du jour. Dépubliez-le et publiez le formulaire sur <code>' + T_PUBLICS + '</code>.</p></div>';
    h += '<h3 class="fr-h6">Date limite des propositions</h3>';
    if (DEMO || participatifPret()) h += '<p class="fr-text--sm">En place : la date se règle dans les informations de chaque réunion. Une fois passée, seule la personne qui anime ajoute des points (règles d\'accès posées depuis Réglages › Données).</p>';
    else h += '<p class="fr-text--sm">Ajoute les colonnes <code>Fin_propositions</code>, <code>Cloture_points</code> et <code>Cloture_publiques</code> à Reunions, <code>Origine</code> et <code>Hors_delai</code> (calculée) à Points. Rien n\'est renommé ni supprimé.</p>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-rn-participatif="colonnes">Ajouter la date limite des propositions</button>';
    h += '<h3 class="fr-h6 fr-mt-2w">Propositions sans compte Grist</h3>';
    if (DEMO || publicsPrets()) h += '<p class="fr-text--sm">Table <code>' + T_PUBLICS + '</code> en place. Publiez un questionnaire grist-questionnaire sur cette table, jamais sur <code>Points</code>, avec les champs Titre, Description, Type, Duree, Porteur et Nom. Collez son lien dans Publication : chaque réunion « ' + esc(L.statutsReunion[0]) + ' » propose alors « Copier le lien de proposition », avec la réunion déjà choisie (<code>pre_Reunion</code>, à figer ou masquer dans le questionnaire). Les propositions reçues s\'affichent à part, à reprendre ou à écarter ; elles ne comptent plus après la date limite ni quand la réunion quitte sa première étape.</p>';
    else h += '<p class="fr-text--sm">Crée la table <code>' + T_PUBLICS + '</code>, où un formulaire public dépose les propositions sans toucher à l\'ordre du jour (et ajoute la date limite si elle manque).</p>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-rn-participatif="publics">Créer la table des propositions sans compte</button>';
    return h;
  }
  function tablesManquantes() {
    var ids = meta.tables.map(function (t) { return t.tableId; });
    return TABLES.filter(function (t) { return ids.indexOf(t) < 0; });
  }

  // Tables du même nom déjà présentes (créées à la main ou par un autre outil) :
  // le widget les garde et leur ajoute seulement les colonnes qui leur manquent.
  // La colonne des réglages n'en fait pas partie : elle est créée au premier enregistrement.
  function colonnesManquantes() {
    if (DEMO || !meta.tables.length) return [];
    var sch = schema(), absentes = tablesManquantes(), r = [];
    TABLES.forEach(function (t) {
      if (absentes.indexOf(t) >= 0) return;
      sch[t].forEach(function (c) { if (c[0] !== NOM_COLONNE_CONFIG && !aColonne(t, c[0])) r.push({ table: t, id: c[0], def: c[1] }); });
    });
    return r;
  }
  var CONSEIL_RENOMMER = 'Si l\'une de vos colonnes contient déjà cette information sous un autre nom (par exemple <code>Objet</code> au lieu de <code>Titre</code>), renommez-la d\'abord dans Grist avec le nom attendu : ses données seront reprises.';
  function blocColonnesManquantes() {
    var m = colonnesManquantes();
    if (!m.length) return '';
    return '<div class="fr-alert fr-alert--warning fr-mb-3w"><h2 class="fr-alert__title">Des colonnes attendues manquent dans vos tables</h2>' +
      '<p>' + m.map(function (c) { return '<code>' + esc(c.table + '.' + c.id) + '</code>'; }).join(', ') + '. Sans elles, le widget ne peut ni afficher ni enregistrer ces informations.</p>' +
      '<p class="fr-text--sm">' + CONSEIL_RENOMMER + ' Sinon, ajoutez-les : rien n\'est renommé ni supprimé. À faire par un propriétaire du document.</p>' +
      '<button type="button" class="fr-btn fr-btn--sm" data-action="completer-colonnes">Ajouter les colonnes manquantes</button></div>';
  }
  function actionsColonnesManquantes() {
    return colonnesManquantes().map(function (c) { return ['AddColumn', c.table, c.id, Object.assign({}, c.def)]; });
  }
  function completerColonnes() {
    var a = actionsColonnesManquantes();
    if (!a.length) return;
    grist.docApi.applyUserActions(a).then(function () {
      etat.alerte = { type: 'success', texte: a.length + ' colonne(s) ajoutée(s).' };
      return charger();
    }).then(rendre).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Ajout impossible : seuls les propriétaires du document peuvent ajouter des colonnes. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }

  function vueInstallation() {
    var manquantes = tablesManquantes(), presentes = TABLES.filter(function (t) { return manquantes.indexOf(t) < 0; });
    return '<h1 class="fr-h3">Installer l\'outil de réunion dans ce document</h1>' + blocAlerte() +
      '<p>Le widget a besoin des tables ' + manquantes.map(function (t) { return '<code>' + t + '</code>'; }).join(', ') + '. Il peut les créer pour vous.' +
      (presentes.length ? ' Les tables déjà présentes (' + presentes.map(function (t) { return '<code>' + t + '</code>'; }).join(', ') + ') sont gardées : le widget leur ajoute seulement les colonnes qui leur manquent, rien n\'est renommé ni supprimé.</p><p class="fr-text--sm">' + CONSEIL_RENOMMER + '</p>' : ' Les tables existantes ne sont pas modifiées.</p>') +
      '<p class="fr-text--sm">À faire par un propriétaire du document. Le widget doit avoir l\'accès complet au document.</p>' +
      '<ul class="fr-btns-group fr-btns-group--inline-md"><li><button type="button" class="fr-btn" data-installer="vide">Créer les tables</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--secondary" data-installer="exemple">Créer les tables avec un exemple fictif</button></li></ul>';
  }

  function installer(avecExemple) {
    var sch = schema(), actions = [];
    tablesManquantes().forEach(function (t) {
      actions.push(['AddTable', t, sch[t].map(function (c) { return Object.assign({ id: c[0] }, c[1]); })]);
    });
    actions = actions.concat(actionsColonnesManquantes());
    // Date limite des propositions : colonnes ajoutées après la création des tables (la formule Hors_delai lit Reunions).
    var sp = schemaParticipatif();
    Object.keys(sp).forEach(function (t) { sp[t].forEach(function (c) { if (tablesManquantes().indexOf(t) >= 0 || !aColonne(t, c[0])) actions.push(['AddColumn', t, c[0], Object.assign({}, c[1])]); }); });
    return grist.docApi.applyUserActions(actions).then(function () {
      // Les références affichent un libellé lisible plutôt qu'un numéro.
      return Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]).then(function (m) {
        var tabs = lignesDepuisColonnes(m[0]), cols = lignesDepuisColonnes(m[1]);
        function col(t, c) { var tb = tabs.filter(function (x) { return x.tableId === t; })[0]; return tb && cols.filter(function (x) { return x.parentId === tb.id && x.colId === c; })[0]; }
        var aff = [];
        [['Points', 'Reunion', 'Reunions', 'Titre'], ['Decisions', 'Reunion', 'Reunions', 'Titre'], ['Decisions', 'Point', 'Points', 'Titre'],
          [T_ACTIONS, 'Reunion', 'Reunions', 'Titre'], [T_ACTIONS, 'Point', 'Points', 'Titre']].forEach(function (r) {
          var c = col(r[0], r[1]), v = col(r[2], r[3]);
          if (c && v && !c.visibleCol) {
            aff.push(['ModifyColumn', r[0], r[1], { visibleCol: v.id }]);
            aff.push(['SetDisplayFormula', r[0], null, c.id, '$' + r[1] + '.' + r[3]]);
          }
        });
        return aff.length ? grist.docApi.applyUserActions(aff) : null;
      });
    }).then(function () {
      return avecExemple ? fetch('exemples/demo.json').then(function (r) { return r.json(); }).then(function (json) {
        var auj = aujourdhui(), ex = [];
        TABLES.forEach(function (t) {
          var lignes = json[t] || [];
          if (!lignes.length) return;
          var cols = {};
          sch[t].forEach(function (c) { if (c[0] !== NOM_COLONNE_CONFIG && !/^Propose_le$/.test(c[0])) cols[c[0]] = []; });
          lignes.forEach(function (l) {
            Object.keys(cols).forEach(function (k) {
              var v = l[k];
              if (typeof v === 'string' && /^J[+-]\d+$/.test(v)) v = auj + 86400 * (+v.slice(1));
              if (v === undefined) v = sch[t].filter(function (c) { return c[0] === k; })[0][1].type === 'Bool' ? false : null;
              cols[k].push(v);
            });
          });
          ex.push(['BulkAddRecord', t, lignes.map(function (l) { return l.id; }), cols]);
        });
        return grist.docApi.applyUserActions(ex);
      }) : null;
    }).then(function () {
      etat.alerte = { type: 'success', texte: 'Outil installé.' + (avecExemple ? ' L\'exemple fictif est chargé : supprimez ses lignes quand vous voulez.' : '') + ' Les règles d\'accès proposées sont posées en même temps : vérifiez-les dans Réglages › Données.' };
      return charger();
    }).then(function () {
      // Règles d'accès proposées, posées en dernier : Grist recharge le document dès qu'elles changent.
      if (DEMO || !window.DonneesLab) return null;
      return DonneesLab.lire().then(function (acl) { return DonneesLab.installerRegles(acl, meta, REGLES_ACCES); }).catch(function () { return null; });
    }).then(rendre).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Installation impossible : seuls les propriétaires du document peuvent créer des tables. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Minuteur
  // ---------------------------------------------------------------------------

  var tic = null;
  function majChrono() {
    clearInterval(tic);
    var z = app.querySelector('[data-chrono]');
    if (!z || !etat.chrono) return;
    function maj() {
      var ecoule = Math.floor((Date.now() - etat.chrono.debut) / 1000), prevu = num(z.getAttribute('data-duree')) * 60;
      var reste = prevu - ecoule, s = Math.abs(reste);
      z.textContent = (reste < 0 ? 'Dépassement : +' : prevu ? 'Reste ' : 'Écoulé ') + Math.floor((prevu ? s : ecoule) / 60) + ' min ' + String((prevu ? s : ecoule) % 60).padStart(2, '0') + ' s';
      z.classList.toggle('rn-chrono__temps--depasse', prevu > 0 && reste < 0);
    }
    maj(); tic = setInterval(maj, 1000);
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------

  function maxOrdre(rid) { return pointsDe(rid).reduce(function (m, p) { return Math.max(m, p.Ordre || 0); }, 0); }

  app.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    var a = el.getAttribute('data-action');
    if (a === 'voir-passees') { etat.passees = !etat.passees; rendre(); return; }
    if (a === 'imprimer') { window.print(); return; }
    if (a === 'completer-colonnes') { el.disabled = true; completerColonnes(); return; }
    if (a === 'copier-cr') {
      var texte = texteCompteRendu(idx.Reunions[num(el.getAttribute('data-reunion'))]);
      (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(function () {
        etat.alerte = { type: 'success', texte: 'Texte du compte rendu copié : collez-le dans un courriel ou un document.' }; rendre();
      }).catch(function () { etat.alerte = { type: 'error', texte: 'Copie impossible depuis ce navigateur. Utilisez « Imprimer ou enregistrer en PDF ».' }; rendre(); });
      return;
    }
    if (a === 'copier-lien-proposition') {
      var lien = el.getAttribute('data-lien');
      (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(function () {
        etat.alerte = { type: 'success', texte: 'Lien de proposition copié : envoyez-le aux personnes sans compte Grist. La réunion y est déjà choisie.' }; rendre();
      }).catch(function () { etat.alerte = { type: 'info', texte: 'Copie impossible depuis ce navigateur. Lien de proposition : ' + lien }; rendre(); });
      return;
    }
    if (a === 'arreter-chrono') { etat.chrono = null; rendre(); return; }
    if (a === 'enregistrer-reglages') { enregistrerReglages(); return; }
    if (a === 'annuler-reglages') { brouillonReglages = null; location.hash = '#/'; return; }
    if (a === 'annuler-suppression') { etat.suppression = null; rendre(); return; }
    if (el.hasAttribute('data-installer')) { el.disabled = true; installer(el.getAttribute('data-installer') === 'exemple'); return; }
    if (el.hasAttribute('data-chrono-demarrer')) { etat.chrono = { point: num(el.getAttribute('data-chrono-demarrer')), debut: Date.now() }; rendre(); return; }
    if (el.hasAttribute('data-demander-suppression')) { etat.suppression = el.getAttribute('data-demander-suppression'); rendre(); return; }
    if (el.hasAttribute('data-point-statut')) {
      var pid = num(el.getAttribute('data-point-statut')), v = el.getAttribute('data-valeur'), p = idx.Points[pid];
      var champs = { Statut: v };
      if (v === 'Retenu') champs.Ordre = maxOrdre(num(p.Reunion)) + 1;
      executer([['UpdateRecord', 'Points', pid, champs]], { Retenu: 'Point ajouté à l\'ordre du jour.', 'Reporté': 'Point reporté : il sera proposé à la réunion suivante.', 'Écarté': 'Proposition écartée.', 'Proposé': 'Point remis en proposition.' }[v]);
      return;
    }
    if (el.hasAttribute('data-publique')) {
      var x = idx[T_PUBLICS][num(el.getAttribute('data-publique'))], suite = el.getAttribute('data-valeur');
      if (!x) return;
      if (suite !== 'Reprise') { executer([['UpdateRecord', T_PUBLICS, x.id, { Suite: suite }]], 'Proposition écartée.'); return; }
      var origine = 'formulaire public : ' + (String(x.Nom || '').trim() || 'sans nom') + ' (nom déclaré)';
      var champsP = { Reunion: num(x.Reunion), Titre: String(x.Titre || '').trim(), Description: x.Description || '',
        Type: L.typesPoint.indexOf(x.Type) >= 0 ? x.Type : L.typesPoint[0], Duree: num(x.Duree) > 0 ? Math.min(num(x.Duree), 600) : DUREE_DEFAUT,
        Porteur: String(x.Porteur || '').trim(), Statut: 'Proposé' };
      if (DEMO || aColonne('Points', 'Origine')) champsP.Origine = origine;
      else champsP.Description = (champsP.Description ? champsP.Description + '\n\n' : '') + 'Reçu par ' + origine + '.';
      el.disabled = true;
      ecrire([['AddRecord', 'Points', null, champsP]]).then(function (res) {
        var nid = Array.isArray(res) ? res[0] : (res && res.retValues ? res.retValues[0] : null);
        return executer([['UpdateRecord', T_PUBLICS, x.id, nid ? { Suite: 'Reprise', Point: nid } : { Suite: 'Reprise' }]], 'Proposition reprise : elle figure dans les propositions, à retenir ou non.');
      }).catch(refus);
      return;
    }
    if (el.hasAttribute('data-deplacer')) {
      var p1 = idx.Points[num(el.getAttribute('data-deplacer'))], sens = num(el.getAttribute('data-sens'));
      var liste = pointsDe(num(p1.Reunion), 'Retenu'), i = liste.indexOf(p1), p2 = liste[i + sens];
      if (!p2) return;
      // Renumérote pour éviter les égalités d'ordre.
      var actions = [];
      liste.splice(i, 1); liste.splice(i + sens, 0, p1);
      liste.forEach(function (x, k) { if (x.Ordre !== k + 1) actions.push(['UpdateRecord', 'Points', x.id, { Ordre: k + 1 }]); });
      executer(actions);
      return;
    }
    if (el.hasAttribute('data-supprimer')) {
      var s = el.getAttribute('data-supprimer').split(':');
      executer([['RemoveRecord', s[0], num(s[1])]], 'Supprimé.');
      return;
    }
    if (el.hasAttribute('data-diffuser')) {
      var statuts = L.statutsReunion;
      executer([['UpdateRecord', 'Reunions', num(el.getAttribute('data-diffuser')), { Statut: statuts[statuts.length - 1] }]], 'Compte rendu marqué comme diffusé.');
      return;
    }
    if (el.hasAttribute('data-confirmer-reunion')) {
      var rid = num(el.getAttribute('data-confirmer-reunion'));
      var acts = [];
      ['Decisions', T_ACTIONS, 'Points'].forEach(function (t) { data[t].forEach(function (l) { if (num(l.Reunion) === rid) acts.push(['RemoveRecord', t, l.id]); }); });
      acts.push(['RemoveRecord', 'Reunions', rid]);
      etat.suppression = null;
      executer(acts, 'Réunion supprimée.', function () { location.hash = '#/'; });
    }
  });

  app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-brouillon')) brouillon(el.getAttribute('data-brouillon'))[el.getAttribute('data-champ')] = el.value;
  });

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-filtre')) {
      if (el.getAttribute('data-filtre') === 'instance') etat.filtreInstance = el.value; else etat.filtreResponsable = el.value;
      rendre(); return;
    }
    if (el.hasAttribute('data-notes')) {
      var pid = num(el.getAttribute('data-notes'));
      if ((idx.Points[pid].Notes || '') !== el.value) executer([['UpdateRecord', 'Points', pid, { Notes: el.value }]], 'Notes enregistrées.');
      return;
    }
    if (el.hasAttribute('data-ajout-participant')) {
      var zone = document.getElementById(el.getAttribute('data-ajout-participant')), nom = el.value;
      el.value = '';
      if (!zone || !nom) return;
      var deja = zone.value.split(/[,\n;]+/).map(function (x) { return x.trim(); });
      if (deja.indexOf(nom) < 0) { zone.value = zone.value.replace(/\s+$/, '') + (zone.value.trim() ? '\n' : '') + nom; zone.dispatchEvent(new Event('input', { bubbles: true })); }
      zone.focus();
      return;
    }
    if (el.hasAttribute('data-traite')) { executer([['UpdateRecord', 'Points', num(el.getAttribute('data-traite')), { Traite: el.checked }]]); return; }
    if (el.hasAttribute('data-etat-action')) { executer([['UpdateRecord', T_ACTIONS, num(el.getAttribute('data-etat-action')), { Etat: el.value }]], 'État de l\'action mis à jour.'); return; }
    if (el.hasAttribute('data-statut')) { executer([['UpdateRecord', 'Reunions', num(el.getAttribute('data-statut')), { Statut: el.value }]], 'Étape mise à jour.'); }
  });

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, type = f.getAttribute('data-form');
    var rid = num(f.getAttribute('data-reunion')), pid = num(f.getAttribute('data-point'));
    var cle, b;
    if (type === 'nouvelle') {
      var depuis = num(f.getAttribute('data-depuis'));
      cle = 'nouvelle-' + depuis; b = brouillon(cle);
      if (!String(b.Titre || '').trim()) { etat.alerte = { type: 'error', texte: 'Indiquez un titre.' }; rendre(); return; }
      var manq = manquesPerso(b);
      if (manq.length) { etat.alerte = { type: 'error', texte: 'Renseignez : ' + manq.join(', ') + '.' }; rendre(); return; }
      var champs = Object.assign(champsReunionComplets(b), { Statut: L.statutsReunion[0] });
      ecrire([['AddRecord', 'Reunions', null, champs]]).then(function (res) {
        var nid = res.retValues[0];
        // Les points reportés de la réunion d'origine sont proposés à la nouvelle.
        var reportes = depuis ? pointsDe(depuis, 'Reporté') : [];
        var acts = reportes.map(function (p) {
          return ['AddRecord', 'Points', null, { Reunion: nid, Titre: p.Titre, Description: p.Description || '', Type: p.Type || '', Duree: p.Duree || null, Porteur: p.Porteur || '', Statut: 'Proposé' }];
        });
        return (acts.length ? ecrire(acts) : Promise.resolve()).then(function () { return nid; });
      }).then(function (nid) {
        delete etat.brouillons[cle];
        etat.alerte = { type: 'success', texte: 'Réunion créée. L\'équipe peut maintenant proposer des points.' };
        return (DEMO ? Promise.resolve() : charger()).then(function () { etat.garderAlerte = true; location.hash = '#/reunion/' + nid; });
      }).catch(function (err) { etat.alerte = { type: 'error', texte: 'Création refusée par Grist. (' + ((err && err.message) || err) + ')' }; rendre(); });
      return;
    }
    if (type === 'infos') {
      b = brouillon('infos-' + rid);
      if (!String(b.Titre || '').trim()) { etat.alerte = { type: 'error', texte: 'Indiquez un titre.' }; rendre(); return; }
      var manq2 = manquesPerso(b);
      if (manq2.length) { etat.alerte = { type: 'error', texte: 'Renseignez : ' + manq2.join(', ') + '.' }; rendre(); return; }
      // Seuls les champs modifiés sont envoyés : une règle sur un champ inchangé (animation, date limite) ne bloque pas les autres.
      var avant = idx.Reunions[rid] || {}, nouveaux = champsReunionComplets(b), modifs = {};
      Object.keys(nouveaux).forEach(function (k) { var x = avant[k], y = nouveaux[k]; if (!((x === y) || ((x === null || x === undefined || x === '' || x === 0) && (y === null || y === undefined || y === '' || y === 0)))) modifs[k] = y; });
      if (!Object.keys(modifs).length) { etat.alerte = { type: 'info', texte: 'Aucune modification à enregistrer.' }; delete etat.brouillons['infos-' + rid]; rendre(); return; }
      executer([['UpdateRecord', 'Reunions', rid, modifs]], 'Informations enregistrées.', function () { delete etat.brouillons['infos-' + rid]; });
      return;
    }
    if (type === 'point') {
      cle = 'point-' + rid; b = brouillon(cle);
      if (!String(b.Titre || '').trim()) { etat.alerte = { type: 'error', texte: 'Indiquez le sujet du point.' }; rendre(); return; }
      executer([['AddRecord', 'Points', null, { Reunion: rid, Titre: String(b.Titre).trim(), Description: b.Description || '', Type: b.Type || L.typesPoint[0],
        Duree: num(b.Duree) || DUREE_DEFAUT, Porteur: b.Porteur || '', Statut: 'Proposé' }]], 'Point proposé. Il apparaît dans les propositions.', function () { delete etat.brouillons[cle]; });
      return;
    }
    if (type === 'decision') {
      cle = 'dec-' + pid; b = brouillon(cle);
      if (!String(b.Texte || '').trim()) return;
      executer([['AddRecord', 'Decisions', null, { Reunion: rid, Point: pid, Texte: String(b.Texte).trim() }]], 'Décision ajoutée.', function () { delete etat.brouillons[cle]; });
      return;
    }
    if (type === 'action') {
      cle = 'act-' + pid; b = brouillon(cle);
      if (!String(b.Intitule || '').trim()) { etat.alerte = { type: 'error', texte: 'Décrivez l\'action à mener.' }; rendre(); return; }
      executer([['AddRecord', T_ACTIONS, null, { Reunion: rid, Point: pid, Intitule: String(b.Intitule).trim(), Responsable: b.Responsable || '',
        Echeance: saisieVersDate(b.Echeance), Etat: L.etatsAction[0] }]], 'Action ajoutée.', function () { delete etat.brouillons[cle]; });
    }
  });

  window.addEventListener('hashchange', function () {
    if (etat.garderAlerte) etat.garderAlerte = false; else etat.alerte = null;
    etat.suppression = null;
    if (configLab && configLab.ongletActif() !== 'apercu') configLab.onglet(route().vue === 'reglages' ? 'reglages' : 'vue');
    rendre(); window.scrollTo(0, 0);
  });

  // Une mise à jour venue de Grist pendant une saisie attend la fin de la saisie.
  app.addEventListener('focusout', function () {
    if (etat.rendreApresSaisie) { etat.rendreApresSaisie = false; setTimeout(rendre, 0); }
  });
  function rendreSiLibre() {
    var a = document.activeElement;
    if (a && app.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { etat.rendreApresSaisie = true; return; }
    rendre();
  }

  // ---------------------------------------------------------------------------
  // Thème
  // ---------------------------------------------------------------------------

  var choixTheme = 'auto';
  try { choixTheme = localStorage.getItem('rn-theme') || 'auto'; } catch (e) { /* stockage indisponible */ }
  function themeGrist() {
    var st = getComputedStyle(document.documentElement);
    var m = (st.getPropertyValue('--grist-theme-page-bg') || st.getPropertyValue('--grist-theme-bg') || '').trim().match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5 ? 'dark' : 'light';
  }
  function appliquerTheme() {
    var t = choixTheme;
    if (t === 'auto') t = themeGrist() || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-fr-theme', t);
  }
  var selectTheme = document.getElementById('rn-theme');
  selectTheme.value = choixTheme;
  selectTheme.addEventListener('change', function () {
    choixTheme = selectTheme.value;
    try { localStorage.setItem('rn-theme', choixTheme); } catch (e) { /* stockage indisponible */ }
    appliquerTheme();
  });
  new MutationObserver(appliquerTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------

  appliquerTheme();
  function erreurChargement(err) {
    app.innerHTML = '<div class="fr-alert fr-alert--error"><h2 class="fr-alert__title">Chargement impossible</h2>' +
      '<p>Vérifiez que le widget a l\'accès « Accès complet au document » et que les tables Reunions, Points, Decisions et Actions_reunion existent. Détail : ' + esc((err && err.message) || err) + '</p></div>';
  }
  document.getElementById('rn-actualiser').addEventListener('click', function () { charger().then(rendre).catch(erreurChargement); });

  if (DEMO) {
    document.getElementById('rn-demo').hidden = false;
    charger().then(rendre).catch(erreurChargement);
  } else {
    grist.ready({ requiredAccess: 'full', allowSelectBy: false });
    var attente = null;
    grist.onRecords(function () {
      clearTimeout(attente);
      attente = setTimeout(function () { charger().then(function () { appliquerTheme(); rendreSiLibre(); }).catch(erreurChargement); }, 150);
    });
    // Les propositions des collègues arrivent dans d'autres tables : relecture régulière.
    setInterval(function () { if (!document.hidden) charger().then(rendreSiLibre).catch(function () {}); }, 60000);
  }
})();
