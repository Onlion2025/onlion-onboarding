# Tests
- Einmalig in diesem Ordner: `npm i jspdf@2.5.1`; dazu Python-Playwright mit Chromium.
- `python3 test_full.py` – Ende-zu-Ende-Test der App mit nachgebautem Supabase (39 Prüfungen, inkl. Konto & Team).
- `node test_functions.js` – Netlify Functions send-pdf, team und reset-password mit nachgebautem fetch.
- `python3 pdf_sample.py` – erzeugt sample.pdf mit Testdaten zur Sichtprüfung des PDF-Layouts.
- Startdaten liegen als seed_*.json hier. Der App-Pfad (APP=…) steht oben in den Skripten.
