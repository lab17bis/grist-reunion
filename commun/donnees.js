/*
 * DonneesLab : rubrique « Données » commune aux widgets Grist du Lab 17 bis.
 * Fichier partagé, copié à l'identique dans chaque dépôt qui l'utilise (comme commun/barre.js).
 *
 * Trois services, tous déclenchés par un clic d'un propriétaire (rien n'est modifié à l'ouverture) :
 *  1. Tables partagées : liste les tables de l'outil et les autres outils qui les lisent ou les écrivent.
 *  2. Règles d'accès : lit l'état des règles de chaque table et installe les règles proposées par l'outil,
 *     seulement sur les tables (ou colonnes) qui n'ont encore aucune règle. Les règles existantes ne sont jamais modifiées.
 *  3. Liens : ajoute des colonnes calculées (formules) qui relient un nom saisi en texte à sa fiche de la table
 *     Personnes, ou une ligne à un projet. Le texte d'origine est gardé ; supprimer une colonne de lien ne perd aucune donnée.
 *
 * Utilisation :
 *   DonneesLab.lire()                         -> Promise<acl> ({ res, regles } ou { illisible: true })
 *   DonneesLab.html(acl, meta, opt)           -> HTML de la rubrique (opt : voir plus bas)
 *   DonneesLab.installerRegles(acl, regles)   -> Promise (le document se recharge quand les règles changent)
 *   DonneesLab.ajouterLiens(meta, liens)      -> Promise<nombre de colonnes ajoutées>
 * meta : { tables: lignes de _grist_Tables, colonnes: lignes de _grist_Tables_column }
 * opt  : { partage: [[table, autres outils, usage]], regles: [regle], liens: [lien], demo: bool }
 * regle : { table, cols ('*' ou 'A,B'), formule, droits ('-CU'…), memo (message montré par Grist en cas de refus), effet (texte pour la rubrique) }
 * lien  : { table, col (colonne créée), type ('Ref:Personnes'), formule, affichage (colonne affichée de la table cible), cible, source (colonne lue), effet,
 *           requis (facultatif : [[table, colonne]] qui doivent exister) }
 * Les boutons portent data-donnees="regles" et data-donnees="liens" : l'outil branche le clic.
 */
(function () {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lignes(c) {
    var ids = (c && c.id) || [];
    return ids.map(function (id, i) { var o = {}; Object.keys(c).forEach(function (k) { o[k] = c[k][i]; }); return o; });
  }
  function table(meta, t) { return (meta.tables || []).filter(function (x) { return x.tableId === t; })[0] || null; }
  function colonne(meta, t, c) {
    var tb = table(meta, t);
    return tb ? (meta.colonnes || []).filter(function (x) { return x.parentId === tb.id && x.colId === c; })[0] || null : null;
  }
  function coupure(err) { return /disposed|closed|disconnect/i.test(String((err && err.message) || err)); }

  // Formule d'un lien vers Personnes : même nom, sans tenir compte des majuscules ni des espaces autour.
  function formulePersonne(source) {
    return "nom = ($" + source + " or \"\").strip().lower()\n" +
      "if not nom:\n  return None\n" +
      "for p in Personnes.all:\n  if (p.Nom or \"\").strip().lower() == nom:\n    return p\n" +
      "return None";
  }
  function lienPersonne(t, source, effet) {
    return { table: t, col: source + "_fiche", type: "Ref:Personnes", cible: "Personnes", affichage: "Nom", source: source,
      formule: formulePersonne(source), effet: effet || ("relie " + t + "." + source + " à la fiche de la personne") };
  }

  function lire() {
    return Promise.all([grist.docApi.fetchTable("_grist_ACLResources"), grist.docApi.fetchTable("_grist_ACLRules")]).then(function (m) {
      return { res: lignes(m[0]), regles: lignes(m[1]) };
    }).catch(function () { return { illisible: true }; });
  }

  function ressource(acl, t, cols) { return acl.res.filter(function (r) { return r.tableId === t && r.colIds === cols; })[0] || null; }
  function reglesDe(acl, rid) { return rid ? acl.regles.filter(function (r) { return r.resource === rid && (r.aclFormula || r.permissionsText); }) : []; }
  // État d'une ressource (table entière ou groupe de colonnes) au regard des règles proposées.
  function etatRessource(acl, t, cols, proposees) {
    var r = ressource(acl, t, cols), ex = reglesDe(acl, r && r.id);
    if (!ex.length) return "aucune";
    var memos = ex.map(function (x) { return x.memo || ""; });
    return proposees.every(function (p) { return memos.indexOf(p.memo) >= 0; }) ? "outil" : "autres";
  }
  // Règles proposées applicables : tables (et colonnes) présentes, sans aucune règle encore.
  function aInstaller(acl, meta, regles) {
    var groupes = {};
    regles.forEach(function (r) {
      if (!table(meta, r.table)) return;
      if (r.cols !== "*" && r.cols.split(",").some(function (c) { return !colonne(meta, r.table, c); })) return;
      var k = r.table + "|" + r.cols; (groupes[k] = groupes[k] || []).push(r);
    });
    var res = [];
    Object.keys(groupes).forEach(function (k) {
      var g = groupes[k];
      if (etatRessource(acl, g[0].table, g[0].cols, g) === "aucune") res = res.concat(g);
    });
    return res;
  }

  function installerRegles(acl, meta, regles) {
    if (acl.illisible) return Promise.reject(new Error("Seuls les propriétaires du document peuvent poser des règles d'accès."));
    var plan = aInstaller(acl, meta, regles);
    if (!plan.length) return Promise.resolve(0);
    var nouvelles = [], neg = {};
    plan.forEach(function (p) {
      var k = p.table + "|" + p.cols;
      if (!ressource(acl, p.table, p.cols) && nouvelles.indexOf(k) < 0) { nouvelles.push(k); neg[k] = -nouvelles.length; }
    });
    var base = acl.regles.reduce(function (m, r) { return Math.max(m, r.rulePos || 0); }, 0) + 1;
    var actions = [];
    if (nouvelles.length) actions.push(["BulkAddRecord", "_grist_ACLResources", nouvelles.map(function (k) { return neg[k]; }), {
      tableId: nouvelles.map(function (k) { return k.split("|")[0]; }), colIds: nouvelles.map(function (k) { return k.split("|")[1]; }) }]);
    actions.push(["BulkAddRecord", "_grist_ACLRules", plan.map(function () { return null; }), {
      resource: plan.map(function (p) { var r = ressource(acl, p.table, p.cols); return r ? r.id : neg[p.table + "|" + p.cols]; }),
      aclFormula: plan.map(function (p) { return p.formule; }), permissionsText: plan.map(function (p) { return p.droits; }),
      rulePos: plan.map(function (p, i) { return base + i; }), memo: plan.map(function (p) { return p.memo; }), userAttributes: plan.map(function () { return ""; })
    }]);
    // Une seule action : Grist recharge le document (et le widget) dès que les règles changent ; la coupure n'est pas un échec.
    return grist.docApi.applyUserActions(actions).then(function () { return plan.length; }, function (err) {
      if (coupure(err)) return plan.length;
      throw err;
    });
  }

  function liensManquants(meta, liens) {
    return (liens || []).filter(function (l) {
      return table(meta, l.table) && table(meta, l.cible) && colonne(meta, l.table, l.source) && !colonne(meta, l.table, l.col) &&
        (!l.affichage || colonne(meta, l.cible, l.affichage)) && (l.requis || []).every(function (r) { return colonne(meta, r[0], r[1]); });
    });
  }
  function ajouterLiens(meta, liens) {
    var m = liensManquants(meta, liens);
    if (!m.length) return Promise.resolve(0);
    var actions = m.map(function (l) { return ["AddColumn", l.table, l.col, { type: l.type, isFormula: true, formula: l.formule, label: l.col }]; });
    return grist.docApi.applyUserActions(actions).then(function () {
      return Promise.all([grist.docApi.fetchTable("_grist_Tables"), grist.docApi.fetchTable("_grist_Tables_column")]);
    }).then(function (x) {
      var mm = { tables: lignes(x[0]), colonnes: lignes(x[1]) }, aff = [];
      // La colonne de lien affiche le nom (ou le titre) plutôt qu'un numéro.
      m.forEach(function (l) {
        var c = colonne(mm, l.table, l.col), v = l.affichage && colonne(mm, l.cible, l.affichage);
        if (c && v) { aff.push(["ModifyColumn", l.table, l.col, { visibleCol: v.id }]); aff.push(["SetDisplayFormula", l.table, null, c.id, "$" + l.col + "." + l.affichage]); }
      });
      return aff.length ? grist.docApi.applyUserActions(aff) : null;
    }).then(function () { return m.length; });
  }

  function html(acl, meta, opt) {
    opt = opt || {};
    var h = "<div class=\"cl-panneau\">";
    if ((opt.partage || []).length) {
      h += "<h3 class=\"fr-h6\">Tables partagées avec d'autres outils</h3><p class=\"fr-text--sm\">Modifier ou supprimer une de ces tables, ou ses colonnes, touche aussi les outils indiqués.</p>" +
        "<div class=\"fr-table fr-table--sm fr-table--no-caption\"><table><caption>Tables partagées</caption><thead><tr><th scope=\"col\">Table</th><th scope=\"col\">Autres outils</th><th scope=\"col\">Usage par cet outil</th><th scope=\"col\">Dans ce document</th></tr></thead><tbody>" +
        opt.partage.map(function (p) { return "<tr><td><code>" + esc(p[0]) + "</code></td><td>" + esc(p[1]) + "</td><td>" + esc(p[2]) + "</td><td>" + (opt.demo || table(meta, p[0]) ? "présente" : "absente") + "</td></tr>"; }).join("") +
        "</tbody></table></div>";
    }
    var regles = opt.regles || [];
    h += "<h3 class=\"fr-h6\">Règles d'accès</h3>";
    if (opt.demo) {
      h += "<p class=\"fr-text--sm\">Dans Grist, cette rubrique montre l'état des règles d'accès des tables de l'outil et propose d'installer les règles recommandées.</p>";
    } else if (!acl) {
      h += "<p class=\"fr-text--sm\">Lecture des règles…</p>";
    } else if (acl.illisible) {
      h += "<p class=\"fr-text--sm\">Seuls les propriétaires du document voient les règles d'accès.</p>";
    } else {
      var lib = { aucune: "aucune règle", outil: "règles de l'outil en place", autres: "règles posées par ailleurs, gardées telles quelles" };
      var vues = {};
      (opt.tables || []).forEach(function (t) {
        var g = regles.filter(function (r) { return r.table === t && r.cols === "*"; });
        vues[t] = !table(meta, t) ? "table absente" : lib[etatRessource(acl, t, "*", g.length ? g : [{ memo: "\u0000" }])] + (g.length ? "" : " (aucune règle proposée par l'outil)");
      });
      h += "<ul class=\"fr-text--sm\">" + Object.keys(vues).map(function (t) { return "<li><code>" + esc(t) + "</code> : " + esc(vues[t]) + "</li>"; }).join("") + "</ul>";
      if (regles.length) {
        h += "<p class=\"fr-text--sm\">Règles proposées par l'outil (les propriétaires du document gardent tous les droits) :</p><ul class=\"fr-text--sm\">" +
          regles.map(function (r) { return "<li><code>" + esc(r.table + (r.cols === "*" ? "" : "." + r.cols.split(",").join(", ")) ) + "</code> : " + esc(r.effet) + "</li>"; }).join("") + "</ul>";
        var n = aInstaller(acl, meta, regles).length;
        h += n ? "<p class=\"fr-text--sm\">Les règles ne sont ajoutées que là où il n'y en a aucune ; les règles existantes ne sont pas modifiées. Grist recharge ensuite le document. Pour vérifier : <strong>Règles d'accès</strong>, puis <strong>Voir en tant que</strong> un éditeur ou un lecteur.</p>" +
          "<button type=\"button\" class=\"fr-btn fr-btn--sm\" data-donnees=\"regles\">Installer les règles proposées (" + n + ")</button>"
          : "<p><span class=\"fr-badge fr-badge--success fr-badge--sm\">Rien à installer</span></p>";
      }
      if (opt.noteRegles) h += "<p class=\"fr-text--sm\">" + opt.noteRegles + "</p>";
    }
    var liens = opt.liens || [];
    if (liens.length) {
      h += "<h3 class=\"fr-h6\">Liens vers les autres outils</h3><p class=\"fr-text--sm\">Colonnes calculées par Grist, ajoutées à côté du texte saisi, qui est gardé. Une case vide signale un nom qui ne correspond à aucune fiche (orthographe différente, personne absente de l'annuaire). Supprimer une de ces colonnes ne perd aucune donnée.</p><ul class=\"fr-text--sm\">";
      h += liens.map(function (l) {
        var st = opt.demo ? "" : colonne(meta, l.table, l.col) ? " — en place" : !table(meta, l.cible) ? " — table " + l.cible + " absente" : !table(meta, l.table) || !colonne(meta, l.table, l.source) ? " — colonne " + l.table + "." + l.source + " absente" :
          (l.requis || []).filter(function (r) { return !colonne(meta, r[0], r[1]); }).map(function (r) { return " — colonne " + r[0] + "." + r[1] + " absente"; })[0] || " — à ajouter";
        return "<li><code>" + esc(l.table + "." + l.col) + "</code> : " + esc(l.effet) + esc(st) + "</li>";
      }).join("") + "</ul>";
      var nl = opt.demo ? 0 : liensManquants(meta, liens).length;
      if (nl) h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-donnees=\"liens\">Ajouter les colonnes de lien (" + nl + ")</button>";
    }
    return h + "</div>";
  }

  window.DonneesLab = { lire: lire, html: html, installerRegles: installerRegles, ajouterLiens: ajouterLiens,
    aInstaller: aInstaller, liensManquants: liensManquants, lienPersonne: lienPersonne, formulePersonne: formulePersonne };
})();
