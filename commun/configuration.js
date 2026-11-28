/*
 * Page de configuration commune aux widgets Grist du Lab 17 bis.
 * Éditeur du widget : la barre commune (commun/barre.js) avec Réglages, En-tête et pied, Aperçu, Publication.
 * L'outil s'utilise dans l'Aperçu (onglet ouvert par défaut). Chaque vue Grist peut afficher, avec le même lien,
 * l'éditeur ou la page d'usage seule (choix dans l'onglet Publication).
 *
 * ConfigLab.monter(conteneur, options)
 *   options.nom           : nom de l'outil (titre de la barre)
 *   options.page          : objet « page » (en-tête et pied) modifié sur place
 *   options.vue           : facultatif, { libelle, element } : l'outil lui-même. L'élément (la zone principale de l'outil)
 *                           s'affiche dans l'Aperçu, entre l'en-tête et le pied ; en page d'usage, il reste à sa place d'origine.
 *   options.onglets       : [{ id, libelle, rendre(zone) }] réglages propres à l'outil : l'onglet « Réglages », avec des
 *                           sous-onglets s'il y en a plusieurs
 *   options.apercu        : facultatif, function (zone, page) : montre un échantillon de l'outil sous l'en-tête.
 *                           Sans cette fonction, et si options.vue.element existe, l'aperçu est réel : l'outil lui-même
 *                           est déplacé entre l'en-tête et le pied de page, puis remis dans son onglet en quittant l'aperçu.
 *   options.surApercu     : facultatif, function (ouvert) : appelée quand l'outil entre dans l'aperçu réel (true) et quand il
 *                           en sort (false). Sert à appliquer les réglages en cours, non enregistrés, puis à les retirer.
 *   options.publication   : { mode: "connecte" | "public", lien, adresseWidget, texte,
 *                             publier: { lienDoc, champs: [{ libelle, aide, exemple, valeur, type: "texte" | "case" }], construire(lienDoc) -> adresse,
 *                                       surChangement(lienDoc, champs), texte } }
 *   options.surEnregistrer: function () : à appeler quand la personne clique sur Enregistrer
 *   options.surAnnuler    : facultatif
 *   options.libelleAnnuler: facultatif, texte du bouton secondaire (« Annuler » par défaut, par exemple « Fermer »)
 *   options.modifieInitial: facultatif, vrai pour ouvrir avec le badge « Non enregistré »
 *   options.surOnglet     : facultatif, function (id) : appelée à chaque changement d'onglet (utile pour redimensionner une carte ou un graphique)
 *   options.ongletInitial : facultatif, identifiant de l'onglet à ouvrir (« vue » ouvre l'Aperçu)
 * Renvoie { modifie(oui), message(type, texte), enregistre(oui), onglet(id), rafraichir(id), ongletActif(), estModifie() }.
 * rafraichir(id) redessine un onglet propre à l'outil (par exemple après un enregistrement).
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

  // Publication par lien : saisie du lien du document Grist partagé en lecture publique,
  // puis lien de la page publique construit par l'outil (pub.publier.construire).
  function publierHtml(pb, id) {
    return "<h2 class=\"fr-h5\">Page publique</h2>" +
      "<p class=\"fr-text--sm\">" + (pb.texte || "Cet outil peut être consulté en page complète, sans compte Grist, en lecture seule.") + "</p>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-doc\">Lien du document Grist partagé en lecture publique" +
      "<span class=\"fr-hint-text\">Dans Grist : Partager, puis « Accès public » en lecture seule, puis copiez le lien.</span></label>" +
      "<input class=\"fr-input cl-code\" id=\"" + id + "-doc\" value=\"" + esc(pb.lienDoc || "") + "\" placeholder=\"https://docs.getgrist.com/…\"></div>" +
      (pb.champs || []).map(function (c, i) {
        if (c.type === "case") {
          return "<div class=\"fr-checkbox-group fr-mb-2w\"><input type=\"checkbox\" id=\"" + id + "-ch" + i + "\"" + (c.valeur ? " checked" : "") + "><label class=\"fr-label\" for=\"" + id + "-ch" + i + "\">" + esc(c.libelle) + (c.aide ? "<span class=\"fr-hint-text\">" + esc(c.aide) + "</span>" : "") + "</label></div>";
        }
        return "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-ch" + i + "\">" + esc(c.libelle) + (c.aide ? "<span class=\"fr-hint-text\">" + esc(c.aide) + "</span>" : "") + "</label>" +
          "<input class=\"fr-input cl-code\" id=\"" + id + "-ch" + i + "\" value=\"" + esc(c.valeur || "") + "\"" + (c.exemple ? " placeholder=\"" + esc(c.exemple) + "\"" : "") + "></div>";
      }).join("") +
      "<div id=\"" + id + "-resultat\"></div>";
  }
  function resultatPublier(zone, pb, id) {
    var r = zone.querySelector("#" + id + "-resultat");
    if (!r) { return; }
    var l = pb.lienDoc ? pb.construire(pb.lienDoc) : null;
    if (!l) { r.innerHTML = "<p class=\"fr-text--sm\">Renseignez le lien du document pour obtenir l'adresse de la page publique.</p>"; return; }
    r.innerHTML = "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-lien\">Lien à diffuser</label><input class=\"fr-input cl-code\" id=\"" + id + "-lien\" readonly value=\"" + esc(l) + "\"></div>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-cl-copier=\"" + id + "-lien\">Copier le lien</button></li>" +
      "<li><a class=\"fr-btn fr-btn--tertiary\" href=\"" + esc(l) + "\" target=\"_blank\" rel=\"noopener\" title=\"Ouvrir la page publique - nouvelle fenêtre\">Ouvrir la page</a></li></ul>";
  }
  function brancherPublier(zone, pub, id, modifie) {
    if (!pub || !pub.publier) { return; }
    var champ = zone.querySelector("#" + id + "-doc");
    resultatPublier(zone, pub.publier, id);
    function changement() {
      if (pub.publier.surChangement) { pub.publier.surChangement(pub.publier.lienDoc, pub.publier.champs); }
      resultatPublier(zone, pub.publier, id);
      if (modifie) { modifie(true); }
    }
    if (champ) { champ.addEventListener("input", function () { pub.publier.lienDoc = champ.value.trim(); changement(); }); }
    (pub.publier.champs || []).forEach(function (c, i) {
      var n = zone.querySelector("#" + id + "-ch" + i);
      if (n && c.type === "case") { n.addEventListener("change", function () { c.valeur = n.checked; changement(); }); }
      else if (n) { n.addEventListener("input", function () { c.valeur = n.value.trim(); changement(); }); }
    });
  }

  function publicationHtml(pub, id) {
    pub = pub || { mode: "connecte" };
    var adresse = pub.adresseWidget || "";
    var h = "<div class=\"cl-panneau\">";
    if (pub.publier) {
      h += publierHtml(pub.publier, id);
    } else if (pub.mode === "public" && pub.lien) {
      h += "<h2 class=\"fr-h5\">Page publique</h2>" +
        "<p class=\"fr-text--sm\">Cet outil peut être consulté sans compte Grist, par un lien. Le lien donne accès aux données que le document laisse lire publiquement.</p>" +
        "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-lien\">Lien à diffuser</label><input class=\"fr-input cl-code\" id=\"" + id + "-lien\" readonly value=\"" + esc(pub.lien) + "\"></div>" +
        "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-cl-copier=\"" + id + "-lien\">Copier le lien</button></li>" +
        "<li><a class=\"fr-btn fr-btn--tertiary\" href=\"" + esc(pub.lien) + "\" target=\"_blank\" rel=\"noopener\" title=\"Ouvrir la page publique - nouvelle fenêtre\">Ouvrir la page</a></li></ul>";
    } else {
      h += "<div class=\"fr-callout fr-mb-3w\"><h2 class=\"fr-callout__title\">Réservé aux personnes connectées</h2>" +
        "<p class=\"fr-callout__text\">Cet outil manipule des données internes au document. Il n'a pas de page publique : seules les personnes invitées dans le document Grist, avec leur rôle, peuvent l'utiliser.</p></div>";
    }
    h += "<h2 class=\"fr-h5\">Lien réservé aux personnes invitées</h2>" +
      "<p class=\"fr-text--sm\">Alternative à la page publique : la page s'affiche en plein écran, sans menus Grist, mais <strong>seules les personnes invitées dans le document</strong> peuvent l'ouvrir. Les autres voient une demande de connexion et aucune donnée. Les droits de chaque personne (lecture, édition) restent ceux fixés dans Grist.</p>" +
      "<ol class=\"fr-text--sm\"><li>Dans Grist, cliquez sur <strong>Partager</strong> puis invitez les personnes avec leur courriel (rôle <strong>Lecteur</strong> pour consulter, <strong>Éditeur</strong> pour saisir). Laissez l'accès public désactivé.</li>" +
      "<li>Ouvrez dans Grist la page qui contient l'outil, puis copiez son adresse dans la barre du navigateur.</li>" +
      "<li>Collez-la ci-dessous : le lien réservé se construit tout seul.</li></ol>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-pg\">Adresse de la page Grist<span class=\"fr-hint-text\">Exemple : https://grist.exemple.fr/o/equipe/xxxx/Mon-document/p/3</span></label><input class=\"fr-input\" id=\"" + id + "-pg\" type=\"url\" data-cl-reserve></div>" +
      "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"" + id + "-md\">Ce que les personnes peuvent faire</label><select class=\"fr-select\" id=\"" + id + "-md\" data-cl-reserve><option value=\"singlePage\">Consulter et saisir (selon leur rôle)</option><option value=\"embed\">Consulter seulement</option></select></div>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-res\">Lien à envoyer aux personnes invitées<span class=\"fr-hint-text\">Fonctionne seulement pour elles. Ce n'est pas un verrou : le plein écran masque les menus, il ne remplace pas les invitations.</span></label><input class=\"fr-input cl-code\" id=\"" + id + "-res\" readonly></div>" +
      "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-cl-copier=\"" + id + "-res\">Copier le lien réservé</button>" +
      "<div class=\"fr-callout fr-mt-3w\"><p class=\"fr-callout__text fr-text--sm\"><strong>Page publique ou lien réservé ?</strong> Publique : toute personne qui a le lien voit les données, sans compte. Réservée : il faut être invité et connecté. Pour des données internes ou personnelles, choisissez toujours la version réservée et vérifiez les <strong>Permissions avancées</strong> du document.</p></div>";
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
    var BL = global.BarreLab;
    var propres = (opt.onglets || []).map(function (o) { return o.id; });
    // Onglets de la barre : Réglages (les rubriques propres à l'outil, en sous-onglets s'il y en a plusieurs),
    // En-tête et pied, Aperçu, Publication. L'outil lui-même ne fait plus l'objet d'un onglet : il s'utilise dans l'Aperçu.
    var reglages = (opt.onglets || []).length === 1 ? { id: opt.onglets[0].id, libelle: "Réglages" }
      : { id: "_reglages", libelle: "Réglages", sous: (opt.onglets || []).map(function (o) { return { id: o.id, libelle: o.libelle }; }) };
    var barreOnglets = ((opt.onglets || []).length ? [reglages] : [])
      .concat([{ id: "page", libelle: "En-tête et pied" }, { id: "apercu", libelle: "Aperçu" }, { id: "publication", libelle: "Publication" }]);
    var sections = (opt.vue ? ["vue"] : []).concat(propres).concat(["page", "apercu", "publication"]);
    function normal(i) { return i === "vue" ? "apercu" : (i === "_reglages" ? (propres[0] || "page") : i); }
    var actif = normal(opt.ongletInitial || (opt.vue ? "apercu" : (propres[0] || "page")));
    if (sections.indexOf(actif) < 0) { actif = opt.vue ? "apercu" : sections[0]; }

    // Place d'origine de l'outil : il y retourne en page d'usage.
    var origine = opt.vue && opt.vue.element ? { parent: opt.vue.element.parentNode, suivant: opt.vue.element.nextSibling } : null;

    conteneur.classList.add("cl-config");
    conteneur.innerHTML =
      "<div class=\"cl-message\" id=\"" + id + "-message\" aria-live=\"polite\"></div>" +
      sections.map(function (o) { return "<section class=\"cl-section\" id=\"" + id + "-p-" + o + "\" data-cl-section=\"" + o + "\"" + (o === actif ? "" : " hidden") + "></section>"; }).join("");
    // La barre est le premier élément de l'écran.
    var barre = BL.creer(conteneur, {
      nom: opt.nom, onglets: barreOnglets, actif: actif, annuler: opt.surAnnuler ? (opt.libelleAnnuler || "Annuler") : null,
      surChoix: function (i) { afficher(i); },
      surEnregistrer: function () { opt.surEnregistrer(); },
      surAnnuler: opt.surAnnuler
    });
    if (conteneur.parentNode && conteneur.parentNode === document.body) {
      var evite = document.body.querySelector(":scope > a[href^='#']");
      document.body.insertBefore(conteneur, evite ? evite.nextSibling : document.body.firstChild);
      // Bandeau de démonstration : juste sous la barre.
      var demo = document.body.querySelector(":scope > .fr-notice[id$='-demo']");
      if (demo) { conteneur.insertBefore(demo, barre.element.nextSibling); }
    }

    function zone(i) { return document.getElementById(id + "-p-" + i); }

    if (opt.vue) {
      if (opt.vue.element) { zone("vue").appendChild(opt.vue.element); }
      else if (opt.vue.rendre) { opt.vue.rendre(zone("vue")); }
    }
    (opt.onglets || []).forEach(function (o) { o.rendre(zone(o.id)); });
    var zonePage = zone("page");
    zonePage.innerHTML = "<div class=\"cl-panneau\"></div>";
    if (global.PageEditeur) { global.PageEditeur.monter(zonePage.firstChild, opt.page, function () { modifie(true); }); }
    zone("publication").innerHTML = publicationHtml(opt.publication, id);
    brancherPublier(zone("publication"), opt.publication, id, function (v) { modifie(v); });
    (function () {
      var pg = document.getElementById(id + "-pg"), res = document.getElementById(id + "-res");
      if (!pg || !res) { return; }
      var md = document.getElementById(id + "-md");
      function maj() {
        var v = pg.value.trim(), u;
        if (!v) { res.value = ""; return; }
        try { u = new URL(v); var sg = u.pathname.split("/"), ip = sg.lastIndexOf("p"); if (ip > 1 && /^[A-Za-z0-9]{20,}$/.test(sg[ip - 1])) { res.value = "Cette adresse contient l'identifiant long du document : Grist ignorerait la page. Ouvrez la page dans Grist et copiez l'adresse affichée dans la barre du navigateur (elle contient le nom du document)."; return; } u.search = ""; if (md.value === "embed") { u.searchParams.set("embed", "true"); } else { u.searchParams.set("style", "singlePage"); } res.value = u.href; } catch (e) { res.value = "Adresse non reconnue : collez l'adresse complète de la page Grist."; }
      }
      pg.addEventListener("input", maj); md.addEventListener("change", maj);
    })();

    // Aperçu réel : l'élément de l'outil voyage entre sa section de rangement et l'aperçu (déplacé, jamais copié).
    var reel = !opt.apercu && !!(opt.vue && opt.vue.element);
    var dansApercu = false;
    function restituerVue() {
      if (!dansApercu) { return; }
      dansApercu = false;
      zone("vue").appendChild(opt.vue.element);
      if (opt.surApercu) { try { opt.surApercu(false); } catch (e) { /* sans effet */ } }
    }

    function avisApercu() {
      var a = zone("apercu").querySelector(".cl-avis-apercu");
      if (a) { a.hidden = !modif; }
    }

    function rendreApercu() {
      restituerVue();
      var z = zone("apercu");
      z.innerHTML = "<div class=\"fr-notice fr-notice--info fr-mb-2w cl-avis-apercu\"" + (modif ? "" : " hidden") + "><div class=\"fr-notice__body\"><p class=\"fr-notice__title\">Aperçu avec les réglages en cours, pas encore enregistrés." + (reel ? " L'outil est réellement actif : ce que vous y faites s'applique au document." : "") + "</p></div></div>" +
        "<div class=\"cl-apercu\"><div data-cl=\"entete\"></div><main class=\"cl-apercu__contenu fr-container fr-py-4w\" data-cl=\"contenu\"></main><div data-cl=\"pied\"></div></div>";
      var r = global.PageDSFR ? global.PageDSFR.appliquer(opt.page, { entete: z.querySelector("[data-cl=entete]"), pied: z.querySelector("[data-cl=pied]"), accueil: "#" }) : null;
      if (r) { [r.entete, r.pied].forEach(function (n) { if (n) { n.removeAttribute("id"); Array.prototype.forEach.call(n.querySelectorAll("[id]"), function (x) { x.removeAttribute("id"); }); Array.prototype.forEach.call(n.querySelectorAll("a[href]"), function (a) { a.setAttribute("tabindex", "-1"); a.addEventListener("click", function (e) { e.preventDefault(); }); }); } }); }
      var c = z.querySelector("[data-cl=contenu]");
      if (reel) {
        c.appendChild(opt.vue.element);
        dansApercu = true;
        if (opt.surApercu) { try { opt.surApercu(true); } catch (e) { /* sans effet */ } }
      }
      else if (opt.apercu) { try { opt.apercu(c, opt.page); } catch (e) { c.innerHTML = "<p class=\"fr-text--sm\">Aperçu indisponible.</p>"; } }
      else { c.innerHTML = "<p class=\"fr-text--sm\">Les écrans de l'outil s'affichent entre cet en-tête et ce pied de page.</p>"; }
    }

    // Page d'usage : l'outil retourne à sa place d'origine, sous l'en-tête du widget, sans barre.
    var enPage = false;
    function versPage() {
      restituerVue();
      enPage = true;
      BL.pageUsage(true);
      if (origine && origine.parent) { origine.parent.insertBefore(opt.vue.element, origine.suivant && origine.suivant.parentNode === origine.parent ? origine.suivant : null); }
      BL.lienEditer(function () { versEditeur(propres[0] || "apercu"); });
      if (opt.surOnglet) { try { opt.surOnglet("vue"); } catch (e) { /* sans effet */ } }
    }
    function versEditeur(i) {
      enPage = false;
      BL.pageUsage(false);
      if (origine && opt.vue.element.parentNode !== zone("vue")) { zone("vue").appendChild(opt.vue.element); }
      actif = null;
      afficher(i || "apercu");
      try { global.scrollTo(0, 0); } catch (e) { /* sans effet */ }
    }

    function afficher(i) {
      i = normal(i);
      if (enPage) { if (i === "apercu") { return; } versEditeur(i); return; }
      if (i === actif && i === "apercu" && dansApercu) { return; }
      actif = i;
      barre.choisir(i);
      if (i !== "apercu") { restituerVue(); }
      sections.forEach(function (o) { zone(o).hidden = o !== i; });
      if (i === "apercu") { rendreApercu(); }
      if (i === "publication" && opt.publication && opt.publication.publier) { resultatPublier(zone("publication"), opt.publication.publier, id); }
      if (opt.surOnglet) { try { opt.surOnglet(i); } catch (e) { /* sans effet */ } }
    }

    // Choix de l'affichage de cette vue Grist (éditeur ou page d'usage), en tête de l'onglet Publication.
    var panneauPub = zone("publication").querySelector(".cl-panneau");
    function blocMode(m) {
      var ancien = panneauPub.querySelector(".cl-mode"); if (ancien) { ancien.parentNode.removeChild(ancien); }
      panneauPub.insertAdjacentHTML("afterbegin", BL.modeHtml(id, m));
      BL.brancherMode(panneauPub, id, function (choisi, ok) {
        if (!ok) { message("warning", "Affichage appliqué pour cette fois seulement : Grist n'a pas enregistré le choix (droits insuffisants sur le document ?)."); }
        if (choisi === "page") { versPage(); } else { message("success", "Cette vue Grist affiche l'éditeur du widget. Pour garder ce choix, cliquez sur Enregistrer en haut à droite de la vue Grist."); }
      });
    }
    blocMode("editeur");

    var modif = false;
    function modifie(oui) {
      modif = !!oui;
      barre.etat(oui ? "Non enregistré" : "Enregistré", oui ? "warning" : "success");
      avisApercu();
    }

    function message(type, texte) {
      var m = document.getElementById(id + "-message");
      m.innerHTML = texte ? "<div class=\"fr-alert fr-alert--sm fr-alert--" + type + "\" role=\"" + (type === "error" ? "alert" : "status") + "\"><p>" + esc(texte) + "</p></div>" : "";
      if (type === "success") { setTimeout(function () { if (m.textContent.indexOf(texte) >= 0) { m.innerHTML = ""; } }, 4000); }
    }

    // Les champs d'une zone data-cl-hors-reglages agissent tout de suite (générer des codes, par exemple) :
    // ils ne rendent pas les réglages « non enregistrés ».
    conteneur.addEventListener("change", function (ev) {
      if (ev.target.closest && ev.target.closest("[data-cl-hors-reglages]")) { return; }
      var sec = ev.target.closest && ev.target.closest("[data-cl-section]");
      if (sec && propres.indexOf(sec.getAttribute("data-cl-section")) >= 0) { modifie(true); }
    });
    conteneur.addEventListener("input", function (ev) {
      if (ev.target.closest && ev.target.closest("[data-cl-hors-reglages]")) { return; }
      var s = ev.target.closest && ev.target.closest("[data-cl-section]");
      if (s && propres.indexOf(s.getAttribute("data-cl-section")) >= 0) { modifie(true); }
    });
    conteneur.addEventListener("click", function (ev) {
      var c = ev.target.closest("[data-cl-copier]");
      if (c) { var champ = document.getElementById(c.getAttribute("data-cl-copier")); if (champ) { copier(champ.value, c); } }
    });

    if (opt.modifieInitial) { modifie(true); }
    BL.pageUsage(false);
    var depart = actif; actif = null; afficher(depart);
    // Affichage enregistré pour cette vue Grist : page d'usage si la personne qui gère le document l'a choisi.
    BL.mode().then(function (m) { blocMode(m); if (m === "page" && !opt.modifieInitial) { versPage(); } });

    return {
      modifie: modifie,
      enregistre: function () { modifie(false); },
      message: message,
      onglet: function (i) { if (enPage && normal(i) === "apercu") { return; } afficher(i); },
      rafraichir: function (i) {
        (opt.onglets || []).forEach(function (o) { if (o.id === i) { o.rendre(zone(o.id)); } });
      },
      ongletActif: function () { return enPage ? "vue" : actif; },
      estModifie: function () { return modif; }
    };
  }

  global.ConfigLab = { monter: monter };
})(typeof window !== "undefined" ? window : globalThis);
