# Tests
- Einmalig in diesem Ordner: `npm i jspdf@2.5.1`; dazu Python-Playwright mit Chromium.
- `python3 test_full.py` – Ende-zu-Ende-Test der App mit nachgebautem Supabase (75 Prüfungen, inkl. CRM, Dashboard, Leads, Konto & Team).
- `node test_functions.js` – Netlify Functions send-pdf, team und reset-password mit nachgebautem fetch.
- `python3 pdf_sample.py` – erzeugt sample.pdf mit Testdaten zur Sichtprüfung des PDF-Layouts.
- Startdaten liegen als seed_*.json hier. Der App-Pfad (APP=…) steht oben in den Skripten.
- `python3 test_vertrieb.py` – Vertrieb: Provisionsmodell, Zahlungen, Provisionen, Gutschriften, Partner-Ansicht (63 Prüfungen, inkl. Sprachnotizen und Aktionen).
- `node test_rls.mjs` – Zugriffsregeln gegen echtes Postgres (PGlite, `npm i --no-save @electric-sql/pglite`), 45 Prüfungen, inkl. Speicher für Sprachnotizen.
