"""Table déjà présente aux colonnes différentes : le widget le signale et propose de compléter.
Serveur attendu : la racine du dépôt sur PORT (par défaut 8770). Utilise l'API Grist simulée de test/grist-mock.js."""
import os, sys
from playwright.sync_api import sync_playwright
PORT = os.environ.get('PORT', '8770')
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
MOCK = open(os.environ.get('MOCK', '/home/claude/test/grist-mock.js')).read()
HOTE = '<!DOCTYPE html><html><body style="margin:0"><iframe id="w" style="width:100%;height:100vh;border:0"></iframe><script>window.charger=function(u){document.getElementById("w").src=u;};</script></body></html>'
def ouvrir(b, tables, table):
    pg = b.new_page(viewport={'width': 1280, 'height': 900}); err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.route('**/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    pg.route('https://data.geopf.fr/**', lambda r: r.fulfill(status=204))
    pg.route(f'http://localhost:{PORT}/__hote.html', lambda r: r.fulfill(status=200, content_type='text/html', body=HOTE))
    pg.goto(f'http://localhost:{PORT}/__hote.html')
    pg.evaluate('([m,u]) => { window.MOCK = m; charger(u); }', [{'tables': tables, 'table': table, 'utilisateur': {'email': 'test@exemple.fr', 'nom': 'Test'}}, '/index.html'])
    pg.wait_for_timeout(1500)
    return pg, pg.frame_locator('#w'), err
def texte(f): return f.locator('body').inner_text()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    tabs = {t: {'colonnes': {'X': {'type': 'Text'}}, 'lignes': []} for t in ['Reunions', 'Points', 'Decisions', 'Actions_reunion']}
    pg, f, err = ouvrir(b, tabs, 'Reunions')
    x = texte(f)
    verifier('tables incomplètes : alerte et conseil de renommage', 'Des colonnes attendues manquent' in x and 'Reunions.Titre' in x and 'renommez-la' in x)
    f.get_by_role('button', name='Ajouter les colonnes manquantes').click(); pg.wait_for_timeout(1500)
    d = pg.evaluate('window.MOCK')['tables']
    verifier('colonnes ajoutées, colonne existante gardée', all(c in d['Reunions']['colonnes'] for c in ['Titre', 'Date', 'Statut']) and 'X' in d['Reunions']['colonnes'])
    verifier('alerte retirée', 'Des colonnes attendues manquent' not in texte(f))
    verifier('aucune erreur', not err); pg.close()
    pg, f, err = ouvrir(b, {'Reunions': {'colonnes': {'Ancienne': {'type': 'Text'}}, 'lignes': [{'id': 1, 'Ancienne': 'garder'}]}}, 'Reunions')
    verifier('installation : table présente annoncée comme gardée', 'déjà présente' in texte(f))
    f.get_by_role('button', name='Créer les tables', exact=True).click(); pg.wait_for_timeout(2000)
    d = pg.evaluate('window.MOCK')['tables']
    verifier('installation : table présente complétée, données gardées', all(c in d['Reunions']['colonnes'] for c in ['Titre', 'Date', 'Statut']) and d['Reunions']['lignes'][0]['Ancienne'] == 'garder')
    verifier('installation : aucune erreur', not err); pg.close()
    b.close()
print(f'{ok} OK, {ko} échec(s)'); sys.exit(1 if ko else 0)
