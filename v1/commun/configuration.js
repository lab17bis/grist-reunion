/*
 * Page de configuration commune aux widgets Grist du Lab 17 bis.
 * Un seul écran : réglages propres à l'outil, en-tête et pied de page, aperçu, publication.
 *
 * ConfigLab.monter(conteneur, options)
 *   options.nom           : nom de l'outil (titre de la barre)
 *   options.page          : objet « page » (en-tête et pied) modifié sur place
 *   options.onglets       : [{ id, libelle, rendre(zone) }] réglages propres à l'outil, affichés en premier
 *   options.apercu        : facultatif, function (zone, page) : montre un échantillon de l'outil sous l'en-tête
 *   options.publication   : { mode: "connecte" | "public", lien, adresseWidget, texte }
 *   options.surEnregistrer: function () : à appeler quand la personne clique sur Enregistrer
 *   options.surAnnuler    : facultatif
 *   options.libelleAnnuler: facultatif, texte du bouton secondaire (« Annuler » par défaut, par exemple « Fermer »)
 *   options.modifieInitial: facultatif, vrai pour ouvrir avec le badge « Modifications non enregistrées »
 *   options.ongletInitial : facultatif, identifiant de l'onglet à ouvrir (utile quand l'écran est redessiné)
 * Renvoie { modifie(oui), message(type, texte), enregistre(oui), onglet(id) }.
 *
 * Les panneaux restent dans la page (ils sont seulement masqués) : les champs des onglets propres
 * à l'outil gardent leurs valeurs quand on change d'onglet.
 */
(function (global) {
  "use strict";

  var compteur = 0;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function copier(texte, bouton) {
    var fin = function () { if (bouton) { var t = bouton.textContent; bouton.textContent = "Copié"; setTimeout(function () { bouton.textContent = t; }, 1500); } };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texte).then(fin, fin); return; }
    var a = document.createElement("textarea"); a.value = texte; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); } catch (e) { /* sans effet */ }
    document.body.removeChild(a); fin();
  }

  function publicationHtml(pub, id) {
    pub = pub || { mode: "connecte" };
    var adresse = pub.adresseWidget || "";
    var h = "<div class=\"cl-panneau\">";
    if (pub.mode === "public" && pub.lien) {
      h += "<h2 class=\"fr-h5\">Page publique</h2>" +
        "<p class=\"fr-text--sm\">Cet outil peut être consulté sans compte Grist, par un lien. Le lien donne accès aux données que le document laisse lire publiquement.</p>" +
        "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-lien\">Lien à diffuser</label><input class=\"fr-input cl-code\" id=\"" + id + "-lien\" readonly value=\"" + esc(pub.lien) + "\"></div>" +
        "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-cl-copier=\"" + id + "-lien\">Copier le lien</button></li>" +
        "<li><a class=\"fr-btn fr-btn--tertiary\" href=\"" + esc(pub.lien) + "\" target=\"_blank\" rel=\"noopener\" title=\"Ouvrir la page publique - nouvelle fenêtre\">Ouvrir la page</a></li></ul>";
    } else {
      h += "<div class=\"fr-callout fr-mb-3w\"><h2 class=\"fr-callout__title\">Réservé aux personnes connectées</h2>" +
        "<p class=\"fr-callout__text\">Cet outil manipule des données internes au document. Il n'a pas de page publique : seules les personnes invitées dans le document Grist, avec leur rôle, peuvent l'utiliser.</p></div>";
    }
    h += "<h2 class=\"fr-h5\">Qui peut utiliser l'outil ?</h2><ol class=\"fr-text--sm\">" +
      "<li>Dans Grist, cliquez sur <strong>Partager</strong> puis <strong>Gérer les utilisateurs</strong>.</li>" +
      "<li>Invitez les personnes : <strong>Éditeur</strong> pour celles qui saisissent, <strong>Lecteur</strong> pour celles qui consultent.</li>" +
      (pub.texte ? "<li>" + pub.texte + "</li>" : "") +
      "<li>Si le document contient des données personnelles, vérifiez les <strong>Permissions avancées</strong> avant d'inviter.</li></ol>";
    if (adresse) {
      h += "<h2 class=\"fr-h5\">Adresse du widget</h2><p class=\"fr-text--sm\">À coller dans la vue Personnalisée d'un autre document pour y brancher l'outil.</p>" +
        "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-adr\">URL du widget</label><input class=\"fr-input cl-code\" id=\"" + id + "-adr\" readonly value=\"" + esc(adresse) + "\"></div>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-cl-copier=\"" + id + "-adr\">Copier l'adresse</button>";
    }
    return h + "</div>";
  }

  function monter(conteneur, opt) {
    var id = "cl" + (++compteur);
    var onglets = (opt.onglets || []).map(function (o) { return { id: o.id, libelle: o.libelle, propre: o }; })
      .concat([{ id: "page", libelle: "En-tête et pied" }, { id: "apercu", libelle: "Aperçu" }, { id: "publication", libelle: "Publication" }]);
    var actif = onglets[0].id;
    if (opt.ongletInitial && onglets.some(function (o) { return o.id === opt.ongletInitial; })) { actif = opt.ongletInitial; }

    conteneur.classList.add("cl-config");
    conteneur.innerHTML =
      "<div class=\"cl-barre\"><div class=\"cl-titre\"><p class=\"cl-nom\">" + esc(opt.nom || "Configuration") + "</p>" +
      "<p class=\"fr-badge fr-badge--sm fr-badge--success\" id=\"" + id + "-etat\">Enregistré</p></div>" +
      "<fieldset class=\"fr-segmented fr-segmented--sm\"><legend class=\"fr-segmented__legend fr-sr-only\">Rubrique de la configuration</legend><div class=\"fr-segmented__elements\">" +
      onglets.map(function (o, i) {
        return "<div class=\"fr-segmented__element\"><input value=\"" + o.id + "\" type=\"radio\" id=\"" + id + "-o" + i + "\" name=\"" + id + "-onglet\"" + (o.id === actif ? " checked" : "") + "><label class=\"fr-label\" for=\"" + id + "-o" + i + "\">" + esc(o.libelle) + "</label></div>";
      }).join("") + "</div></fieldset>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm cl-actions\">" +
      (opt.surAnnuler ? "<li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-cl-annuler>" + esc(opt.libelleAnnuler || "Annuler") + "</button></li>" : "") +
      "<li><button type=\"button\" class=\"fr-btn\" data-cl-enregistrer>Enregistrer</button></li></ul></div>" +
      "<div class=\"cl-message\" id=\"" + id + "-message\" aria-live=\"polite\"></div>" +
      onglets.map(function (o) { return "<section class=\"cl-section\" id=\"" + id + "-p-" + o.id + "\" data-cl-section=\"" + o.id + "\"" + (o.id === actif ? "" : " hidden") + "></section>"; }).join("");

    function zone(i) { return document.getElementById(id + "-p-" + i); }
    var etat = document.getElementById(id + "-etat");

    (opt.onglets || []).forEach(function (o) { o.rendre(zone(o.id)); });
    var zonePage = zone("page");
    zonePage.innerHTML = "<div class=\"cl-panneau\"></div>";
    if (global.PageEditeur) { global.PageEditeur.monter(zonePage.firstChild, opt.page, function () { modifie(true); }); }
    zone("publication").innerHTML = publicationHtml(opt.publication, id);

    function rendreApercu() {
      var z = zone("apercu");
      z.innerHTML = "<div class=\"fr-notice fr-notice--info fr-mb-2w\"><div class=\"fr-notice__body\"><p class=\"fr-notice__title\">Aperçu avec les réglages en cours, même non enregistrés.</p></div></div>" +
        "<div class=\"cl-apercu\"><div data-cl=\"entete\"></div><main class=\"cl-apercu__contenu fr-container fr-py-4w\" data-cl=\"contenu\"></main><div data-cl=\"pied\"></div></div>";
      var r = global.PageDSFR ? global.PageDSFR.appliquer(opt.page, { entete: z.querySelector("[data-cl=entete]"), pied: z.querySelector("[data-cl=pied]"), accueil: "#" }) : null;
      if (r) { [r.entete, r.pied].forEach(function (n) { if (n) { n.removeAttribute("id"); Array.prototype.forEach.call(n.querySelectorAll("[id]"), function (x) { x.removeAttribute("id"); }); Array.prototype.forEach.call(n.querySelectorAll("a[href]"), function (a) { a.setAttribute("tabindex", "-1"); a.addEventListener("click", function (e) { e.preventDefault(); }); }); } }); }
      var c = z.querySelector("[data-cl=contenu]");
      if (opt.apercu) { try { opt.apercu(c, opt.page); } catch (e) { c.innerHTML = "<p class=\"fr-text--sm\">Aperçu indisponible.</p>"; } }
      else { c.innerHTML = "<p class=\"fr-text--sm\">Les écrans de l'outil s'affichent entre cet en-tête et ce pied de page.</p>"; }
    }

    function afficher(i) {
      actif = i;
      onglets.forEach(function (o, k) { zone(o.id).hidden = o.id !== i; var r = document.getElementById(id + "-o" + k); if (r) { r.checked = o.id === i; } });
      if (i === "apercu") { rendreApercu(); }
    }

    var modif = false;
    function modifie(oui) {
      modif = !!oui;
      etat.textContent = oui ? "Modifications non enregistrées" : "Enregistré";
      etat.className = "fr-badge fr-badge--sm " + (oui ? "fr-badge--warning" : "fr-badge--success");
    }

    function message(type, texte) {
      var m = document.getElementById(id + "-message");
      m.innerHTML = texte ? "<div class=\"fr-alert fr-alert--sm fr-alert--" + type + "\" role=\"" + (type === "error" ? "alert" : "status") + "\"><p>" + esc(texte) + "</p></div>" : "";
      if (type === "success") { setTimeout(function () { if (m.textContent.indexOf(texte) >= 0) { m.innerHTML = ""; } }, 4000); }
    }

    conteneur.addEventListener("change", function (ev) {
      if (ev.target.name === id + "-onglet") { afficher(ev.target.value); return; }
      if (ev.target.closest && ev.target.closest("[data-cl-section]") && ev.target.closest("[data-cl-section]").getAttribute("data-cl-section") !== "page") { modifie(true); }
    });
    conteneur.addEventListener("input", function (ev) {
      var s = ev.target.closest && ev.target.closest("[data-cl-section]");
      if (s && s.getAttribute("data-cl-section") !== "page" && s.getAttribute("data-cl-section") !== "publication") { modifie(true); }
    });
    conteneur.addEventListener("click", function (ev) {
      var c = ev.target.closest("[data-cl-copier]");
      if (c) { var champ = document.getElementById(c.getAttribute("data-cl-copier")); if (champ) { copier(champ.value, c); } return; }
      if (ev.target.closest("[data-cl-enregistrer]")) { opt.surEnregistrer(); return; }
      if (ev.target.closest("[data-cl-annuler]") && opt.surAnnuler) { opt.surAnnuler(); }
    });

    if (opt.modifieInitial) { modifie(true); }
    if (actif === "apercu") { rendreApercu(); }

    return {
      modifie: modifie,
      enregistre: function () { modifie(false); },
      message: message,
      onglet: afficher,
      ongletActif: function () { return actif; },
      estModifie: function () { return modif; }
    };
  }

  global.ConfigLab = { monter: monter };
})(typeof window !== "undefined" ? window : globalThis);
