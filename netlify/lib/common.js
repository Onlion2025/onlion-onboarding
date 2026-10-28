// Gemeinsame Helfer für die Netlify Functions.
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(obj)
});

// Prüft das Supabase-Login-Token aus dem Authorization-Header.
// Nur das eigene Konto darf E-Mails senden.
async function requireUser(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user || !user.id) return null;
  // Nur das eigene Konto: schützt auch dann, wenn die Registrierung versehentlich offen ist.
  const allowed = String(process.env.ALLOWED_USER_EMAIL || '').trim().toLowerCase();
  if (!allowed || String(user.email || '').toLowerCase() !== allowed) return null;
  return user;
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch (e) { return null; }
}

function missingEnv(names) {
  return names.filter(n => !process.env[n]);
}

const envHint = missing => 'In Netlify fehlen Einstellungen: ' + missing.join(', ') + ' (siehe README, Schritt 7).';

module.exports = { json, requireUser, parseBody, missingEnv, envHint };
