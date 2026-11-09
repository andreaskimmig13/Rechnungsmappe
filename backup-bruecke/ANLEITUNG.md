# App-Backup-Brücke einrichten

Die Brücke legt automatische Backups von Rechnungsmappe und Trainingscoach in deinem Google Drive ab (Ordner „App-Backups“, je App die letzten 20 Stände). Einmalig etwa 10 Minuten am PC.

## 1. Script anlegen
1. [script.google.com](https://script.google.com) öffnen → **Neues Projekt**, Name z. B. „App-Backup-Brücke“.
2. Den gesamten Inhalt von `backup-bruecke.gs` in `Code.gs` einfügen (vorhandenen Inhalt ersetzen) und speichern.
3. Oben die Funktion **einrichten** auswählen → **Ausführen**. Google fragt nach Berechtigungen: bestätigen (bei „Google hat diese App nicht überprüft“ auf **Erweitert** → **Zu … wechseln**).

## 2. Als Web-App bereitstellen
1. **Bereitstellen** → **Neue Bereitstellung** → Zahnrad → **Web-App**.
2. Ausführen als: **Ich**, Zugriff: **Jeder** → **Bereitstellen**.

„Zugriff: Jeder“ ist nötig, damit die Apps die Brücke ohne Google-Anmeldung erreichen. Ohne den geheimen Schlüssel im Code nimmt sie nichts an und gibt nichts heraus.

## 3. Code holen und in die Apps eintragen
1. Oben die Funktion **backupCode** auswählen → **Ausführen**. Im Protokoll steht der Brücken-Code.
2. **Rechnungsmappe** → Einstellungen → Backup: Code einfügen → **Automatisches Backup einrichten**. Die App ergänzt ihn um einen geheimen Teil und zeigt den **vollständigen Backup-Code**.
3. Den vollständigen Code im **Google Passwortmanager** speichern.
4. **Trainingscoach** → Einstellungen → Automatisches Backup: denselben vollständigen Code einfügen → **Speichern & testen**.

## Neues Handy
App öffnen → (Rechnungsmappe: neue PIN festlegen) → **Aus Google Drive wiederherstellen** → vollständigen Code aus dem Passwortmanager einfügen.

Notfalls ohne Brücke: Die Backups liegen als Dateien in Drive → „App-Backups“. Trainingscoach-Dateien lassen sich über „Backup laden“ einlesen. Rechnungsmappe-Backups sind mit dem geheimen Teil des Codes verschlüsselt (der Teil nach dem letzten #) und lassen sich über „Backup oder Import laden“ mit diesem Teil als Passwort öffnen.
