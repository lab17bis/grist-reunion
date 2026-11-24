/*
 * Page publique dédiée d'un outil : lecture seule, DSFR, sans interface Grist.
 *
 * PagePublique.demarrer({
 *   titre: "Réunions",                      titre par défaut (en-tête)
 *   tableConfig: "Reunions",                table qui porte les réglages de l'outil
 *   colonneConfig: "Config_reunion",        colonne dont la description contient les réglages (JSON)
 *   tables: ["Reunions", "Points", …],      tables à lire (une table absente est lue comme vide)
 *   rendre: function (ctx) { return html }  rendu de l'écran courant
 * })
 *
 * ctx : { donnees, config, route, esc, dateTexte, aujourdhui, lien(chemin), titrePage(texte) }
 *   route : { parties: [...] } tirées de l'adresse (#/a/b/c)
 * Les textes sont toujours échappés avec ctx.esc. Adresse : page.html?doc=<lien Grist public>&integre=1
 * Nécessite grist-public.js, page-dsfr.js et le CSS du DSFR.
 */
(function (global) {
  "use strict";

  function esc(t) {
    return String(t === null || t === undefined ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function dateTexte(sec, long) {
    if (!sec) { return ""; }
    return new Date(sec * 1000).toLocaleDateString("fr-FR", long ? { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" } : { timeZone: "UTC" });
  }
  function aujourdhui() { var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; }

  function demarrer(opt) {
    var GP = global.GristPublic;
    var app = document.getElementById("pp-app");
    var donnees = {}, config = {};

    function erreur(e) {
      app.innerHTML = "<div class=\"fr-alert fr-alert--error\"><p>" + esc((e && e.message) || e) + "</p></div>";
    }
    function entetePied() {
      var page = Object.assign({ marque: "", titre: opt.titre, pied: { accessibilite: "" } }, config.page || {});
      if (!global.PageDSFR) { return; }
      var c = global.PageDSFR.appliquer(page, { entete: document.getElementById("entete"), pied: document.getElementById("pied"), accueil: "#/" });
      if (c.entete) { c.entete.id = "entete"; }
      if (c.pied) { c.pied.id = "pied"; }
      document.title = page.titre || opt.titre;
    }
    function rendre() {
      var parties = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
      var ctx = { donnees: donnees, config: config, route: { parties: parties }, esc: esc, dateTexte: dateTexte, aujourdhui: aujourdhui(), lien: function (c) { return "#/" + c; } };
      try { app.innerHTML = opt.rendre(ctx); } catch (e) { erreur(e); return; }
      if (!GP.integre) { window.scrollTo(0, 0); }
      var h = app.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); }
    }

    if (!GP || !GP.base) { return erreur(new Error("Adresse du document Grist absente ou non reconnue (paramètre doc).")); }
    GP.lireConfig(opt.tableConfig, opt.colonneConfig).catch(function () { return {}; }).then(function (c) {
      config = c || {};
      entetePied();
      return Promise.all(opt.tables.map(function (t) {
        return GP.lireTable(t).then(function (l) { donnees[t] = l; }).catch(function () { donnees[t] = []; });
      }));
    }).then(function () {
      if (!donnees[opt.tables[0]].length && !Object.keys(config).length) {
        return erreur(new Error("Aucune donnée lisible. Le document est-il partagé en lecture publique, et contient-il les tables de l'outil ?"));
      }
      global.addEventListener("hashchange", rendre);
      rendre();
    }).catch(erreur);
  }

  global.PagePublique = { demarrer: demarrer, esc: esc, dateTexte: dateTexte };
})(window);
