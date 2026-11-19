/*
 * Formulaire de réglage de l'en-tête et du pied de page (éditeurs Grist).
 * Module commun aux outils « questionnaire », « catalogue » et « suivi-projet ».
 *
 * PageEditeur.monter(conteneur, page, surChangement)
 *   page : objet modifié sur place (voir PageDSFR.DEFAUT)
 *   surChangement(page) : appelé après chaque modification
 */
(function (global) {
  "use strict";

  var P = global.PageDSFR;
  var compteur = 0;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function champ(id, libelle, valeur, opts) {
    opts = opts || {};
    var aide = opts.aide ? "<span class=\"fr-hint-text\">" + esc(opts.aide) + "</span>" : "";
    var ctrl = opts.multiligne ?
      "<textarea class=\"fr-input\" id=\"" + id + "\" rows=\"" + (opts.lignes || 2) + "\" data-pe=\"" + opts.chemin + "\">" + esc(valeur) + "</textarea>" :
      "<input class=\"fr-input\" type=\"" + (opts.type || "text") + "\" id=\"" + id + "\" data-pe=\"" + opts.chemin + "\" value=\"" + esc(valeur) + "\">";
    return "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "\">" + esc(libelle) + aide + "</label>" + ctrl + "</div>";
  }

  function choix(id, libelle, valeur, options, chemin) {
    return "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"" + id + "\">" + esc(libelle) + "</label>" +
      "<select class=\"fr-select\" id=\"" + id + "\" data-pe=\"" + chemin + "\">" +
      options.map(function (o) {
        return "<option value=\"" + esc(o[0]) + "\"" + (String(o[0]) === String(valeur) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select></div>";
  }

  function image(id, libelle, img, chemin, aide) {
    var apercu = img.src ? "<img src=\"" + esc(P.adresseSure(img.src)) + "\" alt=\"\" class=\"pe-apercu\">" : "<p class=\"fr-text--sm pe-vide\">Aucune image</p>";
    return "<fieldset class=\"fr-fieldset pe-image\"><legend class=\"fr-fieldset__legend fr-fieldset__legend--regular\">" + esc(libelle) +
      (aide ? "<span class=\"fr-hint-text\">" + esc(aide) + "</span>" : "") + "</legend>" +
      "<div class=\"fr-fieldset__element\">" + apercu + "</div>" +
      "<div class=\"fr-fieldset__element\"><div class=\"fr-upload-group\"><label class=\"fr-label\" for=\"" + id + "-f\">Choisir une image" +
      "<span class=\"fr-hint-text\">PNG, JPEG, SVG ou WebP, 200 ko maximum. L'image est enregistrée avec les réglages.</span></label>" +
      "<input class=\"fr-upload\" type=\"file\" accept=\"image/png,image/jpeg,image/svg+xml,image/webp,image/gif\" id=\"" + id + "-f\" data-pe-image=\"" + chemin + "\"></div></div>" +
      "<div class=\"fr-fieldset__element\">" + champ(id + "-u", "Ou adresse web de l'image (https://…)", /^data:/.test(img.src || "") ? "" : (img.src || ""), { chemin: chemin + ".src", type: "url" }) + "</div>" +
      "<div class=\"fr-fieldset__element\">" + champ(id + "-a", "Texte alternatif", img.alt || "", { chemin: chemin + ".alt", aide: "Reprend le texte visible dans l'image (obligatoire pour l'accessibilité)." }) + "</div>" +
      "<div class=\"fr-fieldset__element\">" + choix(id + "-h", "Hauteur", img.hauteur || "", [["2", "Petite"], ["3", "Moyenne"], ["4", "Grande"], ["5", "Très grande"], ["7", "Maximale"]], chemin + ".hauteur") + "</div>" +
      (img.src ? "<div class=\"fr-fieldset__element\"><button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary\" data-pe-action=\"retirer-image\" data-pe-chemin=\"" + chemin + "\">Retirer l'image</button></div>" : "") +
      "</fieldset>";
  }

  function obtenir(objet, chemin) {
    return chemin.split(".").reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, objet);
  }

  function definir(objet, chemin, valeur) {
    var parties = chemin.split(".");
    var o = objet;
    for (var i = 0; i < parties.length - 1; i++) {
      if (o[parties[i]] === undefined || o[parties[i]] === null) { o[parties[i]] = /^\d+$/.test(parties[i + 1]) ? [] : {}; }
      o = o[parties[i]];
    }
    o[parties[parties.length - 1]] = valeur;
  }

  function monter(conteneur, page, surChangement) {
    var id = "pe" + (++compteur);
    page.logo = page.logo || {};
    page.boutons = page.boutons || [];
    page.pied = page.pied || {};
    page.pied.logos = page.pied.logos || [];
    page.pied.liens = page.pied.liens || [];
    if (page.pied.accessibilite === undefined) { page.pied.accessibilite = "non conforme"; }
    if (page.marque === undefined) { page.marque = P.DEFAUT.marque; }

    function rendre() {
      var h = "";
      h += "<h3 class=\"fr-h6\">En-tête</h3>";
      h += champ(id + "-marque", "Bloc-marque", page.marque || "", {
        chemin: "marque", multiligne: true,
        aide: "Une ligne par ligne, par exemple « Ministère » puis « de l’Exemple ». Laissez vide pour ne pas afficher de bloc-marque."
      });
      h += image(id + "-logo", "Logo (à côté du bloc-marque)", page.logo, "logo");
      h += champ(id + "-titre", "Titre du site ou du service", page.titre || "", { chemin: "titre" });
      h += champ(id + "-st", "Sous-titre", page.sousTitre || "", { chemin: "sousTitre" });

      h += "<h3 class=\"fr-h6 pe-section\">Boutons de l'en-tête</h3>";
      h += "<p class=\"fr-text--sm\">Dans un lien, <code>{titre}</code> est remplacé par le titre de la page ou de la fiche affichée. Exemple : <code>mailto:contact@exemple.fr?subject={titre}</code></p>";
      page.boutons.forEach(function (b, i) {
        h += "<div class=\"pe-ligne\"><p class=\"fr-text--bold fr-mb-1w\">Bouton " + (i + 1) + "</p>" +
          champ(id + "-b" + i + "l", "Libellé", b.libelle || "", { chemin: "boutons." + i + ".libelle" }) +
          champ(id + "-b" + i + "u", "Lien", b.lien || "", { chemin: "boutons." + i + ".lien", aide: "https://…, mailto:… ou tel:…" }) +
          choix(id + "-b" + i + "s", "Style", b.style || "principal", [["principal", "Principal (plein)"], ["secondaire", "Secondaire (contour)"], ["tertiaire", "Discret (texte)"]], "boutons." + i + ".style") +
          "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "-b" + i + "c\">Couleur de fond (facultatif)<span class=\"fr-hint-text\">Uniquement pour le style principal. Vérifiez le contraste avec le texte blanc.</span></label>" +
          "<div class=\"pe-couleur\"><input type=\"color\" id=\"" + id + "-b" + i + "c\" data-pe=\"boutons." + i + ".couleur\" value=\"" + esc(b.couleur || "#000091") + "\">" +
          (b.couleur ? "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline\" data-pe-action=\"sans-couleur\" data-pe-index=\"" + i + "\">Couleur par défaut</button>" : "") + "</div></div>" +
          "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" +
          "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-pe-action=\"monter\" data-pe-liste=\"boutons\" data-pe-index=\"" + i + "\">Monter</button></li>" +
          "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-pe-action=\"supprimer\" data-pe-liste=\"boutons\" data-pe-index=\"" + i + "\">Supprimer</button></li></ul></div>";
      });
      h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-pe-action=\"ajouter\" data-pe-liste=\"boutons\">Ajouter un bouton</button>";

      h += "<h3 class=\"fr-h6 pe-section\">Pied de page</h3>";
      h += champ(id + "-pt", "Texte de présentation", page.pied.texte || "", { chemin: "pied.texte", multiligne: true, lignes: 3 });
      page.pied.logos.forEach(function (l, i) {
        h += "<div class=\"pe-ligne\">" + image(id + "-pl" + i, "Logo " + (i + 1) + " du pied de page", l, "pied.logos." + i) +
          "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary\" data-pe-action=\"supprimer\" data-pe-liste=\"pied.logos\" data-pe-index=\"" + i + "\">Supprimer ce logo</button></div>";
      });
      h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-pe-action=\"ajouter\" data-pe-liste=\"pied.logos\">Ajouter un logo au pied de page</button>";
      page.pied.liens.forEach(function (l, i) {
        h += "<div class=\"pe-ligne\"><p class=\"fr-text--bold fr-mb-1w\">Lien " + (i + 1) + " du bas de page</p>" +
          champ(id + "-pk" + i + "l", "Libellé", l.libelle || "", { chemin: "pied.liens." + i + ".libelle" }) +
          champ(id + "-pk" + i + "u", "Lien", l.lien || "", { chemin: "pied.liens." + i + ".lien" }) +
          "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary\" data-pe-action=\"supprimer\" data-pe-liste=\"pied.liens\" data-pe-index=\"" + i + "\">Supprimer ce lien</button></div>";
      });
      h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-mt-2w\" data-pe-action=\"ajouter\" data-pe-liste=\"pied.liens\">Ajouter un lien en bas de page</button>";
      h += "<div class=\"fr-mt-2w\">" + champ(id + "-pm", "Mention en bas de page", page.pied.mention || "", { chemin: "pied.mention", multiligne: true, aide: "Licence, droits d'auteur…" }) + "</div>";
      h += choix(id + "-pa", "Mention d'accessibilité (obligatoire pour un site public)", page.pied.accessibilite, [
        ["non conforme", "Accessibilité : non conforme"],
        ["partiellement conforme", "Accessibilité : partiellement conforme"],
        ["totalement conforme", "Accessibilité : totalement conforme"],
        ["", "Ne pas afficher"]
      ], "pied.accessibilite");
      conteneur.innerHTML = h;
    }

    function signaler() { if (surChangement) { surChangement(page); } }

    conteneur.addEventListener("input", function (ev) {
      var c = ev.target.getAttribute("data-pe");
      if (!c) { return; }
      definir(page, c, ev.target.value);
      signaler();
    });
    conteneur.addEventListener("change", function (ev) {
      var c = ev.target.getAttribute("data-pe-image");
      if (c) {
        P.lireImage(ev.target.files && ev.target.files[0]).then(function (src) {
          definir(page, c + ".src", src);
          if (!obtenir(page, c + ".hauteur")) { definir(page, c + ".hauteur", c === "logo" ? "3" : "5"); }
          rendre();
          signaler();
        }, function (e) {
          var g = ev.target.closest(".fr-upload-group");
          g.classList.add("fr-upload-group--error");
          var m = g.querySelector(".fr-error-text") || document.createElement("p");
          m.className = "fr-error-text";
          m.textContent = e.message;
          g.appendChild(m);
        });
        return;
      }
      var ch = ev.target.getAttribute("data-pe");
      if (ch) {
        definir(page, ch, ev.target.value);
        if (/\.src$/.test(ch)) { rendre(); }
        signaler();
      }
    });
    conteneur.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-pe-action]");
      if (!b) { return; }
      var action = b.getAttribute("data-pe-action");
      var liste = b.getAttribute("data-pe-liste") ? obtenir(page, b.getAttribute("data-pe-liste")) : null;
      var i = Number(b.getAttribute("data-pe-index"));
      if (action === "ajouter") {
        liste.push(b.getAttribute("data-pe-liste") === "boutons" ? { libelle: "", lien: "", style: "principal" } :
          (b.getAttribute("data-pe-liste") === "pied.logos" ? { src: "", alt: "", hauteur: "5" } : { libelle: "", lien: "" }));
      } else if (action === "supprimer") {
        liste.splice(i, 1);
      } else if (action === "monter" && i > 0) {
        liste.splice(i - 1, 0, liste.splice(i, 1)[0]);
      } else if (action === "sans-couleur") {
        delete page.boutons[i].couleur;
      } else if (action === "retirer-image") {
        definir(page, b.getAttribute("data-pe-chemin") + ".src", "");
      }
      rendre();
      signaler();
    });

    rendre();
  }

  global.PageEditeur = { monter: monter };
})(typeof window !== "undefined" ? window : globalThis);
