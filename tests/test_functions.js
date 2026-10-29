// Unit-Test der Netlify Functions mit nachgebautem fetch.
const assert = require('assert');
const path = '/home/claude/onlion-onboarding/netlify/functions/';
let calls = []; let userMail = 'Adam@Onlion.de';
let supaOk = true, upstream = { status: 201, body: { id: 'lx-123', messageId: '<m1>' } };
let sttCalls = [];
let team = [{ email: 'adam@onlion.de', role: 'owner', user_id: 'u1' }, { email: 'partner@x.de', role: 'member', user_id: 'u2' }];
let existingUsers = ['adam@onlion.de'];
const R = (status, body) => ({ ok: status < 300, status, json: async () => body });
global.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  if (url.includes('/auth/v1/user')) return { ok: supaOk, status: supaOk ? 200 : 401, json: async () => (supaOk ? { id: 'u1', email: userMail } : {}) };
  if (url.includes('/rest/v1/team')) {
    const m = /email=eq\.([^&]+)/.exec(url); const em = m ? decodeURIComponent(m[1]) : null;
    if (opts.headers.Authorization !== 'Bearer srk') return R(401, {});
    const sm = /sponsor=eq\.([^&]+)/.exec(url);
    if (!opts.method && sm) return R(200, team.filter(t => t.sponsor === decodeURIComponent(sm[1])));
    if (!opts.method) return R(200, team.filter(t => t.email === em));
    if (opts.method === 'POST') { team.push(Object.assign({ user_id: null }, JSON.parse(opts.body))); return R(201, {}); }
    if (opts.method === 'PATCH') { const t = team.find(t => t.email === em); Object.assign(t, JSON.parse(opts.body)); return R(204, {}); }
    if (opts.method === 'DELETE') { team = team.filter(t => t.email !== em); return R(204, {}); }
  }
  if (url.includes('/auth/v1/admin/generate_link')) {
    const b = JSON.parse(opts.body);
    if (b.type === 'invite' && existingUsers.includes(b.email)) return R(422, { msg: 'A user with this email address has already been registered' });
    return R(200, { id: 'uid-' + b.email, email: b.email, action_link: 'https://x.supabase.co/auth/v1/verify?token=T&type=' + b.type + '&redirect_to=' + b.redirect_to });
  }
  if (url.includes('/auth/v1/admin/users/')) return R(200, {});
  if (url.includes('/rest/v1/docs?select=data&collection=eq.config')) return R(200, [{ data: { rechercheLimit: 1 } }]);
  if (url.includes('/rest/v1/docs?select=id&collection=eq.recherchen')) return R(200, recherchen.filter(x => url.includes(encodeURIComponent(x.by))));
  if (url.endsWith('/rest/v1/docs') && opts.method === 'POST') { const b = JSON.parse(opts.body); if (b.collection === 'recherchen') recherchen.push(b.data); return R(201, {}); }
  if (url.includes('/rest/v1/docs')) { const m = /id=eq\.([^&]+)/.exec(url); return R(200, m && decodeURIComponent(m[1]) === 'kundeA' ? [{ data: { firma: 'A', partner: 'vp1@x.de' } }] : []); }
  if (url.includes('/storage/v1/object/sprachnotizen/')) return { ok: !url.includes('fehlt'), status: url.includes('fehlt') ? 404 : 200, headers: { get: () => 'audio/webm' }, arrayBuffer: async () => new ArrayBuffer(1000) };
  if (url.startsWith('https://www.muster.de') || url.startsWith('https://muster.de')) {
    webCalls.push(url);
    const html = url.endsWith('/') ? '<html><head><title>Muster GmbH</title></head><body><a href="/impressum">Impressum</a><a href="https://fremd.de/x">x</a><script>evil()</script><p>Wir sind Ihr Immobilienmakler in Nürnberg für Verkauf und Vermietung seit 1990.</p></body></html>' : '<p>Impressum: Muster GmbH, Hauptstr. 1, 90402 Nürnberg, Geschäftsführer Max Muster</p>';
    return { ok: true, status: 200, headers: { get: k => k === 'content-type' ? 'text/html; charset=utf-8' : null }, body: { getReader: () => { let d = false; return { read: async () => d ? { done: true } : (d = true, { done: false, value: new TextEncoder().encode(html) }) }; } } };
  }
  if (url.includes('api.anthropic.com')) { claudeCalls.push(opts); return R(200, { content: [{ type: 'text', text: 'Hier: {"firma":"Muster GmbH","branche":"Makler","staffel":"s1","antworten":{"q04":"60","qX":"x"},"broschuere":{"anliegen":["A"]},"quellen":["https://www.muster.de/impressum","javascript:alert(1)"]}' }] }); }
  if (url.includes('api.elevenlabs.io')) { sttCalls.push(opts); return R(200, { text: ' Hallo Abschrift ' }); }
  return { ok: upstream.status < 300, status: upstream.status, json: async () => upstream.body };
};
Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', BREVO_API_KEY: 'bk', BREVO_SENDER_EMAIL: 'info@onlion.de',
  OWNER_EMAIL: 'kopie@onlion.de', ALLOWED_USER_EMAIL: 'adam@onlion.de', SUPABASE_SERVICE_ROLE_KEY: 'srk', ELEVENLABS_API_KEY: 'el-key', URL: 'https://kionboarding.netlify.app', RESET_MIN_MS: '0'
});
const send = require(path + 'send-pdf.js').handler;
const teamFn = require(path + 'team.js').handler;
const resetFn = require(path + 'reset-password.js').handler;
const sttFn = require(path + 'transcribe.js').handler;
const resFn = require(path + 'research.js').handler;
const dnsMod = require('dns').promises; const origLookup = dnsMod.lookup;
dnsMod.lookup = async (h) => h === 'intern.example.de' ? [{ address: '10.0.0.5', family: 4 }] : h === 'meta.example.de' ? [{ address: '169.254.169.254', family: 4 }] : [{ address: '93.184.216.34', family: 4 }];
let claudeCalls = [], webCalls = [], recherchen = [];
const ev = (body, auth = 'Bearer tok') => ({ httpMethod: 'POST', headers: { authorization: auth }, body: JSON.stringify(body) });
let pass = 0; const ok = (n, c) => { assert.ok(c, n); pass++; console.log('OK   ' + n); };

(async () => {
  let r = await send(ev({ to: 'kunde@bank.de', subject: 'S', message: 'Hallo <b>\nZeile', filename: 'a b.pdf', pdfBase64: 'JVBERi0x' }));
  ok('send-pdf 200', r.statusCode === 200);
  const brevo = calls.find(c => c.url.includes('brevo'));
  const p = JSON.parse(brevo.opts.body);
  ok('Brevo-Schlüssel nur im Header', brevo.opts.headers['api-key'] === 'bk' && !brevo.opts.body.includes('bk"'));
  ok('Empfänger, Kopie, Anhang', p.to[0].email === 'kunde@bank.de' && p.bcc[0].email === 'kopie@onlion.de' && p.attachment[0].name === 'a_b.pdf');
  ok('HTML maskiert', p.htmlContent.includes('&lt;b&gt;<br>Zeile'));
  r = await send(ev({ to: 'kaputt', pdfBase64: 'x' })); ok('Ungültige E-Mail 400', r.statusCode === 400);
  supaOk = false; r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' })); ok('Ohne Login 401', r.statusCode === 401); supaOk = true;
  r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' }, '')); ok('Ohne Token 401', r.statusCode === 401);
  userMail='fremd@x.de'; r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' })); ok('Fremdes Konto 401', r.statusCode === 401); userMail='adam@onlion.de';
  r = await send(ev({ to: 'a@b.de', pdfBase64: 'x'.repeat(4600000) })); ok('Zu großes PDF 400', r.statusCode === 400);


  // Mitglied darf PDFs senden
  userMail = 'partner@x.de'; r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' })); ok('Team-Mitglied darf senden', r.statusCode === 200);
  // Mitglied darf nicht einladen
  r = await teamFn(ev({ action: 'invite', email: 'neu@x.de' })); ok('Mitglied darf nicht einladen 403', r.statusCode === 403);
  userMail = 'fremd@x.de'; r = await teamFn(ev({ action: 'invite', email: 'neu@x.de' })); ok('Fremder 401', r.statusCode === 401);
  userMail = 'adam@onlion.de';
  calls = [];
  r = await teamFn(ev({ action: 'invite', email: ' Neu@X.de ' }));
  ok('Einladen 200', r.statusCode === 200);
  ok('Team-Eintrag klein geschrieben, mit user_id', team.some(t => t.email === 'neu@x.de' && t.role === 'member' && t.user_id === 'uid-neu@x.de'));
  const gl = calls.find(c => c.url.includes('generate_link')); const glb = JSON.parse(gl.opts.body);
  ok('Einladungslink mit App-Adresse', glb.type === 'invite' && glb.redirect_to === 'https://kionboarding.netlify.app/');
  ok('service_role nur serverseitig im Header', gl.opts.headers.Authorization === 'Bearer srk');
  const im = JSON.parse(calls.find(c => c.url.includes('brevo')).opts.body);
  ok('Einladungsmail mit Link, ohne Inhaber-Name', im.to[0].email === 'neu@x.de' && im.htmlContent.includes('verify?token=T') && !/adam/i.test(im.htmlContent + im.textContent + im.subject));
  calls = []; existingUsers.push('neu@x.de');
  r = await teamFn(ev({ action: 'invite', email: 'neu@x.de' }));
  ok('Erneut senden: Passwort-Link statt Einladung', r.statusCode === 200 && calls.filter(c => c.url.includes('generate_link')).map(c => JSON.parse(c.opts.body).type).join() === 'invite,recovery');
  ok('Erneut senden: passender Mailtext', JSON.parse(calls.find(c => c.url.includes('brevo')).opts.body).subject === 'Dein Zugang zur ONLION Onboarding-App');
  r = await teamFn(ev({ action: 'remove', email: 'adam@onlion.de' })); ok('Inhaber nicht entfernbar', r.statusCode === 400);
  calls = []; r = await teamFn(ev({ action: 'remove', email: 'neu@x.de' }));
  ok('Entfernen löscht Team-Eintrag und Login', r.statusCode === 200 && !team.some(t => t.email === 'neu@x.de') && calls.some(c => c.url.endsWith('/auth/v1/admin/users/uid-neu%40x.de') && c.opts.method === 'DELETE'));
  r = await teamFn(ev({ action: 'invite', email: 'kaputt' })); ok('Ungültige Adresse 400', r.statusCode === 400);
  // Passwort vergessen
  calls = []; r = await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'partner@x.de' }) });
  ok('Reset für Mitglied sendet Mail', r.statusCode === 200 && calls.some(c => c.url.includes('brevo')) && JSON.parse(calls.find(c => c.url.includes('generate_link')).opts.body).type === 'recovery');
  calls = []; const r3 = await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'partner@x.de' }) });
  ok('Reset höchstens alle 5 Minuten', r3.body === r.body && !calls.some(c => c.url.includes('brevo')));
  process.env.RESET_MIN_MS = '300'; const t0 = Date.now();
  await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'unbekannt@x.de' }) });
  ok('Reset-Antwort hat Mindestdauer', Date.now() - t0 >= 290); process.env.RESET_MIN_MS = '0';
  calls = []; const r2 = await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'unbekannt@x.de' }) });
  ok('Reset für Unbekannte: gleiche Antwort, keine Mail', r2.statusCode === 200 && r2.body === r.body && !calls.some(c => c.url.includes('brevo')));


  // Vertriebspartner
  team.push({ email: 'vp1@x.de', role: 'partner', status: 'aktiv', user_id: null }, { email: 'vpweg@x.de', role: 'partner', status: 'inaktiv', user_id: null });
  userMail = 'vp1@x.de'; r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' })); ok('Aktiver Partner darf PDF senden', r.statusCode === 200);
  r = await teamFn(ev({ action: 'invite', email: 'neu2@x.de' })); ok('Partner darf nicht einladen', r.statusCode === 403);
  userMail = 'vpweg@x.de'; r = await send(ev({ to: 'a@b.de', pdfBase64: 'x' })); ok('Inaktiver Partner 401', r.statusCode === 401);
  userMail = 'adam@onlion.de'; calls = [];
  r = await teamFn(ev({ action: 'invite', email: 'vp2@x.de', role: 'partner', sponsor: 'vp1@x.de', name: 'Vera' }));
  ok('Partner mit Werber einladen', r.statusCode === 200 && team.some(t => t.email === 'vp2@x.de' && t.role === 'partner' && t.sponsor === 'vp1@x.de' && t.name === 'Vera'));
  ok('Partner-Einladung mit Partner-Text', JSON.parse(calls.find(c => c.url.includes('brevo')).opts.body).htmlContent.includes('Vertriebspartner'));
  r = await teamFn(ev({ action: 'invite', email: 'vp3@x.de', role: 'partner', sponsor: 'partner@x.de' })); ok('Werber muss Partner sein', r.statusCode === 400);
  r = await teamFn(ev({ action: 'remove', email: 'vp1@x.de' })); ok('Werber mit Struktur nicht entfernbar', r.statusCode === 400 && JSON.parse(r.body).error.includes('Struktur'));
  r = await teamFn(ev({ action: 'invite', email: 'admin2@x.de', role: 'owner' })); ok('Rolle owner nicht vergebbar', r.statusCode === 200 && team.find(t => t.email === 'admin2@x.de').role === 'member');


  // Sprachnotiz-Abschrift
  userMail = 'adam@onlion.de';
  r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeA/abc-123.webm' }));
  ok('Abschrift für ONLION', r.statusCode === 200 && JSON.parse(r.body).text === 'Hallo Abschrift');
  const so = sttCalls[sttCalls.length - 1];
  ok('ElevenLabs-Schlüssel nur im Header', so.headers['xi-api-key'] === 'el-key' && so.body instanceof FormData && so.body.get('model_id') === 'scribe_v1' && so.body.get('language_code') === 'deu');
  userMail = 'vp1@x.de'; r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeA/abc-123.webm' })); ok('Partner: eigener Kunde erlaubt', r.statusCode === 200);
  r = await sttFn(ev({ customerId: 'kundeB', path: 'kundeB/abc-123.webm' })); ok('Partner: fremder Kunde 403', r.statusCode === 403);
  userMail = 'adam@onlion.de';
  r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeB/abc-123.webm' })); ok('Pfad muss zum Kunden passen', r.statusCode === 400);
  r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeA/../x.webm' })); ok('Pfad-Tricks abgewiesen', r.statusCode === 400);
  r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeA/fehlt.webm' })); ok('Fehlende Datei 404', r.statusCode === 404);
  userMail = 'fremd@x.de'; r = await sttFn(ev({ customerId: 'kundeA', path: 'kundeA/abc.webm' })); ok('Fremde 401', r.statusCode === 401); userMail = 'adam@onlion.de';


  // Firmenrecherche
  process.env.ANTHROPIC_API_KEY = 'ak-key';
  userMail = 'adam@onlion.de';
  r = await resFn(ev({ step: 'fetch', url: 'www.muster.de' }));
  const fr = JSON.parse(r.body);
  ok('Recherche liest Startseite und Impressum (gleiche Domain)', r.statusCode === 200 && fr.pages.length === 2 && webCalls.every(u => u.includes('muster.de')) && !fr.pages[0].text.includes('evil'));
  r = await resFn(ev({ step: 'fetch', url: 'http://intern.example.de' })); ok('Interne Adresse abgewiesen', r.statusCode === 400);
  r = await resFn(ev({ step: 'fetch', url: 'http://meta.example.de' })); ok('Metadaten-Adresse abgewiesen', r.statusCode === 400);
  r = await resFn(ev({ step: 'fetch', url: 'http://127.0.0.1' })); ok('IP-Adresse abgewiesen', r.statusCode === 400);
  r = await resFn(ev({ step: 'fetch', url: 'file:///etc/passwd' })); ok('Andere Protokolle abgewiesen', r.statusCode === 400);
  r = await resFn(ev({ step: 'analyze', url: 'https://www.muster.de/', pages: fr.pages, questions: [{ id: 'q04', text: 'Anrufe?' }], staffeln: [{ id: 's1', label: '1-49' }] }));
  const ar = JSON.parse(r.body).result;
  const cc = claudeCalls[claudeCalls.length - 1];
  ok('Claude: Schlüssel im Header, Modell gesetzt', cc.headers['x-api-key'] === 'ak-key' && cc.headers['anthropic-version'] === '2023-06-01' && JSON.parse(cc.body).model === 'claude-haiku-5-5');
  ok('Ergebnis bereinigt (nur bekannte Fragen, sichere Quellen)', ar.firma === 'Muster GmbH' && ar.antworten.q04 === '60' && !ar.antworten.qX && ar.quellen.length === 1 && ar.staffel === 's1');
  userMail = 'vp1@x.de';
  r = await resFn(ev({ step: 'fetch', url: 'www.muster.de', customerId: 'kundeB' })); ok('Partner: fremder Kunde 403', r.statusCode === 403);
  r = await resFn(ev({ step: 'analyze', url: 'x', customerId: 'kundeA', pages: fr.pages, questions: [], staffeln: [] })); ok('Partner: eigener Kunde, Recherche gezählt', r.statusCode === 200 && recherchen.some(x => x.by === 'vp1@x.de'));
  r = await resFn(ev({ step: 'fetch', url: 'www.muster.de', customerId: 'kundeA' })); ok('Partner: Monatsgrenze greift', r.statusCode === 429);
  userMail = 'adam@onlion.de';
  r = await resFn(ev({ step: 'fetch', url: 'www.muster.de' })); ok('ONLION ohne Grenze', r.statusCode === 200);
  dnsMod.lookup = origLookup;

  console.log('\n' + pass + ' Funktionstests bestanden');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
