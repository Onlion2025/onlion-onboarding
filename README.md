# ONLION Onboarding · KI-Telefon-Agent

Web-App für die Kundenaufnahme. Mit ihr erfasst du Fragenkatalog, Datenschutz und AVV, lässt Kunde und ONLION auf dem Bildschirm unterschreiben (mit Zeitstempel und SHA-256-Prüfsumme) und erzeugst ein PDF. Die App lässt sich auf dem iPad wie eine eigene App installieren.

**Technik:** statische Web-App auf Netlify, Datenbank und Login über Supabase (Region Frankfurt). Es braucht keinen Build-Schritt.

---

## Einrichtung (einmalig, ca. 20 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf supabase.com ein Konto anlegen und dann **New project** wählen.
2. **Region: Central EU (Frankfurt)** wählen, Datenbank-Passwort sicher ablegen.
3. Links **SQL Editor** → **New query** öffnen, den Inhalt von `supabase/schema.sql` einfügen und auf **Run** klicken.
   Das legt die Tabelle, den Zugriffsschutz und die Startdaten an: Vorlage mit 28 Fragen, Rechtstext-Entwürfe und den Kunden VR-ImmoService.

### 2. Login nur für dich
1. Unter **Authentication → Sign In / Providers** den Schalter **„Allow new users to sign up“ ausschalten**. Je nach Dashboard-Version kann der Menüpunkt leicht anders heißen.
2. Unter **Authentication → Users** auf **Add user** klicken, deine E-Mail und ein starkes Passwort eintragen und „Auto confirm“ anhaken.

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
- Die Netlify-Adresse öffnen. Es erscheint die Anmeldung mit ONLION-Logo.
- Mit dem Nutzer aus Schritt 2 anmelden. Links sollte der Kunde **VR-ImmoService GmbH** stehen.

### Fehlersuche
- **„Einrichtung fehlt“:** `config.js` ist noch nicht ausgefüllt oder noch nicht neu veröffentlicht.
- **„Anmeldung fehlgeschlagen“:** E-Mail oder Passwort falsch, oder der Nutzer ist nicht bestätigt („Auto confirm“).
- **Keine Kunden, keine Fragen:** `supabase/schema.sql` wurde nicht oder nicht vollständig ausgeführt.

### 5. Auf dem iPad installieren
Die Adresse in **Safari** öffnen, dann **Teilen → Zum Home-Bildschirm**. Die App startet danach im Vollbild mit ONLION-Symbol.

---

## Bedienung
- **Neuer Kunde** legst du links in der Seitenleiste an. Die Übersicht zeigt den Fahrplan in fünf Etappen.
- **Fragenkatalog:** Antworten werden automatisch gespeichert. Fragen mit ★ klärst du im Termin.
- **Datenschutz & AVV:** links die Angaben, rechts die Live-Vorschau der Rechtstexte.
- **Unterschrift:** Kunde und ONLION unterschreiben. Danach ist die Akte gesperrt. Ändern geht nur über **Neue Version starten**.
- **PDF:** Zusammenfassung mit Logo, Antworten, AVV, Unterschriften und Prüfsumme.
- **Vorlagen & Rechtstexte:** Fragen und Texte bearbeiten. Die Änderungen gelten für alle Kunden.

## Wichtig
- Die **Rechtstexte sind Entwürfe**. Lass sie vor dem ersten echten Einsatz anwaltlich prüfen.
- Schließe mit Supabase einen **Auftragsverarbeitungsvertrag (DPA)** ab. Das geht im Supabase-Dashboard.
- Ein Backup ist im kostenlosen Supabase-Tarif nicht automatisch enthalten. Für den Dauerbetrieb lohnt sich der Pro-Tarif.

## Geplant
- **Stufe 2:** PDF per E-Mail über Brevo verschicken. Dafür kommt eine Netlify Function dazu, der Schlüssel liegt nur auf dem Server.
- **Stufe 3:** Angebot und Rechnung über die Lexware-Office-Schnittstelle. Damit sind Nummernkreis, Archiv und E-Rechnung rechtssicher.
- Weitere Vorlagen für andere ONLION-Produkte.
