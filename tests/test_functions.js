// Unit-Test der Netlify Functions mit nachgebautem fetch.
const assert = require('assert');
const path = '/home/claude/onlion-onboarding/netlify/functions/';
let calls = []; let userMail = 'Adam@Onlion.de';
let supaOk = true, upstream = { status: 201, body: { id: 'lx-123', messageId: '<m1>' } };
global.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  if (url.includes('/auth/v1/user')) return { ok: supaOk, status: supaOk ? 200 : 401, json: async () => (supaOk ? { id: 'u1', email: userMail } : {}) };
  return { ok: upstream.status < 300, status: upstream.status, json: async () => upstream.body };
};
Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', BREVO_API_KEY: 'bk', BREVO_SENDER_EMAIL: 'info@onlion.de',
  OWNER_EMAIL: 'kopie@onlion.de', LEXWARE_API_KEY: 'lk', ALLOWED_USER_EMAIL: 'adam@onlion.de'
});
const send = require(path + 'send-pdf.js').handler;
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

  console.log('\n' + pass + ' Funktionstests bestanden');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
