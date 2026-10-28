// „Passwort vergessen?“: schickt einen Link zum Neusetzen – nur an Konten aus dem Team.
// Die Antwort ist immer gleich und dauert immer mindestens gleich lang, damit niemand
// ausprobieren kann, welche Adressen existieren. Höchstens ein Link alle 5 Minuten pro Adresse.
const { json, parseBody, missingEnv, envHint, admin, teamRow, makeLink, sendLinkMail, lc, EMAIL_RE } = require('../lib/common');

const NEUTRAL = { ok: true, message: 'Wenn die Adresse zum Team gehört, ist ein Link unterwegs.' };
const COOLDOWN_MS = 5 * 60 * 1000;
const wait = ms => new Promise(r => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' });
  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL']);
  if (missing.length) return json(500, { error: envHint(missing) });

  const b = parseBody(event);
  const email = lc(b && b.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return json(400, { error: 'Bitte die E-Mail-Adresse prüfen.' });

  const started = Date.now();
  try {
    const row = await teamRow(email);
    const recent = row && row.last_reset && (Date.now() - new Date(row.last_reset).getTime()) < COOLDOWN_MS;
    if (row && !recent) {
      await admin('/rest/v1/team?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_reset: new Date().toISOString() })
      });
      const link = await makeLink('recovery', email);
      if (link.ok) {
        await sendLinkMail(email, 'Neues Passwort für die ONLION Onboarding-App',
          'Hallo,\nfür dein Konto in der ONLION Onboarding-App wurde ein neues Passwort angefordert. Über den Button legst du es fest.',
          'Neues Passwort festlegen', link.link);
      }
    }
  } catch (e) { /* bewusst still: gleiche Antwort für alle */ }
  const rest = Number(process.env.RESET_MIN_MS || 2500) - (Date.now() - started);
  if (rest > 0) await wait(rest);
  return json(200, NEUTRAL);
};
