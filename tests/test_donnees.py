"""Test de la rubrique Réglages › Données (commun/donnees.js) avec l'API Grist simulée (tests/grist-mock.js) :
règles d'accès posées à l'installation, état des règles, colonnes de lien vers Personnes et Projets.
Lancer un serveur à la racine du dépôt (python3 -m http.server PORT), puis : PORT=… python3 tests/test_donnees.py"""
import os
from playwright.sync_api import sync_playwright
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
ACL = {'_grist_ACLResources': {'colonnes': {'tableId': {'type': 'Text'}, 'colIds': {'type': 'Text'}}, 'lignes': []},
       '_grist_ACLRules': {'colonnes': {c: {'type': 'Any'} for c in ['resource', 'aclFormula', 'permissionsText', 'rulePos', 'memo', 'userAttributes']}, 'lignes': []}}
def ouvrir(b, mock, erreurs):
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    mockjs = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grist-mock.js')).read()
    pg.route('https://docs.getgrist.com/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mockjs))
    pg.goto(f'http://localhost:{os.environ.get("PORT", 8782)}/tests/hote.html')
    pg.evaluate('m => { window.MOCK = m; charger(); }', mock)
    return pg, pg.frame_locator('#w')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    erreurs = []
    tables = dict(ACL, Table1={'colonnes': {'A': {'type': 'Text'}}, 'lignes': []})
    m = {'tables': tables, 'table': 'Table1', 'utilisateur': {'email': 'agent@exemple.fr', 'nom': 'Agent Test'}}
    pg, f = ouvrir(b, m, erreurs)
    f.locator('[data-installer=vide]').click()
    pg.wait_for_timeout(2500)
    doc = pg.evaluate('window.MOCK')['tables']
    regles = doc['_grist_ACLRules']['lignes']
    verifier('installation : règle des points posée', any(r['aclFormula'] == 'user.Access != OWNER' and r['permissionsText'] == '-U' for r in regles))
    verifier('installation : ressource Points.Propose_par,Propose_le créée', any(r['tableId'] == 'Points' and r['colIds'] == 'Propose_par,Propose_le' for r in doc['_grist_ACLResources']['lignes']))
    pg.close()
    # Document avec annuaire et suivi de projets : liens proposés.
    doc['Personnes'] = {'colonnes': {'Nom': {'type': 'Text'}}, 'lignes': [{'id': 1, 'Nom': 'Lou Petit'}]}
    doc['Projets'] = {'colonnes': {'Titre': {'type': 'Text'}}, 'lignes': [{'id': 1, 'Titre': 'Projet A'}]}
    doc['Reunions']['colonnes']['Projet'] = {'type': 'Ref:Projets'}
    pg, f = ouvrir(b, dict(m, tables=doc), erreurs)
    pg.wait_for_timeout(1500)
    f.locator('.cl-barre .cl-onglets label', has_text='Réglages').click()
    f.locator('.cl-barre .cl-sous', has_text='Données').get_by_text('Données').click()
    pg.wait_for_timeout(800)
    x = f.locator('body').inner_text()
    verifier('données : tables partagées listées', 'Tables partagées avec d' in x and 'Actions_reunion' in x)
    verifier('données : état des règles affiché', 'Points' in x and 'Règles d' in x)
    verifier('données : 5 liens à ajouter', f.get_by_role('button', name='Ajouter les colonnes de lien (5)').count() == 1)
    f.get_by_role('button', name='Ajouter les colonnes de lien (5)').click()
    pg.wait_for_timeout(1500)
    d = pg.evaluate('window.MOCK')['tables']
    cols = [('Points', 'Porteur_fiche'), ('Actions_reunion', 'Responsable_fiche'), ('Reunions', 'Animation_fiche'), ('Reunions', 'Secretariat_fiche')]
    verifier('liens : colonnes Personnes calculées', all(d[t]['colonnes'].get(c, {}).get('isFormula') and d[t]['colonnes'][c]['type'] == 'Ref:Personnes' for t, c in cols))
    verifier('liens : texte d\'origine gardé', 'Responsable' in d['Actions_reunion']['colonnes'] and 'Porteur' in d['Points']['colonnes'])
    pj = d['Actions_reunion']['colonnes'].get('Projet', {})
    verifier('liens : Actions_reunion.Projet reprend le projet de la réunion', pj.get('formula') == '$Reunion.Projet' and pj.get('type') == 'Ref:Projets')
    verifier('liens : bouton retiré une fois les colonnes en place', f.get_by_role('button', name='Ajouter les colonnes de lien').count() == 0)
    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'\n{ok} réussis, {ko} échoués')
