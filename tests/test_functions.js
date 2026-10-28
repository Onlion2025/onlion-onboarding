// Unit-Test der Netlify Functions mit nachgebautem fetch.
const assert = require('assert');
const path = '/home/claude/onlion-onboarding/netlify/functions/';
let calls = []; let userMail = 'Adam@Onlion.de';
let supaOk = true, upstream = { status: 201, body: { id: 'lx-123', messageId: '<m1>' } };
let team = [{ email: 'adam@onlion.de', role: 'owner', user_id: 'u1' }, { email: 'partner@x.de', role: 'member', user_id: 'u2' }];
let existingUsers = ['adam@onlion.de'];
const R = (status, body) => ({ ok: status < 300, status, json: async () => body });
global.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  if (url.includes('/auth/v1/user')) return { ok: supaOk, status: supaOk ? 200 : 401, json: async () => (supaOk ? { id: 'u1', email: userMail } : {}) };
  if (url.includes('/rest/v1/team')) {
    const m = /email=eq\.([^&]+)/.exec(url); const em = m ? decodeURIComponent(m[1]) : null;
    if (opts.headers.Authorization !== 'Bearer srk') return R(401, {});
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
  return { ok: upstream.status < 300, status: upstream.status, json: async () => upstream.body };
};
Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', BREVO_API_KEY: 'bk', BREVO_SENDER_EMAIL: 'info@onlion.de',
  OWNER_EMAIL: 'kopie@onlion.de', ALLOWED_USER_EMAIL: 'adam@onlion.de', SUPABASE_SERVICE_ROLE_KEY: 'srk', URL: 'https://kionboarding.netlify.app'
});
const send = require(path + 'send-pdf.js').handler;
const teamFn = require(path + 'team.js').handler;
const resetFn = require(path + 'reset-password.js').handler;
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
  r = await teamFn(ev({ action: 'remove', email: 'adam@onlion.de' })); ok('Inhaber nicht entfernbar', r.statusCode === 400);
  calls = []; r = await teamFn(ev({ action: 'remove', email: 'neu@x.de' }));
  ok('Entfernen löscht Team-Eintrag und Login', r.statusCode === 200 && !team.some(t => t.email === 'neu@x.de') && calls.some(c => c.url.endsWith('/auth/v1/admin/users/uid-neu%40x.de') && c.opts.method === 'DELETE'));
  r = await teamFn(ev({ action: 'invite', email: 'kaputt' })); ok('Ungültige Adresse 400', r.statusCode === 400);
  // Passwort vergessen
  calls = []; r = await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'partner@x.de' }) });
  ok('Reset für Mitglied sendet Mail', r.statusCode === 200 && calls.some(c => c.url.includes('brevo')) && JSON.parse(calls.find(c => c.url.includes('generate_link')).opts.body).type === 'recovery');
  calls = []; const r2 = await resetFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ email: 'unbekannt@x.de' }) });
  ok('Reset für Unbekannte: gleiche Antwort, keine Mail', r2.statusCode === 200 && r2.body === r.body && !calls.some(c => c.url.includes('brevo')));

  console.log('\n' + pass + ' Funktionstests bestanden');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
