"""Test « dans Grist » de grist-reunion (champs supplémentaires), avec une API Grist simulée (tests/grist-mock.js) chargée dans tests/hote.html.
Lancer un serveur à la racine du dépôt (python3 -m http.server PORT), puis : PORT=… python3 tests/test_dans_grist.py"""
import os, json
from playwright.sync_api import sync_playwright
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += cond; ko += (not cond)
def ouvrir(b, mock, erreurs):
    pg = b.new_page(viewport={'width': 1280, 'height': 860})
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    mockjs = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grist-mock.js')).read()
    pg.route('https://docs.getgrist.com/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mockjs))
    pg.goto(f'http://localhost:{os.environ.get("PORT", 8782)}/tests/hote.html')
    pg.evaluate('m => { window.MOCK = m; charger(); }', mock)
    return pg, pg.frame_locator('#w')
mock = lambda pg: pg.evaluate('window.MOCK')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    erreurs = []
    m = {'tables': {'Table1': {'colonnes': {'A': {'type': 'Text'}}, 'lignes': []}}, 'table': 'Table1', 'utilisateur': {'email': 'agent@exemple.fr', 'nom': 'Agent Test'}}
    pg, f = ouvrir(b, m, erreurs)
    f.locator('[data-installer=exemple]').click()
    f.locator('.rn-cartes').first.wait_for()
    doc = mock(pg)['tables']; pg.close()
    verifier('réunion : tables créées', all(t in doc for t in ['Reunions', 'Points', 'Decisions', 'Actions_reunion']))
    doc['Reunions']['colonnes']['Salle'] = {'type': 'Text'}
    cfg = {'champsPerso': [{'id': 'Salle', 'label': 'Salle', 'type': 'court', 'requis': True, 'choix': []}, {'id': 'Fantome', 'label': 'Fantôme', 'type': 'court', 'requis': False, 'choix': []}]}
    doc['Reunions']['colonnes']['Config_reunion'] = {'type': 'Text', 'description': json.dumps(cfg)}
    pg, f = ouvrir(b, dict(m, tables=doc), erreurs)
    f.locator('.rn-cartes').first.wait_for()
    f.locator('a[href="#/nouvelle"]').first.click()
    f.locator('#n-titre').wait_for()
    verifier('champs supplémentaires : champ existant proposé, colonne absente ignorée', f.locator('#n-Salle').count() == 1 and f.locator('#n-Fantome').count() == 0)
    f.locator('#n-titre').fill('Réunion test')
    f.get_by_role('button', name='Créer la réunion').click()
    pg.wait_for_timeout(500)
    verifier('champs supplémentaires : champ obligatoire vide bloque la création', not any(r.get('Titre') == 'Réunion test' for r in mock(pg)['tables']['Reunions']['lignes']))
    f.locator('#n-Salle').fill('Salle 12')
    f.get_by_role('button', name='Créer la réunion').click()
    pg.wait_for_timeout(800)
    cree = [r for r in mock(pg)['tables']['Reunions']['lignes'] if r.get('Titre') == 'Réunion test']
    verifier('champs supplémentaires : valeur enregistrée dans la colonne', len(cree) == 1 and cree[0].get('Salle') == 'Salle 12')
    pg.close()
    # --- Réglages : ajout d'un champ, création de la colonne à l'enregistrement
    pg, f = ouvrir(b, m, erreurs)
    f.locator('[data-installer=exemple]').click(); f.locator('.rn-cartes').first.wait_for()
    f.get_by_role('button', name='Configurer').first.click() if f.get_by_role('button', name='Configurer').count() else f.get_by_text('Configurer').first.click()
    f.get_by_role('tab', name='Réglages').click() if f.get_by_role('tab', name='Réglages').count() else f.get_by_text('Réglages', exact=True).first.click()
    f.locator('#nc-label').wait_for()
    f.locator('#nc-label').fill('Budget estimé'); f.locator('#nc-type').select_option('nombre')
    f.get_by_role('button', name='Ajouter ce champ').click()
    f.get_by_text('colonne Budget_estime').wait_for()
    f.get_by_role('button', name='Enregistrer').first.click()
    pg.wait_for_timeout(800)
    cols = mock(pg)['tables']['Reunions']['colonnes']
    verifier('réglages : la colonne du nouveau champ est créée (type Numeric)', 'Budget_estime' in cols and cols['Budget_estime'].get('type') == 'Numeric')
    pg.close()
    verifier('aucune erreur JavaScript', not erreurs)
    b.close()
print(f'{ok} réussis, {ko} échoués')
raise SystemExit(1 if ko else 0)
