import json, subprocess, time, sys, os, base64
from playwright.sync_api import sync_playwright
APP='/home/claude/onlion-onboarding'; T=os.path.dirname(os.path.abspath(__file__))
srv=subprocess.Popen([sys.executable,'-m','http.server','8766','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
tpl=json.load(open(''+T+'/seed_template.json')); legal=json.load(open(''+T+'/seed_legal.json'))
ans={'q01':'Verpasste Anrufe','q02':'Termine','q03':'Keine Termine','q04':'50','q05':'10','q06':'Dienstag 9 bis 15 Uhr','q07':'Angestellte und wenn nicht dann geht auch keiner ran.','q08':'Termine, Fragen zu Öffnungszeiten und Preise zu Immobilien','q09':'Preise','q10':'Nur aufgenommen werden und in Einzelfällen auch gleich in den Termin eingetragen werden','q11':'Keine Ahnung','q12':'Ja an David','q13':'Nein','q15':'Oft','q16':'Nein','q17':'In einer E-Mail','q18':'Ja','q19':'Eigene Nummer','q20':'Lea','q21':'Nein','q22':'Nein','q23':'Ja','q24':'Ja','q25':'Ja','q26':'Herr Müller','q27':'600 EUR im Monat'}
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(service_workers='block'); page=ctx.new_page()
    errs=[]; page.on('pageerror',lambda e:errs.append(str(e)))
    page.route('**/supabase.min.js',lambda r:r.fulfill(path=T+'/mock-supabase.js',content_type='application/javascript'))
    page.route('**/jspdf.umd.min.js',lambda r:r.fulfill(path=T+'/node_modules/jspdf/dist/jspdf.umd.min.js',content_type='application/javascript'))
    page.route('**/config.js',lambda r:r.fulfill(body='window.ONLION_CONFIG={supabaseUrl:"https://t.supabase.co",supabaseAnonKey:"x"};',content_type='application/javascript'))
    page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    html=open(APP+'/index.html').read().replace('async function buildPdf(c){','window.__buildPdf=buildPdf;window.__b64=blobToBase64;async function buildPdf(c){',1)
    page.route('**/index.html',lambda r:r.fulfill(body=html,content_type='text/html'))
    page.goto('http://localhost:8766/index.html'); page.wait_for_selector('#login:not([hidden])')
    page.evaluate("([t,l])=>{__rows.set('templates/ki-telefon-agent',{collection:'templates',id:'ki-telefon-agent',data:t});__rows.set('legal/ki-telefon-agent',{collection:'legal',id:'ki-telefon-agent',data:l});}",[tpl,legal])
    page.fill('#lg-mail','a@b.de'); page.fill('#lg-pw','richtig'); page.click('#lg-btn'); page.wait_for_selector('#login',state='hidden'); page.wait_for_timeout(500)
    b64=page.evaluate("""async (ans)=>{
      const sig=(f)=>{const c=document.createElement('canvas');c.width=600;c.height=200;const x=c.getContext('2d');x.lineWidth=4;x.beginPath();f(x);x.stroke();return {img:c.toDataURL('image/png'),ratio:c.height/c.width};};
      const k=sig(x=>{x.moveTo(60,150);x.bezierCurveTo(120,40,220,180,300,90);x.bezierCurveTo(340,60,380,160,450,110);});
      const o=sig(x=>{x.moveTo(80,170);x.lineTo(160,30);x.lineTo(200,170);x.moveTo(230,120);x.bezierCurveTo(300,60,380,120,500,100);});
      const c={firma:'VR-ImmoService GmbH',ansprechpartner:'David Kalu  ',email:'',telefon:'0981 48 74 48-0',adresse:'Promenade 17, 91522 Ansbach',answers:ans,
        legal:{dsb:'Herr Müller ',speicherung:'Nur als Text, 90 Tage',eu:true,hinweis:true,agb:true,referenz:false},
        signature:{kunde:Object.assign({name:'David Kalu'},k),onlion:Object.assign({name:'ONLION'},o),ort:'Schwabach',signedAt:new Date().toISOString(),hash:'a408be6f0a2bbb1c947db2d4c07d5009b5250fa4eeb6c327f0d770c1fb98aa0'}};
      const blob=await window.__buildPdf(c);return await window.__b64(blob);}""",ans)
    open(T+'/sample.pdf','wb').write(base64.b64decode(b64)); print('errors',errs)
finally: srv.terminate()
