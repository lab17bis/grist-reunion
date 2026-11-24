/*
 * Mode public des widgets Grist : page autonome, en lecture seule.
 *
 * Quand l'adresse contient ?public=1&doc=<lien du document Grist>, ce module remplace
 * l'objet `grist` (normalement fourni par Grist) par une version qui lit le document
 * partagé en lecture publique, par l'API REST de Grist. L'outil fonctionne alors tel quel,
 * sans être dans Grist, et aucune écriture n'est possible.
 *
 * Paramètres de l'adresse :
 *   public=1        active le mode
 *   doc=…           lien du document Grist partagé en lecture publique
 *   table=…         table principale (celle du widget)
 *   config=…        réglages du widget et association des colonnes (JSON, base64 sûr pour une adresse)
 *   integre=1       page intégrée dans un autre site : pas d'en-tête ni de pied propres
 *
 * Le module doit être chargé avant le code de l'outil et après le script de Grist.
 * Il pose la classe « gp-public » sur <body> : l'outil et la feuille de style masquent
 * les commandes d'écriture avec la classe « gp-ecriture » ou l'attribut data-ecriture.
 */
(function (global) {
  "use strict";

  var P = new URLSearchParams(global.location.search);
  var aDoc = !!P.get("doc");
  var actif = P.get("public") === "1" && aDoc;

  function decoder(s) {
    try {
      var b = String(s).replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) { b += "="; }
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return null; }
  }
  function encoder(o) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // « https://grist.exemple/o/org/doc/ID » ou « …/api/docs/ID » ou « …/ID » : base de l'API REST.
  function analyserLien(lien) {
    try {
      var u = new URL(String(lien).trim());
      var seg = u.pathname.split("/").filter(Boolean);
      var org = "";
      if (seg[0] === "o") { org = seg[1]; seg = seg.slice(2); }
      var doc = seg[0] === "doc" ? seg[1] : (seg[0] === "api" && seg[1] === "docs" ? seg[2] : seg[0]);
      if (!doc || doc === "api" || doc === "forms") { return null; }
      return { doc: doc, base: u.origin + (org ? "/o/" + org : "") + "/api/docs/" + doc };
    } catch (e) { return null; }
  }

  // Adresse de la page publique : GristPublic.lien(adressePage, { doc, table, options, mappings, integre })
  function lien(adressePage, o) {
    o = o || {};
    var q = new URLSearchParams();
    q.set("public", "1");
    q.set("doc", o.doc || "");
    if (o.table) { q.set("table", o.table); }
    var cfg = {};
    if (o.options && Object.keys(o.options).length) { cfg.options = o.options; }
    if (o.mappings && Object.keys(o.mappings).length) { cfg.mappings = o.mappings; }
    if (Object.keys(cfg).length) { q.set("config", encoder(cfg)); }
    if (o.integre) { q.set("integre", "1"); }
    return String(adressePage).split("?")[0].split("#")[0] + "?" + q.toString();
  }

  if (!aDoc) {
    global.GristPublic = { actif: false, lien: lien, encoder: encoder, decoder: decoder, analyserLien: analyserLien };
    return;
  }

  var cible = analyserLien(P.get("doc"));
  var table = P.get("table") || "";
  var cfg = decoder(P.get("config")) || {};
  var integre = P.get("integre") === "1";
  var specs = [];
  var mappings = null;
  var cacheTables = {};

  function classer() {
    var b = document.body;
    if (!b) { return document.addEventListener("DOMContentLoaded", classer); }
    b.classList.add("gp-public");
    if (integre) { b.classList.add("gp-integre"); }
  }
  if (aDoc) { classer(); }

  function json(r, chemin) {
    if (!r.ok) {
      var m = /\/tables\/([^\/]+)\//.exec(chemin || "");
      var t = m ? decodeURIComponent(m[1]) : "";
      if (r.status === 403) { throw new Error("La table " + (t ? "« " + t + " » " : "") + "n'est pas lisible publiquement : elle est masquée par les règles d'accès du document (erreur 403)."); }
      throw new Error("Lecture impossible (erreur " + r.status + "). Le document est-il partagé en lecture publique ?");
    }
    return r.json();
  }
  function rest(chemin) { return fetch(cible.base + chemin).then(function (r) { return json(r, chemin); }); }

  var LISTES = { ChoiceList: 1, RefList: 1, Attachments: 1 };

  // Table au format de docApi.fetchTable : { id: [...], Colonne: [...] }
  function tableEnColonnes(nom) {
    if (cacheTables[nom]) { return cacheTables[nom]; }
    cacheTables[nom] = Promise.all([
      rest("/tables/" + encodeURIComponent(nom) + "/columns"),
      rest("/tables/" + encodeURIComponent(nom) + "/records")
    ]).then(function (res) {
      var types = {};
      res[0].columns.forEach(function (c) { types[c.id] = c.fields.type; });
      var t = { id: [] };
      res[0].columns.forEach(function (c) { t[c.id] = []; });
      res[1].records.forEach(function (r) {
        t.id.push(r.id);
        res[0].columns.forEach(function (c) {
          var v = r.fields[c.id];
          if (v === undefined) { v = null; }
          var ty = String(types[c.id] || "").split(":")[0];
          if (Array.isArray(v) && LISTES[ty] && v[0] !== "L") { v = ["L"].concat(v); }
          t[c.id].push(v);
        });
      });
      return t;
    });
    return cacheTables[nom];
  }

  // Métadonnées simulées : _grist_Tables et _grist_Tables_column.
  function metaTables() {
    return rest("/tables").then(function (r) {
      var t = { id: [], tableId: [] };
      r.tables.forEach(function (x) {
        t.id.push(x.fields && x.fields.tableRef ? x.fields.tableRef : t.id.length + 1);
        t.tableId.push(x.id);
      });
      return t;
    });
  }
  function metaColonnes() {
    return metaTables().then(function (mt) {
      // Une table refusée par les règles d'accès du document est ignorée : les autres restent lisibles.
      return Promise.all(mt.tableId.map(function (n) { return rest("/tables/" + encodeURIComponent(n) + "/columns").catch(function () { return { columns: [] }; }); })).then(function (res) {
        var t = { id: [], parentId: [], colId: [], label: [], type: [], description: [], widgetOptions: [], isFormula: [] };
        res.forEach(function (r, i) {
          r.columns.forEach(function (c) {
            var f = c.fields || {};
            t.id.push(f.colRef || t.id.length + 1);
            t.parentId.push(f.parentId || mt.id[i]);
            t.colId.push(c.id);
            t.label.push(f.label || c.id);
            t.type.push(f.type || "Any");
            t.description.push(f.description || "");
            t.widgetOptions.push(f.widgetOptions || "");
            t.isFormula.push(!!f.isFormula);
          });
        });
        return t;
      });
    });
  }

  function refuser() { return Promise.reject(new Error("Page publique : lecture seule.")); }

  function associer(colonnes) {
    // Association des colonnes du widget : réglage explicite, sinon colonne de même nom.
    var m = {}, explicite = cfg.mappings || {};
    specs.forEach(function (s) {
      var nom = typeof s === "string" ? s : s.name;
      var multiple = typeof s === "object" && s.allowMultiple;
      var v = explicite[nom];
      if (v === undefined) { v = colonnes.indexOf(nom) >= 0 ? nom : null; }
      if (multiple && v !== null && !Array.isArray(v)) { v = [v]; }
      m[nom] = v === undefined ? null : v;
    });
    return m;
  }

  function lignes(t) {
    return (t.id || []).map(function (_, i) {
      var o = { id: t.id[i] };
      Object.keys(t).forEach(function (k) { if (k !== "id") { o[k] = t[k][i]; } });
      return o;
    });
  }

  var rappelsOptions = [];
  var grist = {
    ready: function (opts) {
      specs = (opts && opts.columns) || [];
      setTimeout(function () { rappelsOptions.forEach(function (cb) { cb(cfg.options || {}, {}); }); }, 0);
    },
    onOptions: function (cb) { rappelsOptions.push(cb); },
    onRecords: function (cb) {
      if (!table) { return; }
      tableEnColonnes(table).then(function (t) {
        var cols = Object.keys(t).filter(function (k) { return k !== "id"; });
        mappings = associer(cols);
        cb(lignes(t), mappings);
      }).catch(function (e) { global.console.error(e); afficherErreur(e); });
    },
    onRecord: function () {},
    mapColumnNames: function (records) {
      var m = mappings;
      if (!m) { return null; }
      var obligatoires = specs.filter(function (s) { return typeof s === "string" || !s.optional; });
      var manque = obligatoires.some(function (s) { var n = typeof s === "string" ? s : s.name; return m[n] === null || m[n] === undefined; });
      if (manque) { return null; }
      return records.map(function (r) {
        var o = { id: r.id };
        Object.keys(m).forEach(function (nom) {
          var c = m[nom];
          if (c === null || c === undefined) { return; }
          o[nom] = Array.isArray(c) ? c.map(function (x) { return r[x]; }) : r[c];
        });
        return o;
      });
    },
    setOptions: function () { return Promise.resolve(); },
    setOption: function () { return Promise.resolve(); },
    getOption: function () { return Promise.resolve(null); },
    setCursorPos: function () {},
    setSelectedRows: function () {},
    on: function () {},
    selectedTable: {
      getTableId: function () { return Promise.resolve(table); },
      update: refuser, create: refuser, destroy: refuser
    },
    docApi: {
      fetchTable: function (nom) {
        if (nom === "_grist_Tables") { return metaTables(); }
        if (nom === "_grist_Tables_column") { return metaColonnes(); }
        return tableEnColonnes(nom);
      },
      applyUserActions: refuser,
      getAccessToken: function () { return Promise.resolve({ token: "", baseUrl: cible.base, ttlMsecs: 300000 }); },
      getDocName: function () { return Promise.resolve(P.get("titre") || cible.doc); }
    }
  };

  function afficherErreur(e) {
    var n = document.createElement("div");
    n.className = "fr-alert fr-alert--error fr-m-2w";
    var p = document.createElement("p");
    p.textContent = (e && e.message) || String(e);
    n.appendChild(p);
    (document.querySelector("main") || document.body).prepend(n);
  }

  if (!cible) { document.addEventListener("DOMContentLoaded", function () { afficherErreur(new Error("Adresse du document Grist non reconnue.")); }); }

  if (actif) { global.grist = grist; }
  global.GristPublic = {
    actif: actif, table: table, integre: integre, config: cfg, base: cible && cible.base, params: P,
    // Pages publiques dédiées : lecture directe des tables et des réglages enregistrés dans le document.
    lireTable: function (nom) { return tableEnColonnes(nom).then(lignes); },
    lireConfig: function (nomTable, nomColonne) {
      return rest("/tables/" + encodeURIComponent(nomTable) + "/columns").then(function (r) {
        var c = r.columns.filter(function (x) { return x.id === nomColonne; })[0];
        try { return c && c.fields.description ? JSON.parse(c.fields.description) : {}; } catch (e) { return {}; }
      });
    },
    lien: lien, encoder: encoder, decoder: decoder, analyserLien: analyserLien
  };
})(window);
