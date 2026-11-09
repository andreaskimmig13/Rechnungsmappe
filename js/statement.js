// Leistungsabrechnung der Versicherung auslesen und den eigenen Rechnungen zuordnen.
// Läuft komplett auf dem Gerät.
import { effDate } from "./calc.js";

const AMT = /(\d{1,3}(?:[.\s]\d{3})*,\d{2})(?!\d)/g;
const DATE = /\b(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4}|\d{2})\b/g;
const toIso = (d, m, y) => {
  let yy = Number(y); if (yy < 100) yy += 2000;
  const dd = Number(d), mm = Number(m);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2000 || yy > 2100) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
};
const parseAmt = s => Number(s.replace(/[.\s]/g, "").replace(",", "."));
const amountsIn = line => [...line.matchAll(AMT)].map(m => parseAmt(m[1]));
const datesIn = line => [...line.matchAll(DATE)].map(m => toIso(m[1], m[2], m[3])).filter(Boolean);
const r2 = n => Math.round(n * 100) / 100;
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;
const has = v => v !== null && v !== undefined && v !== "";

const TOTAL = /(auszahlung|überweis|ueberweis|erstattungsbetrag|gesamterstattung|zahlbetrag|gutschrift|wir erstatten|erstatten ihnen)/i;
const SKIP = /(summe|gesamt|zwischensumme|beitrag|übertrag|saldo|kontostand|iban|bic|telefon|seite\s+\d)/i;
const SB = /selbstbehalt|eigenanteil|selbstbeteiligung/i;

function nameOf(line) {
  return line.replace(DATE, " ").replace(AMT, " ").replace(/\b\d+([.,]\d+)?\s*%/g, " ").replace(/€|EUR\b/g, " ")
    .replace(/\b\d+\b/g, " ").replace(/[|;:_*]+/g, " ")
    .replace(/\b(rechnungsbetrag|rechnung vom|rechnung|betrag|erstattet|erstattung|erstattungsfähig|erstattungsfaehig|anerkannt|eingereicht|vom)\b/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80);
}

// Liefert { datum, total, sbText, items: [{ datum, name, betrag, erstattet, sure }] }
export function parseStatement(text, invoices = []) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const out = { datum: null, total: null, items: [] };

  // Datum der Abrechnung: Zeile mit "Datum"/"Abrechnung"/"Bescheid", sonst erstes Datum oben
  for (const l of lines.slice(0, 40)) {
    if (/(datum|abrechnung vom|bescheid vom|leistungsabrechnung)/i.test(l)) { const d = datesIn(l)[0]; if (d) { out.datum = d; break; } }
  }
  if (!out.datum) for (const l of lines.slice(0, 25)) { const d = datesIn(l)[0]; if (d) { out.datum = d; break; } }

  // Auszahlungsbetrag
  for (const l of lines) {
    if (TOTAL.test(l)) { const a = amountsIn(l); if (a.length) { out.total = a[a.length - 1]; } }
  }

  const used = new Set();
  const taken = new Set();
  // 1) Zeilen, die den Betrag einer eigenen Rechnung enthalten
  const open = invoices.filter(i => Number(i.betrag) > 0);
  lines.forEach((l, n) => {
    if (TOTAL.test(l) || SKIP.test(l)) return;
    const a = amountsIn(l);
    if (!a.length) return;
    const inv = open.find(i => !taken.has(i.id) && a.some(x => same(x, i.betrag)));
    if (!inv) return;
    const b = Number(inv.betrag);
    let rest = a.filter(x => !same(x, b) && x <= b + 0.005);
    let sure = rest.length > 0;
    if (!rest.length) {
      // Erstattung steht evtl. in der nächsten Zeile
      for (const k of [n + 1, n + 2]) {
        const l2 = lines[k]; if (!l2 || SKIP.test(l2) || TOTAL.test(l2)) continue;
        const a2 = amountsIn(l2).filter(x => x <= b + 0.005);
        if (a2.length && !datesIn(l2).length) { rest = [a2[a2.length - 1]]; used.add(k); break; }
      }
    }
    taken.add(inv.id); used.add(n);
    const prev = lines[n - 1] || "";
    out.items.push({ datum: datesIn(l)[0] || datesIn(prev)[0] || null, name: nameOf(l) || (datesIn(prev).length ? nameOf(prev) : "") || inv.arzt || "", betrag: b, erstattet: rest.length ? rest[rest.length - 1] : b, sure, hint: inv.id });
  });

  // 2) Weitere Zeilen mit Datum und mindestens zwei Beträgen
  lines.forEach((l, n) => {
    if (used.has(n) || TOTAL.test(l) || SKIP.test(l) || SB.test(l)) return;
    const a = amountsIn(l), d = datesIn(l);
    if (a.length < 2 || !d.length) return;
    const b = Math.max(...a), e = a[a.length - 1];
    if (!(b > 0)) return;
    out.items.push({ datum: d[0], name: nameOf(l), betrag: b, erstattet: e <= b ? e : b, sure: false });
  });
  return out;
}

// ---------- Zuordnung ----------
const words = s => String(s || "").toLowerCase().replace(/dr\.|med\.|prof\.|praxis|gemeinschaftspraxis|zahnarzt|zahnärzte|mvz|gmbh|und|für|der|die|das/g, " ").split(/[^a-zäöüß]+/).filter(w => w.length > 2);
const daysBetween = (a, b) => Math.abs((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);

export function score(item, inv, persons = []) {
  let s = 0;
  if (item.hint === inv.id) s += 4;
  if (has(item.betrag) && same(item.betrag, inv.betrag)) s += 6;
  else if (has(item.betrag) && Math.abs(item.betrag - inv.betrag) < 1) s += 1;
  const ds = [inv.datum, inv.behandlung].filter(Boolean);
  for (const d of [item.datum, item.behandlung].filter(Boolean)) {
    if (ds.includes(d)) { s += 3; break; }
    if (ds.some(x => daysBetween(x, d) <= 5)) { s += 1; break; }
  }
  const w1 = words(item.name), w2 = new Set(words(inv.arzt));
  if (w1.some(w => w2.has(w))) s += 2;
  if (item.patient) {
    const p = persons.find(p => p.id === inv.personId);
    const fn = String(p?.name || "").toLowerCase().split(/\s+/)[0];
    if (fn && String(item.patient).toLowerCase().includes(fn)) s += 2;
  }
  if (inv.eingereicht && !has(inv.erstattet)) s += 1;
  if (has(inv.erstattet)) s -= 2;
  return s;
}

// Ordnet jeder Zeile höchstens eine Rechnung zu (beste Treffer zuerst)
export function matchItems(items, invoices, persons = []) {
  const pairs = [];
  items.forEach((it, n) => invoices.forEach(inv => { const s = score(it, inv, persons); if (s >= 5) pairs.push({ n, inv, s }); }));
  pairs.sort((a, b) => b.s - a.s);
  const doneItem = new Set(), doneInv = new Set();
  const res = items.map(it => ({ ...it, invId: "", use: false }));
  for (const p of pairs) {
    if (doneItem.has(p.n) || doneInv.has(p.inv.id)) continue;
    doneItem.add(p.n); doneInv.add(p.inv.id);
    res[p.n].invId = p.inv.id; res[p.n].use = true;
  }
  return res;
}

// Kandidaten für die Auswahlliste einer Zeile, beste zuerst
export function candidates(item, invoices, persons = [], max = 25) {
  return invoices.map(inv => ({ inv, s: score(item, inv, persons) }))
    .sort((a, b) => b.s - a.s || effDate(b.inv).localeCompare(effDate(a.inv)))
    .slice(0, max).map(x => x.inv);
}
