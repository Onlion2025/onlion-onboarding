// Gemeinsame Helfer für die Netlify Functions.
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(obj)
});

const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const lc = s => String(s || '').trim().toLowerCase();
const ownerEmail = () => lc(process.env.ALLOWED_USER_EMAIL);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Anfragen mit dem service_role-Schlüssel. Er liegt nur in Netlify, nie in der App.
function admin(path, opts = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(base() + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, opts.headers || {})
  }));
}

// Liest einen Team-Eintrag (Server-Sicht).
async function teamRow(email) {
  const r = await admin('/rest/v1/team?select=email,role,user_id&email=eq.' + encodeURIComponent(lc(email)));
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Prüft das Supabase-Login-Token aus dem Authorization-Header.
// Zugelassen sind das Inhaber-Konto (ALLOWED_USER_EMAIL) und alle Team-Mitglieder.
async function requireUser(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const r = await fetch(base() + '/auth/v1/user', {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user || !user.id || !user.email) return null;
  const email = lc(user.email);
  if (ownerEmail() && email === ownerEmail()) return Object.assign(user, { role: 'owner' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const row = await teamRow(email).catch(() => null);
  if (!row) return null;
  return Object.assign(user, { role: row.role === 'owner' ? 'owner' : 'member' });
}

// Erzeugt einen Einladungs- oder Passwort-Link (Supabase) und gibt ihn zurück.
async function makeLink(type, email) {
  const redirect = String(process.env.APP_URL || process.env.URL || '').replace(/\/$/, '') + '/';
  const r = await admin('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type, email: lc(email), redirect_to: redirect })
  });
  const t = await r.json().catch(() => ({}));
  const link = t.action_link || (t.properties && t.properties.action_link);
  const userId = (t.user && t.user.id) || t.id || null;
  return { ok: r.ok && !!link, status: r.status, link, userId, message: t.msg || t.message || t.error_description || '' };
}

const escHtml = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Versendet eine E-Mail mit Button-Link über Brevo.
async function sendLinkMail(to, subject, intro, buttonText, link) {
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#141414">'
    + '<p>' + escHtml(intro).replace(/\n/g, '<br>') + '</p>'
    + '<p style="margin:24px 0"><a href="' + escHtml(link) + '" style="background:#c8ff00;color:#0e0e0e;font-weight:bold;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">' + escHtml(buttonText) + '</a></p>'
    + '<p style="font-size:13px;color:#5d5d56">Der Link gilt nur für kurze Zeit und funktioniert einmal. Falls er abgelaufen ist, einfach in der App „Passwort vergessen?“ wählen.<br>Du hast diese Nachricht nicht erwartet? Dann kannst du sie ignorieren.</p>'
    + '<p style="font-size:13px;color:#5d5d56">ONLION</p></div>';
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'ONLION' },
      to: [{ email: lc(to) }],
      subject,
      htmlContent: html,
      textContent: intro + '\n\n' + buttonText + ': ' + link + '\n\nONLION'
    })
  });
  const t = await r.json().catch(() => ({}));
  return { ok: r.ok, message: t.message || String(r.status) };
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch (e) { return null; }
}

function missingEnv(names) {
  return names.filter(n => !process.env[n]);
}

const envHint = missing => 'In Netlify fehlen Einstellungen: ' + missing.join(', ') + ' (siehe README, Schritt 7).';

module.exports = { json, requireUser, parseBody, missingEnv, envHint, admin, teamRow, makeLink, sendLinkMail, lc, ownerEmail, EMAIL_RE };
