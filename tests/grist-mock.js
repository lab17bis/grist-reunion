/*
 * Simulation minimale de l'API des widgets Grist (grist-plugin-api.js), pour tester le
 * fonctionnement « dans Grist » d'un widget sans serveur Grist. Le document est en mémoire.
 * Configuration : window.parent.MOCK = { tables: { T: { colonnes: { C: { type, isFormula, formula, widgetOptions } }, lignes: [...] } },
 *   table: 'T' (table du widget), mapping: { Nom: 'Nom', ... }, options: {...}, utilisateur: { email, nom } }
 */
(function () {
  var M = window.parent.MOCK;
  var doc = M.tables;
  M.journal = M.journal || [];
  function copie(x) { return JSON.parse(JSON.stringify(x)); }
  function colonnes(t) {
    var res = { id: doc[t].lignes.map(function (l) { return l.id; }) };
    Object.keys(doc[t].colonnes).forEach(function (c) { res[c] = doc[t].lignes.map(function (l) { return l[c] === undefined ? null : l[c]; }); });
    return res;
  }
  function meta() {
    var tables = [], cols = [], n = 0;
    Object.keys(doc).forEach(function (t, i) {
      tables.push({ id: i + 1, tableId: t, summarySourceTable: 0 });
      Object.keys(doc[t].colonnes).forEach(function (c) {
        var d = doc[t].colonnes[c];
        cols.push({ id: ++n, parentId: i + 1, colId: c, type: d.type || 'Text', label: d.label || c, isFormula: !!d.isFormula, formula: d.formula || '', widgetOptions: d.widgetOptions || '', description: d.description || '', visibleCol: 0 });
      });
    });
    function enCol(lignes) { var r = {}; Object.keys(lignes[0] || { id: 0 }).forEach(function (k) { r[k] = lignes.map(function (l) { return l[k]; }); }); return r; }
    return { _grist_Tables: enCol(tables), _grist_Tables_column: enCol(cols) };
  }
  function valeurDeclenchee(d) {
    if (!d || d.isFormula || !d.formula) return undefined;
    if (d.formula === 'user.Email') return M.utilisateur.email;
    if (d.formula === 'user.Name') return M.utilisateur.nom;
    if (d.formula === 'NOW()') return Date.now() / 1000;
    if (/^"/.test(d.formula)) return JSON.parse(d.formula);
    return undefined;
  }
  function ajouter(t, champs) {
    var id = doc[t].lignes.reduce(function (m, l) { return Math.max(m, l.id); }, 0) + 1, l = { id: id };
    Object.keys(doc[t].colonnes).forEach(function (c) { var v = valeurDeclenchee(doc[t].colonnes[c]); if (v !== undefined) l[c] = v; });
    Object.assign(l, champs);
    doc[t].lignes.push(l);
    return id;
  }
  var abonnes = { records: [], record: [], options: [] };
  function notifier() {
    var t = M.table; if (!t || !doc[t]) return;
    var recs = copie(doc[t].lignes);
    abonnes.records.forEach(function (f) { f(recs, M.mappingIds || null); });
  }
  var docApi = {
    fetchTable: function (t) {
      if (t === '_grist_Tables' || t === '_grist_Tables_column') return Promise.resolve(meta()[t]);
      if (!doc[t]) return Promise.reject(new Error('Table not found "' + t + '"'));
      return Promise.resolve(colonnes(t));
    },
    getDocName: function () { return Promise.resolve('doc-test'); },
    getAccessToken: function () { return Promise.resolve({ token: 'jeton', baseUrl: 'https://grist.test/api/docs/doc-test', ttlMsecs: 300000 }); },
    applyUserActions: function (actions) {
      var ret = [];
      try {
        actions.forEach(function (a) {
          M.journal.push(a[0] + ' ' + a[1]);
          var t = a[1];
          switch (a[0]) {
            case 'AddTable':
              if (doc[t]) throw new Error('table existe : ' + t);
              doc[t] = { colonnes: {}, lignes: [] };
              a[2].forEach(function (c) { doc[t].colonnes[c.id] = { type: c.type, isFormula: c.isFormula, formula: c.formula, widgetOptions: c.widgetOptions, label: c.label }; });
              ret.push(null); break;
            case 'AddColumn': doc[t].colonnes[a[2]] = Object.assign({ type: 'Any' }, a[3]); ret.push(null); break;
            case 'ModifyColumn': Object.assign(doc[t].colonnes[a[2]], a[3]); ret.push(null); break;
            case 'SetDisplayFormula': ret.push(null); break;
            case 'AddRecord': ret.push(ajouter(t, a[3] || {})); break;
            case 'BulkAddRecord': ret.push(a[2].map(function (x, i) { var ch = {}; Object.keys(a[3]).forEach(function (k) { ch[k] = a[3][k][i]; }); return ajouter(t, ch); })); break;
            case 'UpdateRecord': { var l = doc[t].lignes.filter(function (x) { return x.id === a[2]; })[0]; if (!l) throw new Error('ligne absente'); Object.assign(l, a[3]); ret.push(null); break; }
            case 'RemoveRecord': doc[t].lignes = doc[t].lignes.filter(function (x) { return x.id !== a[2]; }); ret.push(null); break;
            default: throw new Error('action non simulée : ' + a[0]);
          }
        });
      } catch (e) { return Promise.reject(e); }
      setTimeout(notifier, 0);
      return Promise.resolve({ retValues: ret });
    }
  };
  window.grist = {
    docApi: docApi,
    ready: function (o) { M.ready = o; setTimeout(function () { abonnes.options.forEach(function (f) { f(M.options || null, {}); }); notifier(); }, 10); },
    onRecords: function (f) { abonnes.records.push(f); },
    onRecord: function (f) { abonnes.record.push(f); },
    onOptions: function (f) { abonnes.options.push(f); },
    setOptions: function (o) { M.options = copie(o); return Promise.resolve(); },
    setCursorPos: function (p) { M.curseur = p; return Promise.resolve(); },
    mapColumnNames: function (recs) {
      var m = M.mapping; if (!m) return null;
      return recs.map(function (r) {
        var o = { id: r.id };
        Object.keys(m).forEach(function (k) { o[k] = Array.isArray(m[k]) ? m[k].map(function (c) { return r[c]; }) : r[m[k]]; });
        return o;
      });
    },
    selectedTable: {
      getTableId: function () { return Promise.resolve(M.table); },
      update: function (recs) {
        return docApi.applyUserActions(recs.map(function (r) { return ['UpdateRecord', M.table, r.id, r.fields]; }));
      }
    }
  };
  // Les mappings transmis à onRecords sont des noms de colonnes.
  M.mappingIds = M.mapping;
})();
