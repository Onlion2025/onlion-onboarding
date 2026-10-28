# Ende-zu-Ende-Test Vertrieb: Provisionsmodell, Zahlungen, Provisionen, Gutschriften, Partner-Ansicht
import json, subprocess, time, sys, os
from playwright.sync_api import sync_playwright
APP = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
T = os.path.dirname(os.path.abspath(__file__))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
tpl = json.load(open(T + '/seed_template.json')); legal = json.load(open(T + '/seed_legal.json'))
TEAM = [
  {'email': 'adam@test.de', 'role': 'owner', 'sponsor': None, 'status': 'aktiv'},
  {'email': 'p1@x.de', 'role': 'partner', 'sponsor': None, 'status': 'aktiv', 'name': 'Paula Eins', 'adresse': 'Weg 1, 90402 Nürnberg'},
  {'email': 'p2@x.de', 'role': 'partner', 'sponsor': 'p1@x.de', 'status': 'aktiv', 'name': 'Peter Zwei', 'adresse': 'Weg 2'},
  {'email': 'p3@x.de', 'role': 'partner', 'sponsor': 'p2@x.de', 'status': 'aktiv', 'name': 'Petra Drei', 'adresse': 'Weg 3'},
]
SEED = [{'collection': 'templates', 'id': 'ki-telefon-agent', 'data': tpl}, {'collection': 'legal', 'id': 'ki-telefon-agent', 'data': legal}]
results = []
def ok(name, cond):
    results.append((name, bool(cond))); print(('OK   ' if cond else 'FAIL ') + name)
errors = []
def page_for(ctx, team, seed, fnlog=None):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.add_init_script('window.__teamInit=%s;window.__seedRows=%s;window.__struct=[{"email":"p4@x.de","name":"Pia Vier","ebene":1,"status":"aktiv"}];' % (json.dumps(team), json.dumps(seed)))
    pg.route('**/supabase.min.js', lambda r: r.fulfill(path=T + '/mock-supabase.js', content_type='application/javascript'))
    pg.route('**/jspdf.umd.min.js', lambda r: r.fulfill(path=T + '/node_modules/jspdf/dist/jspdf.umd.min.js', content_type='application/javascript'))
    pg.route('**/config.js', lambda r: r.fulfill(body='window.ONLION_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"x"};', content_type='application/javascript'))
    pg.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    def fn(r):
        if fnlog is not None: fnlog.append((r.request.url, r.request.post_data))
        r.fulfill(status=200, content_type='application/json', body='{"ok":true}')
    pg.route('**/.netlify/functions/**', fn)
    pg.goto('http://localhost:8767/index.html'); pg.wait_for_selector('#loginForm')
    return pg
def login(pg, mail):
    pg.fill('#lg-mail', mail); pg.fill('#lg-pw', 'richtig'); pg.click('#lg-btn'); pg.wait_for_selector('#login', state='hidden'); pg.wait_for_timeout(400)
def prov(pg): return pg.evaluate("()=>[...__rows.values()].filter(r=>r.collection==='provisionen').map(r=>r.data)")
def new_customer(pg, name, partner):
    pg.click('text=+ Neuer Kunde'); pg.fill('#nc-firma', name); pg.click('text=Anlegen'); pg.wait_for_selector('h1:has-text("%s")' % name)
    pg.select_option('#pay-partner', partner); pg.wait_for_timeout(300)
    pg.click('nav >> text=Angebot'); pg.click('.chip:has-text("1–49 Mitarbeitende")'); pg.wait_for_timeout(400)
    pg.click('button.mobile-back, nav >> text=Übersicht'); pg.wait_for_selector('#pay-amt')
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1194, 'height': 900}, accept_downloads=True, service_workers='block')
        fnlog = []
        a = page_for(ctx, TEAM, SEED, fnlog); login(a, 'adam@test.de')
        ok('Admin sieht „Vertrieb“', a.inner_text('#navVertrieb') == 'Vertrieb' and a.is_visible('#navVertrieb'))
        a.click('#navVertrieb'); a.wait_for_selector('text=Partnerstruktur')
        ok('Partnerbaum mit 3 Partnern', all(n in a.inner_text('#view') for n in ['Paula Eins', 'Peter Zwei', 'Petra Drei']))
        # Modell: Ebene 2 von 5 auf 6 % und freigeben
        a.click('.chip:has-text("Provisionsmodell")'); a.wait_for_selector('#md-e2')
        ok('Startmodell 50/10/5', '50 %' in a.inner_text('#view .card') and '15 % · 24 Monate' in a.inner_text('#view .card'))
        a.fill('#md-e2', '6'); a.wait_for_timeout(800); a.click('button:has-text("Freigeben …")'); a.click('button:has-text("Ja, freigeben")'); a.wait_for_timeout(500)
        cfgd = a.evaluate("()=>[...__rows.values()].find(r=>r.collection==='config').data")
        ok('Neue Version freigegeben', len(cfgd['versions']) == 2 and cfgd['versions'][1]['rates']['einrichtung'] == [50, 10, 6] and cfgd['draft'] is None)
        a.screenshot(path=T + '/v-modell.png', full_page=True)
        # Kunde von p2 (damit p2 aktiv ist), dann Kunde von p3
        new_customer(a, 'Zwei GmbH', 'p2@x.de')
        ok('Staffel füllt Angebot (2.500 €)', a.input_value('#pay-amt') == '2500')
        a.click('button:has-text("Zahlungseingang verbuchen")'); a.wait_for_timeout(600)
        pv = prov(a)
        ok('p2 verkauft: 1.250 € an p2, nichts an inaktiven Werber p1', len(pv) == 1 and pv[0]['partner'] == 'p2@x.de' and pv[0]['betrag'] == 1250)
        cust = a.evaluate("()=>[...__rows.values()].find(r=>r.data.firma==='Zwei GmbH').data")
        ok('Einrichtung bezahlt setzt „Abgeschlossen“', cust['crm']['status'] == 'abgeschlossen')
        new_customer(a, 'Drei AG', 'p3@x.de')
        txt = a.inner_text('#pay-prev')
        ok('Vorschau zeigt Provisionen (%s)' % txt, 'Petra Drei' in txt and '1.250,00' in txt and 'Peter Zwei' in txt)
        a.click('button:has-text("Zahlungseingang verbuchen")'); a.wait_for_timeout(600)
        pv = [x for x in prov(a) if x['customerId'] != cust.get('id')]
        drei = [x for x in prov(a) if x['art'] == 'einrichtung' and x['kunde'] != 'Zwei GmbH']
        by = {x['partner']: x for x in drei}
        ok('p3 Verkäufer 1.250 €', by.get('p3@x.de', {}).get('betrag') == 1250 and by['p3@x.de']['ebene'] == 0)
        ok('p2 Ebene 1: 250 €', by.get('p2@x.de', {}).get('betrag') == 250 and by['p2@x.de']['ebene'] == 1 and by['p2@x.de']['kunde'] == '')
        ok('p1 Ebene 2 ohne eigenen Abschluss: keine Provision', 'p1@x.de' not in by)
        # Lizenz
        a.click('#pay-partner'); a.click('.chip:has-text("Lizenz (Monat)")'); a.wait_for_timeout(200)
        ok('Lizenzbetrag aus Staffel (450 €)', a.input_value('#pay-amt') == '450')
        a.click('button:has-text("Zahlungseingang verbuchen")'); a.wait_for_timeout(600)
        liz = {x['partner']: x for x in prov(a) if x['art'] == 'lizenz'}
        ok('Lizenz: p3 15 % = 67,50 €, p2 3 % = 13,50 €', liz.get('p3@x.de', {}).get('betrag') == 67.5 and liz.get('p2@x.de', {}).get('betrag') == 13.5 and liz['p3@x.de']['lizenzMonat'] == 1)
        a.screenshot(path=T + '/v-kunde.png', full_page=True)
        # Storno der Lizenz
        a.click('.member:has-text("Lizenz") >> button:has-text("Stornieren")'); a.click('.confirm >> button:has-text("Stornieren")'); a.wait_for_timeout(600)
        st = [x['status'] for x in prov(a) if x['art'] == 'lizenz']
        ok('Storno setzt Lizenz-Provisionen auf storniert', st and all(s == 'storniert' for s in st))
        # Lizenzmonat gesammelt verbuchen
        a.click('#navVertrieb'); a.click('.chip:has-text("Zahlungen")'); a.wait_for_selector('#lic-m')
        ok('Beide Kunden für Lizenz vorgeschlagen', 'Zwei GmbH' in a.inner_text('#view') and 'Drei AG' in a.inner_text('#view'))
        a.click('button:has-text("Ausgewählte als bezahlt verbuchen")'); a.wait_for_timeout(700)
        liz = [x for x in prov(a) if x['art'] == 'lizenz' and x['status'] == 'faellig']
        ok('Sammelbuchung erzeugt Lizenz-Provisionen (%d)' % len(liz), len(liz) == 3)
        # Partner bearbeiten: p2 Kleinunternehmer, Sonderkondition
        a.click('.chip:has-text("Partner")'); a.click('.ditem:has-text("Peter Zwei")'); a.wait_for_selector('#pe-ku')
        a.check('#pe-ku'); a.fill('#pe-st', 'DE123'); a.fill('#pe-se', '55'); a.click('#view button[type=submit]:has-text("Speichern")'); a.wait_for_timeout(400)
        t2 = a.evaluate("()=>window.__team.find(t=>t.email==='p2@x.de')")
        ok('Partner gespeichert (Kleinunternehmer, Sonderkondition)', t2['kleinunternehmer'] is True and t2['sonder']['einrichtung'] == 55 and t2['steuer_nr'] == 'DE123')
        # Abrechnung im aktuellen Monat
        a.click('.chip:has-text("Abrechnung")'); a.wait_for_selector('#gs-m')
        a.fill('#gs-m', time.strftime('%Y-%m')); a.dispatch_event('#gs-m', 'change'); a.wait_for_timeout(300)
        a.click('button:has-text("Gutschriften erstellen")'); a.click('.confirm >> button:has-text("Erstellen")'); a.wait_for_timeout(600)
        gs = a.evaluate("()=>[...__rows.values()].filter(r=>r.collection==='gutschriften').map(r=>r.data)")
        g2 = next((g for g in gs if g['partner'] == 'p2@x.de'), None); g3 = next((g for g in gs if g['partner'] == 'p3@x.de'), None)
        ok('Gutschriften je Partner (%d)' % len(gs), len(gs) == 2 and g2 and g3)
        ok('p3: 1.250 + 67,50 = 1.317,50 € netto, 19 % USt', g3 and g3['netto'] == 1317.5 and g3['ustSatz'] == 19 and g3['brutto'] == 1567.83)
        ok('p2 Kleinunternehmer: ohne USt', g2 and g2['ustSatz'] == 0 and g2['brutto'] == g2['netto'])
        ok('Provisionen auf „abgerechnet“', all(x['status'] in ('abgerechnet', 'storniert') for x in prov(a)))
        with a.expect_download() as d:
            a.click('.member:has-text("Petra Drei") >> button:has-text("PDF")')
        pth = T + '/gutschrift.pdf'; d.value.save_as(pth); data = open(pth, 'rb').read()
        ok('Gutschrift-PDF (%d KB)' % (len(data) // 1024), data[:4] == b'%PDF')
        a.click('.member:has-text("Petra Drei") >> button:has-text("Ausgezahlt")'); a.click('.member:has-text("Petra Drei") >> button:has-text("Bestätigen")'); a.wait_for_timeout(500)
        ok('Ausgezahlt markiert', all(x['status'] == 'ausgezahlt' for x in prov(a) if x['partner'] == 'p3@x.de' and x['status'] != 'storniert'))
        a.screenshot(path=T + '/v-abrechnung.png', full_page=True)
        # Storno nach Auszahlung: Rückbuchung
        a.click('#custList .navbtn:has-text("Drei AG")'); a.wait_for_selector('#pay-amt')
        a.click('.member:has-text("Einrichtung") >> button:has-text("Stornieren")'); a.click('.confirm >> button:has-text("Stornieren")'); a.wait_for_timeout(600)
        neg = [x for x in prov(a) if x.get('storno')]
        ok('Storno nach Auszahlung bucht Rückforderung (%s)' % [x['betrag'] for x in neg], any(x['partner'] == 'p3@x.de' and x['betrag'] == -1250 for x in neg))
        rows = a.evaluate("()=>[...__rows.values()]")
        a.click('#navVertrieb'); a.click('.chip:has-text("Partner")'); a.wait_for_timeout(200)
        a.set_viewport_size({'width': 390, 'height': 844}); a.wait_for_timeout(300)
        for tab in ['Partner', 'Provisionsmodell', 'Zahlungen', 'Abrechnung']:
            a.click('.chip:has-text("%s")' % tab); a.wait_for_timeout(250)
            sw = a.evaluate('document.documentElement.scrollWidth'); ok('Handy %s ohne Querscrollen (%d)' % (tab, sw), sw <= 390)
            a.screenshot(path=T + '/v-handy-%s.png' % tab.lower(), full_page=True)
        # Partner-Sicht
        pp = page_for(ctx, TEAM, rows); login(pp, 'p3@x.de')
        ok('Partner sieht „Provisionen“, keine Vorlagen', pp.inner_text('#navVertrieb') == 'Provisionen' and not pp.is_visible('#navTpl'))
        ok('Partner sieht nur eigenen Kunden', 'Drei AG' in pp.inner_text('#custList') and 'Zwei GmbH' not in pp.inner_text('#custList'))
        ok('Partner sieht keine Zahlungs-Karte', pp.query_selector('#pay-amt') is None)
        pp.click('#navVertrieb'); pp.wait_for_selector('text=Provisionskonto')
        v = pp.inner_text('#view')
        ok('Partner: Konditionen, Konto, Gutschrift, Struktur', 'Deine Konditionen' in v and 'Drei AG' in v and 'GS-' in v and 'Pia Vier' in v)
        ok('Partner sieht keine fremden Provisionen', 'Zwei GmbH' not in v and 'Peter Zwei' not in v)
        pp.fill('#vp-name', 'Neue Person'); pp.fill('#vp-mail', 'neu@x.de'); pp.click('button:has-text("Partner vorschlagen")'); pp.wait_for_timeout(400)
        vs = pp.evaluate("()=>[...__rows.values()].filter(r=>r.collection==='vorschlaege').map(r=>r.data)")
        ok('Vorschlag gespeichert', any(x['email'] == 'neu@x.de' and x['von'] == 'p3@x.de' for x in vs))
        pp.screenshot(path=T + '/v-partner.png', full_page=True)
        pp.click('text=+ Neuer Kunde'); pp.fill('#nc-firma', 'Partnerkunde KG'); pp.click('text=Anlegen'); pp.wait_for_selector('h1:has-text("Partnerkunde KG")')
        pk = pp.evaluate("()=>[...__rows.values()].find(r=>r.data.firma==='Partnerkunde KG').data")
        ok('Kunde vom Partner gehört dem Partner', pk.get('partner') == 'p3@x.de')
        pp.set_viewport_size({'width': 390, 'height': 844}); pp.click('#navVertrieb'); pp.wait_for_timeout(300)
        sw = pp.evaluate('document.documentElement.scrollWidth'); ok('Partner-Ansicht Handy ohne Querscrollen (%d)' % sw, sw <= 390)
        pp.screenshot(path=T + '/v-partner-handy.png', full_page=True)
        # Vorschlag beim Admin -> Einladen mit Werber
        rows2 = pp.evaluate("()=>[...__rows.values()]")
        a2 = page_for(ctx, TEAM, rows2, fnlog); login(a2, 'adam@test.de'); a2.click('#navVertrieb'); a2.wait_for_selector('text=Vorschläge von Partnern')
        a2.click('.member:has-text("Neue Person") >> button:has-text("Einladen")'); a2.wait_for_timeout(200)
        ok('Einladeformular vorausgefüllt', a2.input_value('#pi-mail') == 'neu@x.de' and a2.input_value('#pi-sponsor') == 'p3@x.de')
        a2.click('form:has(#pi-mail) >> button:has-text("Einladen")'); a2.wait_for_timeout(500)
        ok('Einladung als Partner mit Werber', any('/functions/team' in u and '"partner"' in (d or '') and 'p3@x.de' in (d or '') for u, d in fnlog))
        # inaktiver Partner gesperrt
        team_off = [dict(t, status='inaktiv') if t['email'] == 'p2@x.de' else t for t in TEAM]
        off = page_for(ctx, team_off, rows2); login(off, 'p2@x.de'); off.wait_for_selector('h1:has-text("Kein Zugriff")')
        ok('Inaktiver Partner gesperrt', True)
        ok('Keine JS-Fehler ' + '; '.join(errors), not errors)
        b.close()
finally:
    srv.terminate()
print('\n%d/%d bestanden' % (sum(r for _, r in results), len(results)))
sys.exit(0 if all(r for _, r in results) else 1)
