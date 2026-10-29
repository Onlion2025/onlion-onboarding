// Versendet die PDF-Zusammenfassung über Brevo an den Kunden (Kopie an ONLION).
const crypto = require('crypto');
const { json, requireUser, parseBody, missingEnv, envHint, admin, lc, customerAccess } = require('../lib/common');

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' });
  const missing = missingEnv(['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ALLOWED_USER_EMAIL']);
  if (missing.length) return json(500, { error: envHint(missing) });

  const user = await requireUser(event);
  if (!user) return json(401, { error: 'Nicht berechtigt. Bitte mit deinem Konto neu anmelden.' });

  const b = parseBody(event);
  if (!b) return json(400, { error: 'Ungültige Anfrage.' });
  const to = String(b.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json(400, { error: 'Bitte die E-Mail-Adresse prüfen.' });
  if (!b.pdfBase64 || typeof b.pdfBase64 !== 'string' || b.pdfBase64.length > 4500000) return json(400, { error: 'PDF fehlt oder ist zu groß (höchstens ca. 3 MB).' });

  // Vorab-Broschüre ist Werbung: nur mit bestätigter Zustimmung des Empfängers (§ 7 UWG) und nur für eigene Kunden.
  const kind = b.kind === 'broschuere' ? 'broschuere' : 'zusammenfassung';
  const cid = String(b.customerId || '');
  if (kind === 'broschuere' && b.consent !== true) return json(400, { error: 'Bitte bestätigen, dass der Empfänger der Zusendung zugestimmt hat.' });
  if (kind === 'broschuere' && !cid) return json(400, { error: 'Kunde fehlt.' });
  if (cid || user.role === 'partner') {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: envHint(['SUPABASE_SERVICE_ROLE_KEY']) });
    const denied = await customerAccess(user, cid);
    if (denied) return json(403, { error: denied });
  }

  const payload = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ONLION' },
    to: [b.toName ? { email: to, name: String(b.toName).slice(0, 120) } : { email: to }],
    subject: String(b.subject || 'Zusammenfassung KI-Telefon-Agent').slice(0, 200),
    htmlContent: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + esc(b.message).replace(/\n/g, '<br>') + '</div>',
    textContent: String(b.message || ''),
    attachment: [{ content: b.pdfBase64, name: String(b.filename || 'Zusammenfassung.pdf').replace(/[^\w.\-äöüÄÖÜß]+/g, '_') }]
  };
  if (process.env.OWNER_EMAIL) payload.bcc = [{ email: process.env.OWNER_EMAIL }];
  if (process.env.REPLY_TO_EMAIL) payload.replyTo = { email: process.env.REPLY_TO_EMAIL };

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) return json(502, { error: 'Brevo hat den Versand abgelehnt: ' + (t.message || r.status) });
  // Versandprotokoll auf dem Server (unabhängig vom Browser)
  if (cid && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await admin('/rest/v1/docs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ collection: 'versand', id: crypto.randomUUID(), data: { customerId: cid, kind, to: lc(to), by: lc(user.email), at: new Date().toISOString(), consent: kind === 'broschuere' ? true : undefined, messageId: t.messageId || null } }) })
      .then(x => { if (!x.ok) console.error('Versandprotokoll fehlgeschlagen', x.status); }).catch(e => console.error('Versandprotokoll fehlgeschlagen', e && e.message));
  }
  return json(200, { ok: true, messageId: t.messageId || null });
};
