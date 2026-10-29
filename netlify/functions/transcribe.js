// Sprachnotiz in Text umwandeln (ElevenLabs Speech-to-Text).
// Die Audiodatei liegt im geschützten Supabase-Speicher „sprachnotizen“ unter <kundenId>/<datei>.
// Zugriff: ONLION immer, Vertriebspartner nur für eigene Kunden.
const { json, requireUser, parseBody, missingEnv, envHint, admin, lc } = require('../lib/common');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' });
  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_USER_EMAIL', 'ELEVENLABS_API_KEY']);
  if (missing.length) return json(500, { error: envHint(missing) });

  const user = await requireUser(event);
  if (!user) return json(401, { error: 'Nicht berechtigt. Bitte neu anmelden.' });

  const b = parseBody(event);
  const cid = String((b && b.customerId) || '');
  const path = String((b && b.path) || '');
  if (!/^[\w-]{1,80}$/.test(cid) || !new RegExp('^' + cid + '/[\\w-]{1,80}\\.(webm|mp4|m4a|ogg|mp3|wav|aac)$').test(path)) return json(400, { error: 'Ungültige Anfrage.' });

  if (user.role === 'partner') {
    const r = await admin('/rest/v1/docs?select=data&collection=eq.customers&id=eq.' + encodeURIComponent(cid));
    const rows = r.ok ? await r.json().catch(() => []) : [];
    const owner = rows[0] && rows[0].data && lc(rows[0].data.partner);
    if (!owner || owner !== lc(user.email)) return json(403, { error: 'Kein Zugriff auf diesen Kunden.' });
  }

  const dl = await admin('/storage/v1/object/sprachnotizen/' + path.split('/').map(encodeURIComponent).join('/'), { headers: { 'content-type': 'application/octet-stream' } });
  if (!dl.ok) return json(404, { error: 'Aufnahme nicht gefunden.' });
  const buf = await dl.arrayBuffer();
  if (buf.byteLength > 25 * 1024 * 1024) return json(400, { error: 'Aufnahme zu groß.' });
  const type = (dl.headers && dl.headers.get && dl.headers.get('content-type')) || 'audio/webm';

  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'deu');
  form.append('file', new Blob([buf], { type }), path.split('/').pop());
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form });
  const t = await r.json().catch(() => ({}));
  const det = t.detail && (typeof t.detail === 'string' ? t.detail : (t.detail.message || t.detail.status || ''));
  if (!r.ok) return json(502, { error: 'Abschrift fehlgeschlagen: ' + (det || t.message || ('Status ' + r.status)) });
  return json(200, { text: String(t.text || '').trim() });
};
