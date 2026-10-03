// Service Worker: macht die App offline nutzbar. Er speichert nur Programmdateien,
// niemals Rechnungen (die liegen verschlüsselt in IndexedDB).
const VERSION = "rm-1.0.1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/store.js", "js/calc.js", "js/scan.js", "js/ai.js", "js/exporter.js",
  "vendor/pdf-lib.min.js", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs",
  "assets/fonts/BricolageGrotesque-Bold.ttf", "assets/fonts/InstrumentSans-Regular.ttf", "assets/fonts/InstrumentSans-Bold.ttf",
  "assets/fonts/IBMPlexMono-Regular.ttf", "assets/fonts/IBMPlexMono-Bold.ttf",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/maskable-512.png",
];
const RUNTIME = "rm-libs-v1";   // Texterkennung (einmal geladen, dann offline)
const LIB_HOSTS = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Programmdateien: zuerst aus dem Speicher, im Hintergrund aktualisieren
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const r = await net;
      return r || (req.mode === "navigate" ? c.match("index.html") : Response.error());
    }));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
  }
  // Alles andere (KI-Dienste) geht direkt ins Netz und wird nie gespeichert.
});
