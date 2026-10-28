// Team verwalten: Personen einladen und entfernen. Nur das Inhaber-Konto darf das.
const { json, requireUser, parseBody, missingEnv, envHint, admin, teamRow, makeLink, sendLinkMail, lc, ownerEmail, EMAIL_RE } = require('../lib/common');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST erlaubt.' });
  const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_USER_EMAIL', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL']);
  if (missing.length) return json(500, { error: envHint(missing) });

  const user = await requireUser(event);
  if (!user) return json(401, { error: 'Nicht berechtigt. Bitte neu anmelden.' });
  if (user.role !== 'owner') return json(403, { error: 'Nur das Inhaber-Konto kann das Team verwalten.' });

  const b = parseBody(event);
  if (!b) return json(400, { error: 'Ungültige Anfrage.' });
  const email = lc(b.email);
  if (!EMAIL_RE.test(email) || email.length > 200) return json(400, { error: 'Bitte die E-Mail-Adresse prüfen.' });

  if (b.action === 'invite') {
    // 1) In die Team-Liste eintragen (vorhandene Einträge bleiben, Rolle wird nicht verändert)
    const existing = await teamRow(email);
    const role = b.role === 'partner' ? 'partner' : 'member';
    let sponsor = null;
    if (role === 'partner' && b.sponsor) {
      sponsor = lc(b.sponsor);
      const sp = await teamRow(sponsor);
      if (!sp || sp.role !== 'partner' || sponsor === email) return json(400, { error: 'Der gewählte Werber ist kein Vertriebspartner.' });
    }
    if (!existing) {
      const row = { email, role };
      if (role === 'partner') { row.sponsor = sponsor; if (b.name) row.name = String(b.name).slice(0, 120); }
      const ins = await admin('/rest/v1/team', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
      if (!ins.ok) return json(502, { error: role === 'partner' ? 'Eintrag fehlgeschlagen. Wurde supabase/vertrieb.sql ausgeführt?' : 'Eintrag in die Team-Liste fehlgeschlagen. Wurde supabase/team.sql ausgeführt?' });
    }
    // 2) Einladungslink erzeugen; gibt es das Konto schon, einen Passwort-Link
    let link = await makeLink('invite', email);
    let isRecovery = false;
    if (!link.ok && (link.status === 422 || /already/i.test(link.message))) { link = await makeLink('recovery', email); isRecovery = true; }
    if (!link.ok) return json(502, { error: 'Supabase konnte keinen Einladungslink erstellen: ' + (link.message || link.status) });
    if (link.userId) {
      await admin('/rest/v1/team?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: link.userId })
      }).catch(() => {});
    }
    // 3) Einladung per Brevo senden
    const mail = isRecovery
      ? await sendLinkMail(email, 'Dein Zugang zur ONLION Onboarding-App',
        'Hallo,\nhier ist ein neuer Link für deinen Zugang zur ONLION Onboarding-App. Über den Button legst du ein neues Passwort fest und bist danach angemeldet.',
        'Neues Passwort festlegen', link.link)
      : await sendLinkMail(email, 'Einladung zur ONLION Onboarding-App',
        (existing ? existing.role : role) === 'partner'
          ? 'Hallo,\ndu wurdest als Vertriebspartner zur ONLION Onboarding-App eingeladen. Dort legst du deine Kunden an, führst das Onboarding für den KI-Telefon-Agenten durch und siehst deine Provisionen. Über den Button legst du dein eigenes Passwort fest.'
          : 'Hallo,\ndu wurdest zur ONLION Onboarding-App für den KI-Telefon-Agenten eingeladen. Über den Button legst du dein eigenes Passwort fest und bist danach angemeldet.',
        'Passwort festlegen', link.link);
    if (!mail.ok) return json(502, { error: 'Eingetragen, aber die E-Mail wurde nicht versendet: ' + mail.message });
    return json(200, { ok: true });
  }

  if (b.action === 'remove') {
    if (email === ownerEmail() || email === lc(user.email)) return json(400, { error: 'Das Inhaber-Konto kann nicht entfernt werden.' });
    const row = await teamRow(email);
    if (!row) return json(404, { error: 'Diese Person steht nicht im Team.' });
    if (row.role === 'owner') return json(400, { error: 'Das Inhaber-Konto kann nicht entfernt werden.' });
    const del = await admin('/rest/v1/team?email=eq.' + encodeURIComponent(email), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!del.ok) return json(502, { error: 'Entfernen fehlgeschlagen.' });
    // Login-Konto ebenfalls löschen, damit keine Anmeldung mehr möglich ist
    if (row.user_id) await admin('/auth/v1/admin/users/' + encodeURIComponent(row.user_id), { method: 'DELETE' }).catch(() => {});
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unbekannte Aktion.' });
};
