# ONLION Onboarding · KI-Telefon-Agent

Web-App für die Kundenaufnahme. Mit ihr erfasst du Fragenkatalog, Datenschutz und AVV, lässt Kunde und ONLION auf dem Bildschirm unterschreiben (mit Zeitstempel und SHA-256-Prüfsumme) und erzeugst ein PDF. Die App lässt sich auf dem iPad wie eine eigene App installieren.

**Technik:** statische Web-App auf Netlify, Datenbank und Login über Supabase (Region Frankfurt). Es braucht keinen Build-Schritt.

---

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf supabase.com ein Konto anlegen und dann **New project** wählen.
2. Region in der EU wählen (Frankfurt oder Irland), Datenbank-Passwort sicher ablegen.
3. Links **SQL Editor** → **New query** öffnen, den Inhalt von `supabase/schema.sql` einfügen und auf **Run** klicken.
   Das legt die Tabelle und die Startdaten an: Vorlage mit 28 Fragen, Rechtstext-Entwürfe und den Kunden VR-ImmoService.
4. Danach eine neue Query mit dem Inhalt von `supabase/team.sql` ausführen. Vorher prüfen: Die E-Mail in der Zeile `insert into public.team` muss deine Login-Adresse sein und genau `ALLOWED_USER_EMAIL` in Netlify entsprechen. Das legt die Team-Liste an und sorgt dafür, dass nur Konten aus dem Team Daten sehen.

### 2. Login und Team
1. Unter **Authentication → Sign In / Providers** den Schalter **„Allow new users to sign up“ ausschalten**. Je nach Dashboard-Version kann der Menüpunkt leicht anders heißen.
2. Unter **Authentication → Users** auf **Add user** klicken, deine E-Mail und ein starkes Passwort eintragen und „Auto confirm“ anhaken.
3. Unter **Authentication → URL Configuration** als **Site URL** die App-Adresse eintragen (`https://kionboarding.netlify.app`). Dorthin führen die Links aus Einladungs- und Passwort-E-Mails. Kommt später eine eigene Domain dazu (z. B. `onboarding.onlionapp.de`), diese unter **Redirect URLs** als `https://onboarding.onlionapp.de/**` ergänzen und in Netlify `APP_URL` auf diese Adresse setzen.
4. Optional unter **Authentication → Providers → Email** die Gültigkeit der E-Mail-Links (Email OTP Expiration) auf bis zu 86400 Sekunden (24 Stunden) erhöhen. Standard ist eine Stunde.

Weitere Personen (z. B. Partner) lädst du in der App unter **Konto & Team** ein. Die Registrierung bleibt aus; niemand kann sich selbst ein Konto anlegen.

### 3. Zugang in die App eintragen
1. In Supabase **Project Settings → API** öffnen.
2. **Project URL** und den **anon public**-Schlüssel kopieren.
3. Beides in `config.js` eintragen.

Den **service_role**-Schlüssel nie in die App eintragen.

### 4. GitHub und Netlify
1. Auf github.com im Konto **Onlion2025** auf **New repository** klicken. Name `onlion-onboarding` eintragen, **Private** wählen und das Repository anlegen.
2. Dort auf **uploading an existing file** klicken, alle Dateien aus diesem Ordner hineinziehen (inklusive Ordner `supabase`) und **Commit changes** klicken.
3. In Netlify **Add new site → Import an existing project → GitHub** wählen und `onlion-onboarding` auswählen. Build-Befehl leer lassen, Publish-Verzeichnis `.`, dann **Deploy**.
4. Optional unter **Domain management** die Adresse `onboarding.onlionapp.de` einrichten.

Jede spätere Änderung, zum Beispiel an `config.js`, in GitHub speichern. Netlify veröffentlicht dann automatisch neu, das dauert etwa eine Minute.

### Test
- Unter **Konto & Team** eine Probeeinladung an eine zweite eigene Adresse schicken, Link öffnen, Passwort festlegen. Danach den Zugang wieder entfernen.
- Die Netlify-Adresse öffnen. Es erscheint die Anmeldung mit ONLION-Logo.
- Mit dem Nutzer aus Schritt 2 anmelden. Links sollte der Kunde **VR-ImmoService GmbH** stehen.

### Fehlersuche
- **„Einrichtung fehlt“:** `config.js` ist noch nicht ausgefüllt oder noch nicht neu veröffentlicht.
- **„Anmeldung fehlgeschlagen“:** E-Mail oder Passwort falsch, oder der Nutzer ist nicht bestätigt („Auto confirm“).
- **Keine Kunden, keine Fragen:** `supabase/schema.sql` wurde nicht oder nicht vollständig ausgeführt.

### 5. Auf dem iPad installieren
Die Adresse in **Safari** öffnen, dann **Teilen → Zum Home-Bildschirm**. Die App startet danach im Vollbild mit ONLION-Symbol.

### 6. E-Mail-Versand (Brevo)
1. In Brevo unter **Senders, Domains & Dedicated IPs** deine Absender-Domain verifizieren (SPF, DKIM, DMARC). Ohne diesen Schritt landen die Mails im Spam.
2. Unter **SMTP & API → API Keys** einen neuen Schlüssel erzeugen.
3. Den Schlüssel nur in Netlify eintragen (siehe Schritt 7), nie in `config.js`.

### 7. Einstellungen in Netlify (Environment variables)
In Netlify unter **Site configuration → Environment variables** diese Werte anlegen und danach neu veröffentlichen („Trigger deploy“):

| Name | Inhalt |
| --- | --- |
| `SUPABASE_URL` | dieselbe Project URL wie in `config.js` |
| `SUPABASE_ANON_KEY` | derselbe anon public Key wie in `config.js` |
| `BREVO_API_KEY` | API-Schlüssel aus Brevo |
| `BREVO_SENDER_EMAIL` | verifizierte Absenderadresse, z. B. info@deine-domain.de |
| `BREVO_SENDER_NAME` | `ONLION` |
| `ALLOWED_USER_EMAIL` | die E-Mail des Inhaber-Kontos. Nur dieses Konto darf das Team verwalten. |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role**-Schlüssel aus Supabase (Project Settings → API). Nur hier eintragen, als Secret markieren, nie in `config.js`. Wird für Einladungen, „Passwort vergessen?“ und die Team-Prüfung gebraucht. |
| `OWNER_EMAIL` | deine Adresse für eine Blindkopie jeder Mail |
| `REPLY_TO_EMAIL` | optional: Adresse für Antworten |
| `APP_URL` | optional: eigene App-Adresse für Links in E-Mails. Ohne Angabe gilt die Netlify-Adresse. |

Jede Anfrage an Brevo prüft vorher, dass ein Konto aus dem Team angemeldet ist. Die Schlüssel verlassen den Server nie.

### Update: Vertriebspartner und Provisionen (Oktober 2026)
1. In Supabase `supabase/vertrieb.sql` ausführen (nach `team.sql`). Kontrolle am Ende: 8 Policies auf `docs`, 3 auf `team`.
2. In der App unter **Vertrieb → Provisionsmodell** die Absenderdaten für Gutschriften eintragen (Anschrift, Steuer-Nr./USt-ID).
3. Erst Partner einladen, wenn der Partnervertrag unterschrieben ist.

### Update einer bestehenden Installation (Team-Zugang, Oktober 2026)
1. In Supabase `supabase/team.sql` ausführen (E-Mail in der Insert-Zeile vorher prüfen).
2. In Supabase die **Site URL** setzen (siehe Schritt 2.3), optional die Link-Gültigkeit erhöhen (2.4).
3. In Netlify `SUPABASE_SERVICE_ROLE_KEY` als Secret anlegen und **Trigger deploy** klicken.
4. Test: wie oben, Probeeinladung schicken.

---

## Bedienung
- **Neuer Kunde** legst du links in der Seitenleiste an. Die Übersicht zeigt den Fahrplan in fünf Etappen.
- **Fragenkatalog:** Antworten werden automatisch gespeichert. Fragen mit ★ klärst du im Termin.
- **Datenschutz & AVV:** links die Angaben, rechts die Live-Vorschau der Rechtstexte.
- **Unterschrift:** Kunde und ONLION unterschreiben. Danach ist die Akte gesperrt. Ändern geht nur über **Neue Version starten**.
- **PDF:** Zusammenfassung mit Logo, Antworten, AVV, Unterschriften und Prüfsumme. Direkt per E-Mail an den Kunden senden, mit Kopie an dich, oder nur speichern.
- **Angebot:** Preisstaffel nach Firmengröße wählen (Einrichtung + monatliche Lizenz) oder Positionen frei anlegen, Preise anpassen, Summen mit 19 % USt sehen. Das verbindliche Angebot und die Rechnung erstellst du in deinem Buchhaltungsprogramm.
- **Gesprächsfortschritt:** Prozentbalken über Stammdaten, Fragen und Datenschutz-Pflichtangaben. Offene ★-Fragen werden einzeln genannt.
- **Vorlagen & Rechtstexte:** Fragen und Texte bearbeiten. Die Änderungen gelten für alle Kunden.
- **Vertrieb (CRM)** oben in jeder Kundenakte: Status *Neu → Angerufen → Termin vereinbart → Unterschrieben → Abgeschlossen* oder *Verloren*, Termin, Wiedervorlage, Quelle und Gesprächsprotokoll. „Unterschrieben“ setzt die App automatisch bei der Unterschrift; ein Anruf-Eintrag setzt „Angerufen“, ein Termin-Datum „Termin vereinbart“. Jeder Statuswechsel wird mit Zeit gespeichert.
- **Dashboard:** Kunden gesamt, Abschlüsse, Abschlussquote, offene und abgeschlossene Angebotssummen (netto), Anzahl je Status mit Filter, Trichter vom Kontakt zum Abschluss, nächste Termine, fällige Wiedervorlagen und Kundenliste. Es braucht keine Einrichtung; die Zahlen kommen aus den Kundenakten.
- **Vertrieb (nur ONLION):**
  - *Partner:* Partner einladen (mit „geworben von“), Partnerbaum, Anschrift, Steuerstatus (Kleinunternehmer), Status aktiv/inaktiv, Sonderkondition je Partner, Vorschläge von Partnern übernehmen.
  - *Provisionsmodell:* Prozente für Verkäufer, Ebene 1 und Ebene 2 auf Einrichtung und Lizenz, Laufzeit der Lizenzprovision und die Aktivitätsbedingung als Entwurf ändern und „ab Datum“ freigeben. Jede Version bleibt gespeichert; jede Provision merkt sich ihre Version. Dazu Preisstaffeln und Absender der Gutschriften.
  - *Zahlungen:* Lizenzmonat für alle abgeschlossenen Kunden auf einmal verbuchen; Einzelzahlungen und Storno in der Kundenakte.
  - *Abrechnung:* je Monat eine Gutschrift (PDF) je Partner, mit 19 % USt oder ohne bei Kleinunternehmern; danach „ausgezahlt“ markieren. Storno nach Auszahlung wird als Rückforderung auf die nächste Gutschrift gebucht.
- **Provisionen werden nur aus verbuchten Zahlungseingängen berechnet**, nie fürs Anwerben. Anteile aus Ebene 1 und 2 nur bei eigenem bezahlten Abschluss im laufenden oder vorigen Quartal (einstellbar).
- **Vertriebspartner** sehen nur ihre eigenen Kunden (die sie anlegen oder die ihnen zugeordnet sind), ihre Konditionen, ihr Provisionskonto, ihre Gutschriften und die Namen ihrer Struktur. Keine Zahlungen, keine fremden Kunden, keine Vorlagen-Bearbeitung. Das sichert die Datenbank ab (`supabase/vertrieb.sql`).
- **Konto & Team:** eigenes Passwort ändern (mit aktuellem Passwort bestätigt). Als Inhaber Personen per E-Mail einladen, den Link erneut senden oder den Zugang entfernen. Eingeladene legen ihr Passwort über den Link selbst fest und sehen alle Kunden.
- **Passwort vergessen?** auf der Anmeldeseite schickt einen Link zum Neusetzen, aber nur an Adressen aus dem Team.

## Wichtig
- Die **Rechtstexte sind Entwürfe**. Lass sie vor dem ersten echten Einsatz anwaltlich prüfen.
- Schließe mit Supabase einen **Auftragsverarbeitungsvertrag (DPA)** ab. Das geht im Supabase-Dashboard.
- Ein Backup ist im Free-Tarif von Supabase nicht automatisch enthalten. Für den Dauerbetrieb lohnt sich der Pro-Tarif.

- Mit **Brevo** ebenfalls einen Auftragsverarbeitungsvertrag abschließen.
- Die Preisstaffeln pflegst du unter Vertrieb → Provisionsmodell. Pro Kunde lassen sich die Preise im Angebot anpassen.

## Aufbau
- `index.html`: die App. Sie läuft im Browser und braucht keinen Build-Schritt.
- `netlify/functions/send-pdf.js`: E-Mail-Versand über Brevo
- `netlify/functions/team.js`: Einladen und Entfernen (nur Inhaber)
- `netlify/functions/reset-password.js`: Link für „Passwort vergessen?“
- `supabase/team.sql`: Team-Liste und Zugriffsschutz
- `supabase/vertrieb.sql`: Rollen ONLION/Partner, Partnerdaten, Zugriffsregeln je Partner, Struktur-Abfrage
- `supabase/schema.sql`: Datenbank, Zugriffsschutz und Startdaten
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: Installation als App

## Nächste Ausbaustufen
- Weitere Vorlagen für andere ONLION-Produkte (z. B. KI-Backoffice, Roboter-Vertrieb)
- Anbindung an ein Buchhaltungsprogramm für Angebote und Rechnungen, sobald eines eingerichtet ist
