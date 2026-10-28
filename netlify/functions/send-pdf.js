// Versendet die PDF-Zusammenfassung über Brevo an den Kunden (Kopie an ONLION).
const { json, requireUser, parseBody, missingEnv, envHint } = require('../lib/common');

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
  return json(200, { ok: true, messageId: t.messageId || null });
};
