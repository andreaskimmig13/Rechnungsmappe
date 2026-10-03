# Rechnungsmappe

Eine App für Arztrechnungen von Privatversicherten. Du erfasst die Rechnungen der Familie und siehst pro Person, ob sich das Einreichen lohnt oder ob die Beitragsrückerstattung nach Steuer mehr bringt.

## Datenschutz

- **Alle Daten bleiben auf dem Gerät.** Rechnungen, Fotos und Tarife liegen in IndexedDB, verschlüsselt mit AES-256-GCM. Der Schlüssel wird aus deiner PIN abgeleitet (PBKDF2, 310.000 Runden) und nur im Arbeitsspeicher gehalten, solange die App entsperrt ist.
- **Dieses Repository enthält nur Programmcode**, keine persönlichen Daten.
- **KI-Auslesen ist freiwillig.** Es läuft nur auf Knopfdruck und nur mit deinem eigenen API-Schlüssel. Gesendet werden ausschließlich die Seitenbilder dieser einen Rechnung, entweder an Google Gemini oder an Anthropic Claude.
- **Texterkennung auf dem Gerät.** Dafür wird Tesseract.js beim ersten Gebrauch von cdn.jsdelivr.net geladen und danach offline zwischengespeichert. Die Bilder verlassen das Gerät dabei nicht.
- **Backups** sind Dateien, die mit einem eigenen Passwort verschlüsselt sind.

## Installation (Android)

1. Öffne die Seite in Chrome.
2. Tippe auf „Installieren“ oder im Menü ⋮ auf „App installieren“.

## Technik

Die App besteht nur aus statischem HTML, CSS und JavaScript, ohne Build-Schritt. Sie läuft auf GitHub Pages. Mitgeliefert werden pdf.js (Apache 2.0), pdf-lib (MIT) sowie die Schriften Bricolage Grotesque, Instrument Sans und IBM Plex Mono (alle SIL OFL 1.1).

Alle Berechnungen sind Schätzungen. Maßgeblich sind die Tarifbedingungen und der Steuerbescheid.
