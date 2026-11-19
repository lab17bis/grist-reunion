/*
 * En-tête et pied de page DSFR configurables.
 * Module commun aux outils « questionnaire », « catalogue » et « suivi-projet ».
 *
 * PageDSFR.appliquer(page, options)
 *   page : réglages (voir PageDSFR.DEFAUT)
 *   options.entete : élément où placer l'en-tête (remplacé)
 *   options.pied : élément où placer le pied de page (remplacé)
 *   options.accueil : lien du titre du service (par défaut « # »)
 *   options.contexte : { titre } : remplace {titre} et {page} dans les liens des boutons
 *
 * Tous les textes sont insérés comme texte (jamais comme HTML).
 */
(function (global) {
  "use strict";

  var DEFAUT = {
    marque: "République\nfrançaise",
    logo: { src: "", alt: "", hauteur: 3 },
    titre: "",
    sousTitre: "",
    boutons: [],
    pied: {
      texte: "",
      logos: [],
      liens: [],
      mention: "",
      accessibilite: "non conforme"
    }
  };

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) { return; }
      if (k === "class") { n.className = v; }
      else if (k === "text") { n.textContent = v; }
      else if (k === "style") { n.setAttribute("style", v); }
      else { n.setAttribute(k, v === true ? "" : v); }
    });
    (enfants || []).forEach(function (e) {
      if (e === null || e === undefined || e === false) { return; }
      n.appendChild(typeof e === "string" ? document.createTextNode(e) : e);
    });
    return n;
  }

  function lignes(texte) {
    var out = [];
    String(texte || "").split("\n").forEach(function (l, i) {
      if (i) { out.push(el("br")); }
      out.push(document.createTextNode(l));
    });
    return out;
  }

  // Adresse sûre : http(s), mailto, tel, data:image, ancre ou chemin relatif.
  function adresseSure(u) {
    var s = String(u || "").trim();
    if (!s) { return ""; }
    if (/^(https?:|mailto:|tel:)/i.test(s) || /^#/.test(s) || /^\.?\.?\//.test(s)) { return s; }
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) { return s; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { return s; }
    return "";
  }

  function remplacer(lien, contexte) {
    contexte = contexte || {};
    return String(lien || "")
      .replace(/\{titre\}/g, encodeURIComponent(contexte.titre || ""))
      .replace(/\{page\}/g, encodeURIComponent(contexte.page || location.href));
  }

  function fusion(page) {
    page = page || {};
    var p = Object.assign({}, DEFAUT, page);
    p.logo = Object.assign({}, DEFAUT.logo, page.logo || {});
    p.pied = Object.assign({}, DEFAUT.pied, page.pied || {});
    p.boutons = page.boutons || [];
    return p;
  }

  function externe(lien) { return /^https?:/i.test(lien) && lien.indexOf(location.origin) !== 0; }

  function bouton(b, contexte) {
    var lien = adresseSure(remplacer(b.lien, contexte));
    if (!b.libelle || !lien) { return null; }
    var classes = "fr-btn";
    if (b.style === "secondaire") { classes += " fr-btn--secondary"; }
    if (b.style === "tertiaire") { classes += " fr-btn--tertiary-no-outline"; }
    var style = "";
    if (b.couleur && /^#[0-9a-f]{3,8}$/i.test(b.couleur)) {
      style = "background-color:" + b.couleur + ";color:" + (b.couleurTexte || "#fff") + ";--hover-tint:" + b.couleur + ";--active-tint:" + b.couleur;
    }
    var a = el("a", {
      class: classes, href: lien, style: style || null,
      target: externe(lien) ? "_blank" : null, rel: externe(lien) ? "noopener" : null,
      title: externe(lien) ? b.libelle + " - nouvelle fenêtre" : (b.aide || null),
      "data-lien-modele": b.lien
    }, [b.libelle]);
    return el("li", {}, [a]);
  }

  function entete(page, options) {
    var marque = page.marque ? el("div", { class: "fr-header__logo" }, [el("p", { class: "fr-logo" }, lignes(page.marque))]) : null;
    var logoSrc = adresseSure(page.logo.src);
    var operateur = logoSrc ? el("div", { class: "fr-header__operator" }, [
      el("img", {
        class: "fr-responsive-img pd-logo", src: logoSrc, alt: page.logo.alt || page.titre || "",
        style: "height:" + (Number(page.logo.hauteur) || 3) + "rem;width:auto;max-width:none"
      })
    ]) : null;
    var service = (page.titre || page.sousTitre) ? el("div", { class: "fr-header__service" }, [
      el("a", { href: options.accueil || "#", title: "Accueil - " + (page.titre || ""), class: "pd-accueil" }, [
        el("p", { class: "fr-header__service-title", text: page.titre || "" })
      ]),
      page.sousTitre ? el("p", { class: "fr-header__service-tagline", text: page.sousTitre }) : null
    ]) : null;
    var boutons = page.boutons.map(function (b) { return bouton(b, options.contexte); }).filter(Boolean);
    var outils = boutons.length ? el("div", { class: "fr-header__tools" }, [
      el("div", { class: "fr-header__tools-links" }, [el("ul", { class: "fr-btns-group" }, boutons)])
    ]) : null;

    return el("header", { role: "banner", class: "fr-header pd-entete" }, [
      el("div", { class: "fr-header__body" }, [
        el("div", { class: "fr-container" }, [
          el("div", { class: "fr-header__body-row" }, [
            el("div", { class: "fr-header__brand" }, [
              el("div", { class: "fr-header__brand-top" }, [marque, operateur]),
              service
            ]),
            outils
          ])
        ])
      ])
    ]);
  }

  function pied(page) {
    var p = page.pied;
    var logos = (p.logos || []).map(function (l) {
      var src = adresseSure(l.src);
      return src ? el("img", {
        class: "fr-footer__logo pd-logo-pied", src: src, alt: l.alt || "",
        style: "height:" + (Number(l.hauteur) || 5) + "rem;width:auto;max-width:none"
      }) : null;
    }).filter(Boolean);
    var marque = page.marque ? el("p", { class: "fr-logo" }, lignes(page.marque)) : null;
    var liens = (p.liens || []).map(function (l) {
      var lien = adresseSure(l.lien);
      if (!l.libelle || !lien) { return null; }
      return el("li", { class: "fr-footer__bottom-item" }, [
        el("a", {
          class: "fr-footer__bottom-link", href: lien,
          target: externe(lien) ? "_blank" : null, rel: externe(lien) ? "noopener" : null,
          title: externe(lien) ? l.libelle + " - nouvelle fenêtre" : null
        }, [l.libelle])
      ]);
    }).filter(Boolean);
    if (p.accessibilite) {
      liens.push(el("li", { class: "fr-footer__bottom-item" }, [
        el("span", { class: "fr-footer__bottom-link", text: "Accessibilité : " + p.accessibilite })
      ]));
    }
    var aMarque = marque || logos.length;
    var corps = (aMarque || p.texte) ? el("div", { class: "fr-footer__body" + (aMarque ? "" : " pd-pied-sans-marque") }, [
      aMarque ? el("div", { class: "fr-footer__brand pd-pied-marques" }, [marque].concat(logos)) : null,
      p.texte ? el("div", { class: "fr-footer__content" }, [el("p", { class: "fr-footer__content-desc" }, lignes(p.texte))]) : null
    ]) : null;
    var bas = (liens.length || p.mention) ? el("div", { class: "fr-footer__bottom" }, [
      el("ul", { class: "fr-footer__bottom-list" }, liens),
      p.mention ? el("div", { class: "fr-footer__bottom-copy" }, [el("p", {}, lignes(p.mention))]) : null
    ]) : null;
    if (!corps && !bas) { return el("div", { class: "pd-pied", id: "pied" }); }
    return el("footer", { class: "fr-footer pd-pied", role: "contentinfo", id: "pied" }, [
      el("div", { class: "fr-container" }, [corps, bas])
    ]);
  }

  function appliquer(pageBrute, options) {
    options = options || {};
    var page = fusion(pageBrute);
    if (options.entete) {
      var e = entete(page, options);
      options.entete.replaceWith(e);
      options.entete = e;
    }
    if (options.pied) {
      var f = pied(page);
      options.pied.replaceWith(f);
      options.pied = f;
    }
    return options;
  }

  // Met à jour les liens des boutons (ex. : sujet de courriel avec le titre de la fiche).
  function contextualiser(contexte) {
    Array.prototype.forEach.call(document.querySelectorAll(".pd-entete [data-lien-modele]"), function (a) {
      var lien = adresseSure(remplacer(a.getAttribute("data-lien-modele"), contexte));
      if (lien) { a.setAttribute("href", lien); }
    });
  }

  // Lecture d'une image choisie par l'utilisateur (éditeurs) : adresse data:, taille limitée.
  function lireImage(fichier, maxOctets) {
    maxOctets = maxOctets || 200000;
    return new Promise(function (ok, ko) {
      if (!fichier) { return ko(new Error("Aucun fichier")); }
      if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(fichier.type)) { return ko(new Error("Format accepté : PNG, JPEG, GIF, WebP ou SVG.")); }
      if (fichier.size > maxOctets) { return ko(new Error("Image trop lourde (" + Math.round(fichier.size / 1000) + " ko). Maximum : " + Math.round(maxOctets / 1000) + " ko.")); }
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { ko(new Error("Lecture impossible")); };
      r.readAsDataURL(fichier);
    });
  }

  global.PageDSFR = {
    DEFAUT: DEFAUT,
    fusion: fusion,
    appliquer: appliquer,
    contextualiser: contextualiser,
    adresseSure: adresseSure,
    lireImage: lireImage
  };
})(typeof window !== "undefined" ? window : globalThis);
