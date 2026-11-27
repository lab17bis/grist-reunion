/*
 * Barre commune de l'éditeur des widgets Grist du Lab 17 bis.
 * Fichier partagé : la même copie dans chaque dépôt (commun/barre.js), à modifier ici puis à recopier.
 *
 * Disposition : nom du widget et statut d'enregistrement à gauche, quatre onglets au centre
 * (Réglages, En-tête et pied, Aperçu, Publication), bouton Enregistrer à droite.
 * Les rubriques propres à l'outil sont des sous-onglets de « Réglages », sur une seconde ligne de la barre.
 *
 * Un seul lien par widget, deux affichages au choix pour chaque vue Grist :
 *   - « editeur » : la barre et ses onglets (affichage par défaut, celui des documents déjà installés) ;
 *   - « page »    : la page d'usage seule (en-tête, outil, pied de page), sans barre.
 * Le choix est une option de la vue Grist (grist.setOption), pas un réglage du document :
 * deux vues Personnalisées avec la même adresse peuvent montrer l'une l'éditeur, l'autre la page d'usage.
 *
 * BarreLab.creer(hote, options) -> { element, choisir(id), actif(), etat(texte, type), message(type, texte) }
 *   options.nom          : nom affiché (« Widget réunion »)
 *   options.onglets      : [{ id, libelle, sous: [{ id, libelle }] }] ; un onglet à sous-onglets s'ouvre sur son premier
 *   options.actif        : identifiant de l'onglet (ou du sous-onglet) ouvert au départ
 *   options.idEtat       : facultatif, identifiant de la pastille de statut
 *   options.idEnregistrer: facultatif, identifiant du bouton Enregistrer
 *   options.annuler      : facultatif, texte d'un bouton secondaire placé avant Enregistrer
 *   options.surChoix     : function (id) : appelée avec l'onglet (ou le sous-onglet) choisi
 *   options.surEnregistrer, options.surAnnuler : facultatifs
 * BarreLab.mode()            -> Promise<"editeur" | "page"> : affichage choisi pour cette vue Grist
 * BarreLab.modeEnregistre()  -> "page" | undefined : à recopier dans grist.setOptions(...) par les outils
 *                               qui enregistrent toutes leurs options d'un coup (sinon le choix serait effacé)
 * BarreLab.choisirMode(mode) -> Promise : enregistre l'affichage de cette vue Grist
 * BarreLab.modeHtml(id, mode), BarreLab.brancherMode(zone, id, surChangement(mode)) : bloc de choix pour l'onglet Publication
 * BarreLab.pageUsage(oui) : applique la classe de page d'usage au document (barre masquée)
 * BarreLab.lienEditer(surClic) : lien « Éditer le widget » en bas de la page d'usage
 */
(function (global) {
  "use strict";

  var CLE = "modeLab";
  var compteur = 0;
  var connu; // dernière valeur lue ou écrite dans les options de la vue
  var promesse = null;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function dansGrist() {
    try { return global.parent && global.parent !== global && global.grist && typeof global.grist.getOption === "function"; } catch (e) { return false; }
  }

  function mode() {
    if (promesse) { return promesse; }
    promesse = new Promise(function (ok) {
      if (!dansGrist()) { ok("editeur"); return; }
      var fini = false;
      var t = setTimeout(function () { fini = true; ok("editeur"); }, 2000);
      try {
        global.grist.getOption(CLE).then(function (v) {
          connu = v === "page" ? "page" : undefined;
          if (!fini) { fini = true; clearTimeout(t); ok(connu === "page" ? "page" : "editeur"); }
        }, function () { if (!fini) { fini = true; clearTimeout(t); ok("editeur"); } });
      } catch (e) { fini = true; clearTimeout(t); ok("editeur"); }
    });
    return promesse;
  }

  function choisirMode(m) {
    var v = m === "page" ? "page" : null;
    connu = v || undefined;
    promesse = Promise.resolve(m === "page" ? "page" : "editeur");
    if (!dansGrist() || typeof global.grist.setOption !== "function") { return Promise.reject(new Error("Hors de Grist")); }
    return Promise.resolve(global.grist.setOption(CLE, v));
  }

  function modeHtml(id, m) {
    var page = m === "page";
    return "<div class=\"cl-mode\"><h2 class=\"fr-h5\">Affichage de cette vue Grist</h2>" +
      "<p class=\"fr-text--sm\">Le même lien sert à régler le widget et à l'utiliser. Choisissez ce que montre cette vue Grist. Pour avoir les deux dans un document, ajoutez une seconde vue Personnalisée avec la même adresse.</p>" +
      "<fieldset class=\"fr-fieldset\"><legend class=\"fr-fieldset__legend fr-sr-only\">Affichage de cette vue Grist</legend>" +
      "<div class=\"fr-fieldset__element\"><div class=\"fr-radio-group\"><input type=\"radio\" id=\"" + id + "-mode-e\" name=\"" + id + "-mode\" value=\"editeur\"" + (page ? "" : " checked") + "><label class=\"fr-label\" for=\"" + id + "-mode-e\">Éditeur du widget<span class=\"fr-hint-text\">La barre de réglages en haut ; l'outil s'utilise dans l'onglet Aperçu. Pour la personne qui gère le document.</span></label></div></div>" +
      "<div class=\"fr-fieldset__element\"><div class=\"fr-radio-group\"><input type=\"radio\" id=\"" + id + "-mode-p\" name=\"" + id + "-mode\" value=\"page\"" + (page ? " checked" : "") + "><label class=\"fr-label\" for=\"" + id + "-mode-p\">Page d'usage<span class=\"fr-hint-text\">L'outil avec son en-tête et son pied de page, sans barre de réglages. Pour les personnes qui utilisent l'outil.</span></label></div></div>" +
      "</fieldset>" +
      "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" id=\"" + id + "-mode-ok\">Appliquer à cette vue</button>" +
      "<p class=\"fr-text--xs fr-mt-1w\"><strong>Pour garder ce choix</strong>, cliquez ensuite sur <strong>Enregistrer</strong> en haut à droite de la vue Grist (bouton de Grist, à côté du filtre). Sans cela, la vue revient à son affichage précédent au prochain chargement.</p>" +
      "<p class=\"fr-text--xs fr-mt-1w\">En page d'usage, le lien « Éditer le widget », en bas de page, rouvre l'éditeur. Ce choix ne protège rien : pour empêcher une modification, utilisez les droits du document (Partager, Permissions avancées).</p></div>";
  }

  function brancherMode(zone, id, surChangement) {
    var b = zone.querySelector("#" + id + "-mode-ok");
    if (!b) { return; }
    b.addEventListener("click", function () {
      var r = zone.querySelector("input[name=\"" + id + "-mode\"]:checked");
      var m = r ? r.value : "editeur";
      choisirMode(m).then(function () { if (surChangement) { surChangement(m, true); } }, function () { if (surChangement) { surChangement(m, false); } });
    });
  }

  function pageUsage(oui) {
    document.documentElement.classList.toggle("cl-mode-page", !!oui);
    document.documentElement.classList.toggle("cl-mode-editeur", !oui);
  }

  var lien = null;
  function lienEditer(surClic) {
    if (!lien) {
      lien = document.createElement("p");
      lien.className = "cl-editer";
      lien.innerHTML = "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-settings-5-line fr-btn--icon-left\">Éditer le widget</button>";
      document.body.appendChild(lien);
    }
    lien.firstChild.onclick = surClic;
    return lien;
  }

  function creer(hote, opt) {
    var id = "bl" + (++compteur);
    var onglets = opt.onglets || [];
    function parent(i) {
      for (var k = 0; k < onglets.length; k++) {
        if (onglets[k].id === i) { return onglets[k]; }
        if ((onglets[k].sous || []).some(function (s) { return s.id === i; })) { return onglets[k]; }
      }
      return null;
    }
    function feuille(i) { var p = parent(i); if (!p) { return onglets[0] ? (onglets[0].sous && onglets[0].sous.length ? onglets[0].sous[0].id : onglets[0].id) : null; } return p.id === i && p.sous && p.sous.length ? (p.dernier || p.sous[0].id) : i; }
    var actif = feuille(opt.actif);

    function radios(liste, nom, legende, coche) {
      return "<fieldset class=\"fr-segmented fr-segmented--sm\"><legend class=\"fr-segmented__legend fr-sr-only\">" + esc(legende) + "</legend><div class=\"fr-segmented__elements\">" +
        liste.map(function (o, i) {
          return "<div class=\"fr-segmented__element\"><input value=\"" + esc(o.id) + "\" type=\"radio\" id=\"" + id + "-" + nom + i + "\" name=\"" + id + "-" + nom + "\"" + (o.id === coche ? " checked" : "") + "><label class=\"fr-label\" for=\"" + id + "-" + nom + i + "\">" + esc(o.libelle) + "</label></div>";
        }).join("") + "</div></fieldset>";
    }

    var el = document.createElement("div");
    el.className = "cl-barre";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Éditeur du widget");
    hote.insertBefore(el, hote.firstChild);

    function dessiner() {
      var p = parent(actif);
      el.innerHTML =
        "<div class=\"cl-titre\"><p class=\"cl-nom\">" + esc(opt.nom || "Widget") + "</p>" +
        "<p class=\"fr-badge fr-badge--sm fr-badge--success\" id=\"" + esc(opt.idEtat || id + "-etat") + "\">Enregistré</p></div>" +
        "<div class=\"cl-onglets\">" + radios(onglets, "o", "Rubrique de l'éditeur", p ? p.id : null) + "</div>" +
        "<div class=\"cl-actions\">" +
        (opt.annuler ? "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-cl-annuler>" + esc(opt.annuler) + "</button>" : "") +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-icon-save-line fr-btn--icon-left\" data-cl-enregistrer" + (opt.idEnregistrer ? " id=\"" + esc(opt.idEnregistrer) + "\"" : "") + ">Enregistrer</button></div>" +
        "<div class=\"cl-sous\"" + (p && p.sous && p.sous.length > 1 ? "" : " hidden") + ">" + (p && p.sous && p.sous.length > 1 ? radios(p.sous, "s", p.libelle, actif) : "") + "</div>";
    }
    dessiner();
    var etatEl = function () { return el.querySelector(".cl-titre .fr-badge"); };

    function majRadios() {
      var p = parent(actif);
      Array.prototype.forEach.call(el.querySelectorAll("input[name=\"" + id + "-o\"]"), function (r) { r.checked = !!p && r.value === p.id; });
      var sous = el.querySelector(".cl-sous");
      var avec = p && p.sous && p.sous.length > 1;
      if (avec) {
        if (!sous.querySelector("input[value=\"" + actif + "\"]")) { sous.innerHTML = radios(p.sous, "s", p.libelle, actif); }
        Array.prototype.forEach.call(sous.querySelectorAll("input"), function (r) { r.checked = r.value === actif; });
      }
      sous.hidden = !avec;
    }

    function choisir(i, silencieux) {
      var f = feuille(i);
      if (!f) { return; }
      actif = f;
      var p = parent(f);
      if (p && p.sous && p.sous.length) { p.dernier = f; }
      majRadios();
      if (!silencieux && opt.surChoix) { opt.surChoix(f); }
    }

    el.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.name === id + "-o" || t.name === id + "-s") { choisir(t.value); }
    });
    el.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-cl-enregistrer]")) { if (opt.surEnregistrer) { opt.surEnregistrer(); } return; }
      if (ev.target.closest("[data-cl-annuler]") && opt.surAnnuler) { opt.surAnnuler(); }
    });

    return {
      element: el,
      choisir: function (i) { choisir(i, true); },
      actif: function () { return actif; },
      etat: function (texte, type) {
        var e = etatEl();
        e.textContent = texte;
        e.className = "fr-badge fr-badge--sm fr-badge--" + (type || "success");
      }
    };
  }

  global.BarreLab = {
    creer: creer,
    mode: mode,
    modeEnregistre: function () { return connu; },
    choisirMode: choisirMode,
    modeHtml: modeHtml,
    brancherMode: brancherMode,
    pageUsage: pageUsage,
    lienEditer: lienEditer
  };
})(typeof window !== "undefined" ? window : globalThis);
