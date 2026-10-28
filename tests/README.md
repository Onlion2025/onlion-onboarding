# Tests
- Einmalig in diesem Ordner: `npm i jspdf@2.5.1`; dazu Python-Playwright mit Chromium.
- `python3 test_full.py` – Ende-zu-Ende-Test der App mit nachgebautem Supabase (26 Prüfungen).
- `node test_functions.js` – Netlify Function send-pdf mit nachgebautem fetch.
- `python3 pdf_sample.py` – erzeugt sample.pdf mit Testdaten zur Sichtprüfung des PDF-Layouts.
- Startdaten liegen als seed_*.json hier. Der App-Pfad (APP=…) steht oben in den Skripten.
