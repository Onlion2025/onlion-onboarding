// „Passwort vergessen?“: schickt einen Link zum Neusetzen – nur an Konten aus dem Team.
// Die Antwort ist immer gleich, damit niemand ausprobieren kann, welche Adressen existieren.
const { json, parseBody, missingEnv, envHint, teamRow, makeLink, sendLinkMail, lc, EMAIL_RE } = require('../lib/common');

const NEUTRAL = { ok: true, message: 'Wenn die Adresse zum Team gehört, ist ein Link unterwegs.' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' });
  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL']);
  if (missing.length) return json(500, { error: envHint(missing) });

  const b = parseBody(event);
  const email = lc(b && b.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return json(400, { error: 'Bitte die E-Mail-Adresse prüfen.' });

  const row = await teamRow(email).catch(() => null);
  if (!row) return json(200, NEUTRAL);
  const link = await makeLink('recovery', email);
  if (link.ok) {
    await sendLinkMail(email, 'Neues Passwort für die ONLION Onboarding-App',
      'Hallo,\nfür dein Konto in der ONLION Onboarding-App wurde ein neues Passwort angefordert. Über den Button legst du es fest.',
      'Neues Passwort festlegen', link.link).catch(() => {});
  }
  return json(200, NEUTRAL);
};
