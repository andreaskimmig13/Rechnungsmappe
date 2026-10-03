// Fotos und PDFs vorbereiten, Text auf dem Gerät erkennen und Rechnungsfelder herauslesen.
import { CATS } from "./calc.js";

// ---------- Bilder ----------
export async function loadImage(blob) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch {}
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export function canvasToBlob(c, type = "image/jpeg", q = 0.86) {
  return new Promise(res => c.toBlob(res, type, q));
}

// Auf max. Kantenlänge verkleinern, optional drehen
export async function normalizeImage(blob, maxSide = 2200, rotate = 0) {
  const img = await loadImage(blob);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const rot = ((rotate % 360) + 360) % 360;
  const c = document.createElement("canvas");
  c.width = rot % 180 ? h : w; c.height = rot % 180 ? w : h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvasToBlob(c);
}

// Für die Texterkennung: Graustufen und mehr Kontrast
async function ocrPrep(blob) {
  const img = await loadImage(blob);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  const k = Math.min(1, 2400 / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140));
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// ---------- PDF ----------
let pdfjs = null;
async function getPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import("../vendor/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  return pdfjs;
}

// Liefert Seitenbilder (JPEG) und eingebetteten Text
export async function readPdf(file, maxPages = 6) {
  const lib = await getPdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  let text = "";
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    let lastY = null, line = "";
    for (const it of tc.items) {
      const y = Math.round(it.transform?.[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 2) { text += line.trim() + "\n"; line = ""; }
      line += it.str + " ";
      lastY = y;
    }
    text += line.trim() + "\n\n";
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 1800 / Math.max(vp0.width, vp0.height)) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push(await canvasToBlob(c));
  }
  return { pages, text: text.replace(/[ \t]+/g, " ").trim(), numPages: pdf.numPages };
}

// ---------- Texterkennung auf dem Gerät (Tesseract) ----------
const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let workerP = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load-failed")); document.head.append(s); });
}
async function getWorker(onProgress) {
  if (!workerP) {
    workerP = (async () => {
      if (!window.Tesseract) await loadScript(TESS);
      const w = await window.Tesseract.createWorker("deu", 1, {
        logger: m => { if (m.status && typeof m.progress === "number") onProgress?.(m); },
      });
      return w;
    })().catch(e => { workerP = null; throw e; });
  }
  return workerP;
}

export async function ocrImages(blobs, onProgress) {
  const w = await getWorker(onProgress);
  let text = "";
  for (let i = 0; i < blobs.length; i++) {
    onProgress?.({ status: `Seite ${i + 1} von ${blobs.length} lesen`, progress: i / blobs.length });
    const c = await ocrPrep(blobs[i]);
    const r = await w.recognize(c);
    text += (r.data?.text || "") + "\n\n";
  }
  return text;
}

// ---------- Felder aus dem Text herauslesen ----------
const AMT = /(\d{1,3}(?:[.\s]\d{3})*,\d{2})(?!\d)/g;
const DATE = /\b(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4}|\d{2})\b/g;
const toIso = (d, m, y) => {
  let yy = Number(y); if (yy < 100) yy += 2000;
  const dd = Number(d), mm = Number(m);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2000 || yy > 2100) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
};
const parseAmt = s => Number(s.replace(/[.\s]/g, "").replace(",", "."));
const datesIn = line => [...line.matchAll(DATE)].map(m => toIso(m[1], m[2], m[3])).filter(Boolean);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function parseInvoice(text, persons = []) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const out = { fields: {}, sure: {} };
  const today = new Date().toISOString().slice(0, 10);

  // Rechnungsdatum
  let datum = null, sureDate = false;
  for (const l of lines) {
    if (/rechnungsdatum|rechnung vom|datum der rechnung|^datum\b/i.test(l)) { const d = datesIn(l)[0]; if (d) { datum = d; sureDate = true; break; } }
  }
  if (!datum) {
    const all = lines.flatMap(datesIn).filter(d => d <= today);
    if (all.length) datum = all.sort().at(-1);
  }
  if (datum) { out.fields.datum = datum; out.sure.datum = sureDate; }

  // Zahlungsziel
  let faellig = null, sureDue = false;
  for (const l of lines) {
    if (/zahlbar bis|fällig|faellig|zahlungsziel|zahlen sie bis|bis spätestens|bis zum/i.test(l)) {
      const d = datesIn(l).find(x => !datum || x >= datum); if (d) { faellig = d; sureDue = true; break; }
    }
  }
  if (!faellig && datum) {
    const m = text.match(/innerhalb\s+(?:von\s+)?(\d{1,3})\s+tagen/i);
    if (m) { faellig = addDays(datum, Number(m[1])); sureDue = true; }
  }
  if (faellig) { out.fields.faellig = faellig; out.sure.faellig = sureDue; }

  // Betrag
  const KEY = /(rechnungsbetrag|gesamtbetrag|endbetrag|zu zahlen|zahlbetrag|gesamtsumme|summe|betrag|total)/i;
  let betrag = null, sureAmt = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (KEY.test(l) && !/mwst|ust|steuer|anzahlung|bereits/i.test(l)) {
      const a = [...l.matchAll(AMT)].map(m => parseAmt(m[1]));
      const next = lines[i + 1] ? [...lines[i + 1].matchAll(AMT)].map(m => parseAmt(m[1])) : [];
      const cand = a.length ? a.at(-1) : next[0];
      if (cand > 0) { betrag = cand; sureAmt = /rechnungsbetrag|gesamtbetrag|endbetrag|zu zahlen|zahlbetrag/i.test(l); break; }
    }
  }
  if (!betrag) {
    const all = [...text.matchAll(AMT)].map(m => parseAmt(m[1])).filter(x => x > 0 && x < 100000);
    if (all.length) betrag = Math.max(...all);
  }
  if (betrag) { out.fields.betrag = Math.round(betrag * 100) / 100; out.sure.betrag = sureAmt; }

  // Praxis
  const PRAX = /(praxis|dr\.|med\.|zentrum|mvz|klinik|klinikum|krankenhaus|apotheke|physio|radiolog|labor|zahnarzt|kieferorthop|orthopäd|kinderarzt|therapie|optik|gemeinschaftspraxis)/i;
  const head = lines.slice(0, 14).filter(l => /[a-zäöü]{3}/i.test(l) && !/rechnung\b|seite \d|privatpatient|patient|versichert|herrn|frau\b|iban|bic|telefon|tel\.|fax|e-mail|www\./i.test(l));
  const prax = head.find(l => PRAX.test(l));
  if (prax) { out.fields.arzt = prax.replace(/\s{2,}/g, " ").slice(0, 120); out.sure.arzt = false; }
  else if (head[0]) { out.fields.arzt = head[0].slice(0, 120); out.sure.arzt = false; }

  // Kategorie
  const t = text.toLowerCase();
  let kat = "ambulant";
  if (/zahnersatz|krone|implantat|brücke|prothese|kieferorthop|heil- und kostenplan/.test(t)) kat = "zahnersatz";
  else if (/\bgoz\b|zahnarzt|zahnärzt/.test(t)) kat = /prophylaxe|zahnreinigung|pzr|\b1040\b/.test(t) ? "zahnprophylaxe" : "zahn";
  else if (/logopäd|sprachtherap|sprechtherap|stimmtherap|schlucktherap/.test(t)) kat = "logopaedie";
  else if (/ergotherap|hirnleistungstraining/.test(t)) kat = "ergotherapie";
  else if (/physiotherap|krankengymnastik|manuelle therapie|massage|lymphdrainage|osteopath/.test(t)) kat = "heilmittel";
  else if (/apotheke|pzn/.test(t)) kat = "arznei";
  else if (/brille|brillengläser|kontaktlinse|optik/.test(t)) kat = "sehhilfe";
  else if (/krankenhaus|klinikum|stationär|wahlleistung|fallpauschale|drg/.test(t)) kat = "stationaer";
  else if (/impfung|impfstoff|vorsorgeuntersuchung|früherkennung|check-up|u\d{1,2}\b|j1\b/.test(t)) kat = "vorsorge";
  out.fields.kategorie = kat; out.sure.kategorie = false;

  if (kat === "logopaedie" || kat === "ergotherapie") { const pos = parsePositions(lines, kat); if (pos.length) { out.fields.positions = pos; out.sure.positions = false; } }

  // Person: zuerst in der Patientenzeile suchen, dann im ganzen Text
  const patLine = lines.find(l => /patient|behandelte person|für:/i.test(l)) || "";
  const nameRe = p => { const first = (p.name || "").trim(); return first.length > 2 ? new RegExp("\\b" + first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i") : null; };
  const inPat = persons.find(p => nameRe(p)?.test(patLine));
  if (inPat) { out.fields.personId = inPat.id; out.sure.personId = true; return out; }
  for (const p of persons) {
    const first = (p.name || "").split(/\s+/)[0];
    if (first && first.length > 2 && new RegExp("\\b" + first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text)) { out.fields.personId = p.id; out.sure.personId = true; break; }
  }
  return out;
}

export const CAT_KEYS = CATS.map(c => c.k);

// Leistungspositionen (Logopädie/Ergotherapie) der BBhV-Nummer zuordnen und zusammenfassen
export function guessCode(text, kat) {
  const t = text.toLowerCase();
  const min = Number((t.match(/(\d{2,3})\s*(?:min|minuten)/) || [])[1]) || 0;
  if (/hausbesuch/.test(t)) return "83";
  if (kat === "logopaedie") {
    if (/erstdiagnost|erstbefund|erstuntersuch|eingangsdiagnost/.test(t)) return "47";
    if (/bedarfsdiagnost|verlaufsdiagnost/.test(t)) return "48";
    if (/bericht/.test(t)) return "49";
    if (/grupp/.test(t)) return min >= 90 ? "52d" : "52b";
    if (/einzel|behandlung|therapie/.test(t)) return min >= 60 ? "51c" : min && min <= 30 ? "51a" : "51b";
  } else {
    if (/funktionsanalyse|erstgespräch|befunderhebung/.test(t)) return "53";
    if (/hirnleistung|neuropsych/.test(t)) return "58";
    if (/psychisch/.test(t)) return "54c";
    if (/sensomotor|perzept/.test(t)) return "54b";
    if (/motorisch|einzel|behandlung/.test(t)) return min >= 75 ? "54c" : min >= 60 ? "54b" : "54a";
  }
  return "";
}

export function parsePositions(lines, kat) {
  const KEY = kat === "logopaedie" ? /(diagnost|befund|einzel|grupp|behandlung|therapie|bericht|hausbesuch)/i : /(funktionsanalyse|erstgespräch|einzel|grupp|behandlung|therapie|hirnleistung|hausbesuch)/i;
  const groups = new Map();
  for (const l of lines) {
    if (!KEY.test(l) || /summe|gesamt|rechnungsbetrag|zu zahlen|mwst|ust/i.test(l)) continue;
    const amts = [...l.matchAll(AMT)].map(m => parseAmt(m[1])).filter(x => x > 0 && x < 2000);
    if (!amts.length) continue;
    let qty = Number((l.match(/(?:^|\s)(\d{1,2})\s*(?:x|×|mal)\s/i) || [])[1]) || 0;
    let price, total = amts.at(-1);
    if (amts.length >= 2 && amts[0] <= total) { price = amts[0]; if (!qty) qty = Math.max(1, Math.round(total / price)); }
    else { if (!qty) qty = 1; price = Math.round(total / qty * 100) / 100; }
    const code = guessCode(l, kat);
    const key = code + "|" + price;
    const g = groups.get(key) || { code, text: l.replace(AMT, "").replace(/\s{2,}/g, " ").trim().slice(0, 80), qty: 0, price };
    g.qty += qty;
    groups.set(key, g);
  }
  return [...groups.values()];
}
