/*
 * Page publique des réunions : prochaines réunions, instances, ordre du jour et compte rendu.
 * Lecture seule. Ce qui s'affiche dépend de l'étape de la réunion :
 *   - « En préparation » (première étape) : jamais publié ;
 *   - les étapes suivantes : date, lieu, objectif et ordre du jour ;
 *   - la dernière étape (« Compte rendu diffusé ») : notes, décisions et actions.
 * Les participants et les excusés ne sont affichés que si le réglage publication.participants est actif.
 * Adresse : public.html?doc=<lien du document Grist public>&integre=1
 */
(function () {
  "use strict";
  var DEFAUT_STATUTS = ["En préparation", "Ordre du jour arrêté", "Tenue", "Compte rendu diffusé"];
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : null; };

  PagePublique.demarrer({
    titre: "Réunions",
    tableConfig: "Reunions",
    colonneConfig: "Config_reunion",
    tables: ["Reunions", "Points", "Decisions", "Actions_reunion"],
    rendre: function (c) {
      var esc = c.esc, d = c.donnees, cfg = c.config;
      var statuts = (cfg.listes && cfg.listes.statutsReunion && cfg.listes.statutsReunion.length) ? cfg.listes.statutsReunion : DEFAUT_STATUTS;
      var pub = cfg.publication || {};
      var publiees = d.Reunions.filter(function (r) { return (r.Statut || statuts[0]) !== statuts[0]; });
      var diffuse = function (r) { return r.Statut === statuts[statuts.length - 1]; };
      var parDate = function (a, b) { return (a.Date || 0) - (b.Date || 0) || a.id - b.id; };
      var p = c.route.parties;

      function carte(r) {
        return "<div class=\"fr-col-12 fr-col-md-6\"><div class=\"fr-card fr-enlarge-link\"><div class=\"fr-card__body\"><div class=\"fr-card__content\">" +
          "<h3 class=\"fr-card__title\"><a href=\"#/r/" + r.id + "\">" + esc(r.Titre || "Réunion") + "</a></h3>" +
          "<p class=\"fr-card__desc\">" + esc(r.Objectif || "") + "</p>" +
          "<div class=\"fr-card__start\"><p class=\"fr-card__detail fr-icon-calendar-line\">" + esc(c.dateTexte(r.Date, true)) + (r.Heure ? " à " + esc(r.Heure) : "") + "</p>" +
          (r.Lieu ? "<p class=\"fr-card__detail fr-icon-map-pin-2-line\">" + esc(r.Lieu) + "</p>" : "") +
          (r.Instance ? "<ul class=\"fr-badges-group\"><li><p class=\"fr-badge fr-badge--sm fr-badge--blue-ecume\">" + esc(r.Instance) + "</p></li></ul>" : "") +
          (diffuse(r) ? "<ul class=\"fr-badges-group\"><li><p class=\"fr-badge fr-badge--sm fr-badge--green-emeraude\">Compte rendu disponible</p></li></ul>" : "") + "</div>" +
          "</div></div></div></div>";
      }
      function liste(titre, rs, vide) {
        return "<h2 class=\"fr-h4 fr-mt-4w\">" + esc(titre) + " <span class=\"fr-text--sm\">(" + rs.length + ")</span></h2>" +
          (rs.length ? "<div class=\"fr-grid-row fr-grid-row--gutters\">" + rs.map(carte).join("") + "</div>" : "<p>" + esc(vide) + "</p>");
      }

      // Détail d'une réunion
      if (p[0] === "r" && num(p[1])) {
        var r = publiees.filter(function (x) { return x.id === num(p[1]); })[0];
        if (!r) { return "<p>Cette réunion n'est pas publiée.</p><p><a href=\"#/\">Retour aux réunions</a></p>"; }
        var pts = d.Points.filter(function (x) { return num(x.Reunion) === r.id && (x.Statut || "Proposé") === "Retenu"; })
          .sort(function (a, b) { return (a.Ordre || 0) - (b.Ordre || 0) || a.id - b.id; });
        var h = "<nav role=\"navigation\" class=\"fr-breadcrumb\" aria-label=\"vous êtes ici :\"><ol class=\"fr-breadcrumb__list\"><li><a class=\"fr-breadcrumb__link\" href=\"#/\">Réunions</a></li>" +
          "<li><a class=\"fr-breadcrumb__link\" aria-current=\"page\">" + esc(r.Titre || "Réunion") + "</a></li></ol></nav>" +
          "<h1>" + esc(r.Titre || "Réunion") + "</h1>" +
          "<p>" + esc(c.dateTexte(r.Date, true)) + (r.Heure ? " à " + esc(r.Heure) : "") + (r.Lieu ? " – " + esc(r.Lieu) : "") + (r.Instance ? " · " + esc(r.Instance) : "") + "</p>" +
          (r.Objectif ? "<p><strong>Objectif :</strong> " + esc(r.Objectif) + "</p>" : "");
        if (pub.participants) {
          if (r.Participants) { h += "<p><strong>Participants :</strong> " + esc(String(r.Participants).replace(/\n/g, ", ")) + "</p>"; }
          if (r.Excuses) { h += "<p><strong>Excusés :</strong> " + esc(String(r.Excuses).replace(/\n/g, ", ")) + "</p>"; }
        }
        h += "<h2 class=\"fr-h4 fr-mt-3w\">" + (diffuse(r) ? "Compte rendu" : "Ordre du jour") + "</h2>";
        if (!pts.length) { h += "<p>Aucun point à l'ordre du jour.</p>"; }
        else {
          h += "<ol class=\"fr-mb-3w\">" + pts.map(function (pt) {
            var decs = diffuse(r) ? d.Decisions.filter(function (x) { return num(x.Reunion) === r.id && num(x.Point) === pt.id; }) : [];
            return "<li><strong>" + esc(pt.Titre) + "</strong>" + (pt.Type ? " <span class=\"fr-badge fr-badge--sm\">" + esc(pt.Type) + "</span>" : "") +
              (pt.Porteur || pt.Duree ? "<br><span class=\"fr-text--sm\">" + esc([pt.Porteur, pt.Duree ? pt.Duree + " min" : ""].filter(Boolean).join(" · ")) + "</span>" : "") +
              (pt.Description && !diffuse(r) ? "<p class=\"fr-text--sm fr-mb-1w\">" + esc(pt.Description) + "</p>" : "") +
              (diffuse(r) && pt.Notes ? "<p class=\"fr-mb-1w\">" + esc(pt.Notes).replace(/\n/g, "<br>") + "</p>" : "") +
              decs.map(function (x) { return "<p class=\"fr-mb-1w\"><strong>Décision :</strong> " + esc(x.Texte) + "</p>"; }).join("") + "</li>";
          }).join("") + "</ol>";
        }
        var acts = diffuse(r) ? d.Actions_reunion.filter(function (x) { return num(x.Reunion) === r.id; }) : [];
        if (acts.length) {
          h += "<h2 class=\"fr-h4\">Actions</h2><div class=\"fr-table\"><div class=\"fr-table__wrapper\"><div class=\"fr-table__container\"><div class=\"fr-table__content\"><table><caption class=\"fr-sr-only\">Actions décidées en réunion</caption><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th><th>État</th></tr></thead><tbody>" +
            acts.map(function (a) { return "<tr><td>" + esc(a.Intitule) + "</td><td>" + esc(a.Responsable) + "</td><td>" + esc(c.dateTexte(a.Echeance)) + "</td><td>" + esc(a.Etat || "À faire") + "</td></tr>"; }).join("") +
            "</tbody></table></div></div></div></div>";
        }
        return h + "<p class=\"fr-mt-3w\"><a class=\"fr-link fr-icon-arrow-left-line fr-link--icon-left\" href=\"#/\">Retour aux réunions</a></p>";
      }

      // Accueil, éventuellement filtré sur une instance
      var instance = p[0] === "i" ? decodeURIComponent(p[1] || "") : "";
      var instances = [];
      publiees.forEach(function (x) { if (x.Instance && instances.indexOf(x.Instance) < 0) { instances.push(x.Instance); } });
      var rs = publiees.filter(function (x) { return !instance || x.Instance === instance; });
      var avenir = rs.filter(function (x) { return !x.Date || x.Date >= c.aujourdhui; }).sort(parDate);
      var passees = rs.filter(function (x) { return x.Date && x.Date < c.aujourdhui; }).sort(function (a, b) { return parDate(b, a); });
      var h2 = "<h1>" + esc((cfg.page && cfg.page.titre) || "Réunions") + (instance ? " : " + esc(instance) : "") + "</h1>";
      if (instances.length > 1) {
        h2 += "<ul class=\"fr-tags-group\"><li><a class=\"fr-tag\" href=\"#/\"" + (instance ? "" : " aria-current=\"true\"") + ">Toutes les instances</a></li>" +
          instances.map(function (i) { return "<li><a class=\"fr-tag\" href=\"#/i/" + encodeURIComponent(i) + "\"" + (i === instance ? " aria-current=\"true\"" : "") + ">" + esc(i) + "</a></li>"; }).join("") + "</ul>";
      }
      return h2 + liste("Prochaines réunions", avenir, "Aucune réunion à venir pour le moment.") + liste("Réunions passées", passees, "Aucune réunion passée.");
    }
  });
})();
