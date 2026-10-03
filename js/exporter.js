// Einreichungspaket: ausgewählte Rechnungen als ein PDF, plus Teilen/Speichern von Dateien.
import { fmtEur, fmtDate, catLabel } from "./calc.js";

let libP = null;
function getPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!libP) libP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = new URL("../vendor/pdf-lib.min.js", import.meta.url).href;
    s.onload = () => res(window.PDFLib); s.onerror = () => { libP = null; rej(new Error("pdf-lib")); };
    document.head.append(s);
  });
  return libP;
}

// WinAnsi kann keine Sonderzeichen außerhalb Latin-1 (+€); alles andere ersetzen
const safe = s => String(s ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/[^\x20-\x7E -ÿ€]/g, "?");

export async function buildPackage({ person, year, invoices, getBlob }) {
  const { PDFDocument, StandardFonts, rgb } = await getPdfLib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];

  // Deckblatt
  let page = doc.addPage(A4);
  let y = 780;
  const text = (t, x, size = 11, f = font, color = rgb(0.06, 0.12, 0.2)) => page.drawText(safe(t), { x, y, size, font: f, color });
  text("Einreichung von Arztrechnungen", 56, 20, bold); y -= 28;
  text(`${person.name} · ${person.insurer} ${person.tariff}`, 56, 12); y -= 18;
  text(`Behandlungsjahr ${year} · erstellt am ${fmtDate(new Date().toISOString().slice(0, 10))}`, 56, 11, font, rgb(0.35, 0.4, 0.47)); y -= 36;
  text("Datum", 56, 10, bold); text("Leistungserbringer", 130, 10, bold); text("Betrag", 480, 10, bold); y -= 16;
  let sum = 0;
  for (const i of invoices) {
    if (y < 80) { page = doc.addPage(A4); y = 780; }
    text(fmtDate(i.datum), 56, 10);
    text(String(i.arzt || "").slice(0, 60), 130, 10);
    const amt = fmtEur(i.betrag);
    page.drawText(safe(amt), { x: 539 - font.widthOfTextAtSize(safe(amt), 10), y, size: 10, font });
    y -= 13;
    text(catLabel(i.kategorie), 130, 8, font, rgb(0.35, 0.4, 0.47));
    y -= 16;
    sum += Number(i.betrag) || 0;
  }
  y -= 6;
  page.drawLine({ start: { x: 56, y: y + 10 }, end: { x: 539, y: y + 10 }, thickness: 0.6, color: rgb(0.6, 0.65, 0.7) });
  text(`${invoices.length} Rechnungen`, 56, 11, bold);
  const s = fmtEur(sum);
  page.drawText(safe(s), { x: 539 - bold.widthOfTextAtSize(safe(s), 11), y, size: 11, font: bold });

  // Rechnungen
  for (const i of invoices) {
    if (i.original?.type === "application/pdf") {
      const b = await getBlob(i.original.id);
      if (b) {
        try {
          const src = await PDFDocument.load(await b.arrayBuffer(), { ignoreEncryption: true });
          const copied = await doc.copyPages(src, src.getPageIndices());
          copied.forEach(p => doc.addPage(p));
          continue;
        } catch { /* fällt auf Seitenbilder zurück */ }
      }
    }
    for (const pg of i.pages || []) {
      const b = await getBlob(pg.id);
      if (!b) continue;
      const bytes = new Uint8Array(await b.arrayBuffer());
      const img = b.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const p = doc.addPage(A4);
      const m = 24, maxW = A4[0] - 2 * m, maxH = A4[1] - 2 * m;
      const k = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * k, h = img.height * k;
      p.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
    }
  }
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

// Datei teilen (Android: an die Versicherungs-App, Mail, Drive) oder speichern
export async function shareOrSave(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "saved";
}
