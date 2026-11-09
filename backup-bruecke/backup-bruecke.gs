/**
 * App-Backup-Brücke
 *
 * Nimmt Backups von Trainingscoach und Rechnungsmappe entgegen und legt sie in deinem
 * Google Drive im Ordner „App-Backups“ ab (je App ein Unterordner). Pro App bleiben die
 * letzten 20 Stände erhalten, ältere landen im Papierkorb.
 *
 * Die Brücke speichert nur, was die Apps schicken. Das Backup der Rechnungsmappe ist
 * bereits in der App verschlüsselt; Google sieht davon nur eine unlesbare Datei.
 *
 * Einrichtung (ausführlich in der Anleitung):
 *  1. Oben im Editor die Funktion „einrichten“ auswählen und auf „Ausführen“ klicken.
 *     Google fragt beim ersten Mal nach Berechtigungen, die bestätigen.
 *  2. „Bereitstellen“ → „Neue Bereitstellung“ → Typ „Web-App“,
 *     „Ausführen als: Ich“, „Zugriff: Jeder“ → Bereitstellen.
 *  3. Die Funktion „backupCode“ ausführen. Im Protokoll steht dein Brücken-Code.
 *     Den in der Rechnungsmappe unter Einstellungen → Automatisches Backup einfügen.
 */

var BEHALTEN = 20;
var APPS = ['trainingscoach', 'rechnungsmappe'];
var ORDNER = 'App-Backups';

function einrichten() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('KEY')) p.setProperty('KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  var root = hauptordner_();
  APPS.forEach(function (a) { ordner_(a); });
  Logger.log('Brücke eingerichtet. Ordner in deinem Drive: „' + root.getName() + '“. Jetzt als Web-App bereitstellen und danach „backupCode“ ausführen.');
}

function backupCode() {
  var key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key) throw new Error('Bitte zuerst „einrichten“ ausführen.');
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Bitte zuerst als Web-App bereitstellen (Bereitstellen → Neue Bereitstellung).');
  url = url.replace(/\/dev$/, '/exec');
  Logger.log('Dein Brücken-Code (komplett kopieren):\n' + url + '#' + key);
  Logger.log('Falls die Adresse nicht auf /exec endet: unter Bereitstellen → Bereitstellungen verwalten die Web-App-URL kopieren und „#' + key + '“ anhängen.');
}

function doGet() {
  return out_({ ok: true, info: 'App-Backup-Brücke läuft.' });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var key = PropertiesService.getScriptProperties().getProperty('KEY');
    if (!key || req.key !== key) return out_({ error: 'Falscher Schlüssel' });
    var app = String(req.app || '');
    if (APPS.indexOf(app) < 0) return out_({ error: 'Unbekannte App' });
    var f = ordner_(app);

    if (req.action === 'test') {
      return out_({ ok: true, anzahl: liste_(f).length });
    }
    if (req.action === 'speichern') {
      if (typeof req.daten !== 'string' || !req.daten) return out_({ error: 'Keine Daten erhalten' });
      var name = app + '-backup_' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd_HH-mm-ss') + '.json';
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var file = f.createFile(Utilities.newBlob(req.daten, 'application/json', name));
        aufraeumen_(f);
        return out_({ ok: true, name: name, zeit: file.getDateCreated().toISOString(), groesse: file.getSize() });
      } finally {
        lock.releaseLock();
      }
    }
    if (req.action === 'liste') {
      return out_({ ok: true, backups: liste_(f).map(function (x) {
        return { id: x.getId(), name: x.getName(), zeit: x.getDateCreated().toISOString(), groesse: x.getSize() };
      }) });
    }
    if (req.action === 'laden') {
      var l = liste_(f);
      var file2 = req.id ? l.filter(function (x) { return x.getId() === req.id; })[0] : l[0];
      if (!file2) return out_({ error: 'Noch kein Backup vorhanden' });
      return out_({ ok: true, name: file2.getName(), zeit: file2.getDateCreated().toISOString(), daten: file2.getBlob().getDataAsString() });
    }
    return out_({ error: 'Unbekannte Aktion' });
  } catch (err) {
    return out_({ error: String((err && err.message) || err) });
  }
}

function hauptordner_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('ROOT');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var it = DriveApp.getRootFolder().getFoldersByName(ORDNER);
  var root = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ORDNER);
  p.setProperty('ROOT', root.getId());
  return root;
}

function ordner_(app) {
  var root = hauptordner_();
  var it = root.getFoldersByName(app);
  return it.hasNext() ? it.next() : root.createFolder(app);
}

// Neueste zuerst
function liste_(folder) {
  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var x = it.next();
    if (/-backup_.*\.json$/.test(x.getName())) out.push(x);
  }
  out.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  return out;
}

function aufraeumen_(folder) {
  liste_(folder).slice(BEHALTEN).forEach(function (x) { x.setTrashed(true); });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
