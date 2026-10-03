// Optionales Auslesen mit KI. Wird nur auf Knopfdruck aufgerufen; gesendet werden
// ausschließlich die Seitenbilder (und ggf. der PDF-Text) dieser einen Rechnung.
import { CAT_KEYS } from "./scan.js";
import { b64 } from "./store.js";
import { BBHV } from "./calc.js";

export const PROVIDERS = {
  claude: { label: "Claude (Anthropic)", note: "ca. 0,3 Cent pro Rechnung · auch privat erlaubt", keyHint: "Schlüssel aus platform.claude.com", models: ["claude-haiku-4-5-20251001"] },
  gemini: { label: "Google Gemini", note: "laut Google nur für berufliche Nutzung", keyHint: "Schlüssel aus aistudio.google.com", models: ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest"] },
};

function prompt(persons, pdfText) {
  const names = persons.map(p => p.name).filter(Boolean).join(", ") || "–";
  return `Du liest eine deutsche Rechnung für Privatversicherte (Arzt, Zahnarzt, Therapeut, Apotheke, Krankenhaus; meist nach GOÄ/GOZ).
Personen im Haushalt: ${names}.
${pdfText ? `Eingebetteter Text der Rechnung:\n"""\n${pdfText.slice(0, 12000)}\n"""\n` : ""}
Antworte ausschließlich mit einem JSON-Objekt:
{"datum":"YYYY-MM-DD","arzt":"Praxis oder Name","betrag":123.45,"faellig":"YYYY-MM-DD","patient":"Vorname","kategorie":"ambulant","kurz":"kurze Beschreibung","positionen":[{"text":"Einzelbehandlung 45 Min.","anzahl":10,"einzelpreis":85.00,"bbhv":"51b"}]}
Regeln: datum = Rechnungsdatum. betrag = zu zahlender Gesamtbetrag in Euro als Zahl. faellig = Zahlungsziel; steht dort "innerhalb von N Tagen", rechne es aus; sonst null. patient = behandelte Person, möglichst einer der Haushaltsnamen, sonst null. kategorie = genau einer von: ${CAT_KEYS.join(", ")} (vorsorge = Vorsorgeuntersuchung, Schutzimpfung, professionelle Zahnreinigung). kurz = höchstens 8 Wörter, z. B. "MRT Knie". Unlesbare Felder = null.
positionen: NUR bei Logopädie oder Ergotherapie, sonst []. Fasse gleiche Leistungen mit gleichem Einzelpreis zu einer Position zusammen (anzahl = Anzahl der Termine). bbhv = passende Nummer aus Anlage 9 BBhV oder null: ${BBHV.items.map(x => `${x.code} ${x.l}`).join("; ")}.`;
}

const blobToB64 = async b => b64(new Uint8Array(await b.arrayBuffer()));

function parseJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new AIError("bad-answer", "Die KI-Antwort war unvollständig.");
  return JSON.parse(text.slice(s, e + 1));
}

export class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function httpError(status, body) {
  if (status === 400 && /api key|API_KEY/i.test(body)) return new AIError("key", "Der API-Schlüssel ist ungültig.");
  if (status === 401 || status === 403) return new AIError("key", "Der API-Schlüssel ist ungültig oder hat keinen Zugriff.");
  if (status === 404) return new AIError("model", "Das KI-Modell ist nicht verfügbar.");
  if (status === 429) return new AIError("limit", "Das kostenlose Limit ist gerade erreicht. Versuch es in ein paar Minuten noch einmal.");
  if (status >= 500) return new AIError("server", "Der KI-Dienst ist gerade nicht erreichbar.");
  return new AIError("other", `Fehler ${status} vom KI-Dienst.`);
}

async function callGemini(key, model, images, text) {
  const parts = [{ text }];
  for (const img of images) parts.push({ inline_data: { mime_type: "image/jpeg", data: await blobToB64(img) } });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
  });
  const body = await r.text();
  if (!r.ok) throw httpError(r.status, body);
  const j = JSON.parse(body);
  const out = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  return parseJson(out);
}

async function callClaude(key, model, images, text) {
  const content = [];
  for (const img of images) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await blobToB64(img) } });
  content.push({ type: "text", text });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content }] }),
  });
  const body = await r.text();
  if (!r.ok) throw httpError(r.status, body);
  const j = JSON.parse(body);
  return parseJson((j.content || []).map(c => c.text || "").join(""));
}

export async function aiRead({ provider, apiKey, model }, images, persons, pdfText = "") {
  if (!apiKey) throw new AIError("nokey", "Trag zuerst in den Einstellungen einen API-Schlüssel ein.");
  if (!navigator.onLine) throw new AIError("offline", "Du bist offline. Das KI-Auslesen braucht eine Internetverbindung.");
  const P = PROVIDERS[provider] || PROVIDERS.claude;
  const text = prompt(persons, pdfText);
  const imgs = images.slice(0, 3);
  const models = [model, ...P.models].filter((m, i, a) => m && a.indexOf(m) === i);
  let last;
  for (const m of models) {
    try {
      const r = provider === "claude" ? await callClaude(apiKey, m, imgs, text) : await callGemini(apiKey, m, imgs, text);
      return normalize(r, persons);
    } catch (e) {
      last = e;
      if (!(e instanceof AIError && e.code === "model")) break;
    }
  }
  if (last instanceof AIError) throw last;
  throw new AIError("network", "Keine Verbindung zum KI-Dienst.");
}

function normalize(r, persons) {
  const iso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null;
  const fields = {};
  if (iso(r.datum)) fields.datum = r.datum;
  if (iso(r.faellig)) fields.faellig = r.faellig;
  if (r.arzt) fields.arzt = String(r.arzt).slice(0, 120);
  const b = typeof r.betrag === "string" ? Number(r.betrag.replace(/\./g, "").replace(",", ".")) : Number(r.betrag);
  if (b > 0) fields.betrag = Math.round(b * 100) / 100;
  if (CAT_KEYS.includes(r.kategorie)) fields.kategorie = r.kategorie;
  if (r.kurz) fields.notiz = String(r.kurz).slice(0, 200);
  if (Array.isArray(r.positionen) && r.positionen.length) {
    const pos = r.positionen.map(x => ({ code: BBHV.items.some(b => b.code === String(x.bbhv)) ? String(x.bbhv) : "", text: String(x.text || "").slice(0, 80), qty: Number(x.anzahl) || 1, price: Number(String(x.einzelpreis).replace(",", ".")) || 0 })).filter(x => x.price > 0);
    if (pos.length) fields.positions = pos;
  }
  if (r.patient) {
    const pt = String(r.patient).toLowerCase();
    const p = persons.find(p => p.name && (p.name.toLowerCase().includes(pt) || pt.includes(p.name.toLowerCase().split(" ")[0])));
    if (p) fields.personId = p.id;
  }
  return fields;
}
