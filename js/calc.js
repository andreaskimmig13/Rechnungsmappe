// Tarif-Vorlagen und die Rechnung "Einreichen oder Beitragsrückerstattung behalten?"
// Die Vorlagen enthalten nur öffentlich bekannte Tarifregeln, keine persönlichen Daten.

export const CATS = [
  { k: "ambulant", l: "Arzt (ambulant)" },
  { k: "zahn", l: "Zahnbehandlung" },
  { k: "zahnersatz", l: "Zahnersatz / Kieferorthopädie" },
  { k: "heilmittel", l: "Heilmittel (Physio, Massage …)" },
  { k: "logopaedie", l: "Logopädie" },
  { k: "ergotherapie", l: "Ergotherapie" },
  { k: "arznei", l: "Arzneimittel" },
  { k: "hilfsmittel", l: "Hilfsmittel" },
  { k: "sehhilfe", l: "Brille / Kontaktlinsen" },
  { k: "stationaer", l: "Krankenhaus" },
  { k: "zahnprophylaxe", l: "Zahnprophylaxe / PZR" },
  { k: "vorsorge", l: "Vorsorge, Impfung" },
];
// Höchstbeträge nach Anlage 9 BBhV (zu § 23 Abs. 1), gültig ab 01.02.2026.
// Signal Iduna erstattet Logopädie und Ergotherapie nur bis zu diesen Beträgen.
export const BBHV = {
  valid: "2026-02-01",
  items: [
    { code: "47", cat: "logopaedie", l: "Erstdiagnostik", max: 117.30 },
    { code: "48", cat: "logopaedie", l: "Bedarfsdiagnostik", max: 58.70 },
    { code: "49", cat: "logopaedie", l: "Bericht an die verordnende Person", max: 6.60 },
    { code: "51a", cat: "logopaedie", l: "Einzelbehandlung 30 Min.", max: 52.20 },
    { code: "51b", cat: "logopaedie", l: "Einzelbehandlung 45 Min.", max: 71.70 },
    { code: "51c", cat: "logopaedie", l: "Einzelbehandlung 60 Min.", max: 91.30 },
    { code: "52a", cat: "logopaedie", l: "Gruppe, 2 Personen, 45 Min.", max: 64.50 },
    { code: "52b", cat: "logopaedie", l: "Gruppe, 3–5 Personen, 45 Min.", max: 35.60 },
    { code: "52c", cat: "logopaedie", l: "Gruppe, 2 Personen, 90 Min.", max: 117.30 },
    { code: "52d", cat: "logopaedie", l: "Gruppe, 3–5 Personen, 90 Min.", max: 58.70 },
    { code: "53", cat: "ergotherapie", l: "Funktionsanalyse und Erstgespräch", max: 47.70 },
    { code: "54a", cat: "ergotherapie", l: "Einzel, motorisch-funktionell 45 Min.", max: 57.00 },
    { code: "54b", cat: "ergotherapie", l: "Einzel, sensomotorisch-perzeptiv 60 Min.", max: 76.00 },
    { code: "54c", cat: "ergotherapie", l: "Einzel, psychisch-funktionell 75 Min.", max: 94.90 },
    { code: "58", cat: "ergotherapie", l: "Hirnleistungstraining 45 Min.", max: 57.00 },
    { code: "83", cat: "both", l: "Hausbesuch inkl. Wegegeld", max: 27.60 },
    { code: "84", cat: "both", l: "Besuch in Einrichtung je Person", max: 18.00 },
  ],
};
export const CAPPED_CATS = ["logopaedie", "ergotherapie"];
export const bbhvItem = code => BBHV.items.find(x => x.code === String(code || ""));
export const capsOf = p => p.caps ?? (p.presetId === "signal-exklusiv1" ? "bbhv" : null);

// Positionen einer Rechnung gegen die Höchstbeträge prüfen
export function positionCheck(p, inv) {
  const pos = Array.isArray(inv.positions) ? inv.positions : [];
  const amount = Number(inv.betrag) || 0;
  if (!pos.length) return { billed: 0, recognized: 0, capCut: 0, rest: amount, rows: [] };
  const capped = capsOf(p) === "bbhv" && CAPPED_CATS.includes(inv.kategorie);
  const rows = pos.map(x => {
    const qty = Number(x.qty) || 0, price = Number(x.price) || 0;
    const item = capped ? bbhvItem(x.code) : null;
    const max = item && (item.cat === inv.kategorie || item.cat === "both") ? item.max : null;
    const unit = max != null ? Math.min(price, max) : price;
    return { ...x, qty, price, max, billed: qty * price, recognized: qty * unit, cut: qty * (price - unit) };
  });
  const billed = rows.reduce((a, r) => a + r.billed, 0);
  const recognized = rows.reduce((a, r) => a + r.recognized, 0);
  return { billed, recognized, capCut: billed - recognized, rest: Math.max(0, amount - billed), rows, capped };
}

export const catLabel = k => (CATS.find(c => c.k === k) || { l: k || "–" }).l;
export const DENTAL_CATS = ["zahn", "zahnersatz", "zahnprophylaxe"];
export const NEUTRAL_CATS = ["vorsorge", "zahnprophylaxe"];
export const isDental = k => DENTAL_CATS.includes(k);
export const isNeutral = k => NEUTRAL_CATS.includes(k);

const rates = (over = {}) => ({ ambulant: 100, zahn: 100, zahnersatz: 90, heilmittel: 100, logopaedie: 100, ergotherapie: 100, arznei: 100, hilfsmittel: 100, sehhilfe: 100, stationaer: 100, vorsorge: 100, zahnprophylaxe: 100, ...over });

export const PRESETS = [
  {
    id: "universa-top300", insurer: "uniVersa", tariff: "uni-Top|Privat 300", deadlines: "universa",
    adult: { sb: 300, breFix: 600 }, child: { sb: 150, breFix: 300 },
    common: { sbDental: true, sbQuarterRule: false, breMonate: 2.5, breVariableFirstYear: false, breEstimated: false, basisPct: 85, offset: false, rates: rates(), dentalCaps: [1500, 3000, 4500, 6000] },
    note: "Reichst du nach Auszahlung der garantierten BRE noch Rechnungen für dasselbe Jahr ein, verrechnet uniVersa sie mit der BRE. Spätes Einreichen ist also möglich.",
  },
  {
    id: "signal-exklusiv1", insurer: "Signal Iduna", tariff: "EXKLUSIV 1", deadlines: "signal",
    adult: { sb: 480 }, child: { sb: 240 },
    common: { breFix: 0, sbDental: false, sbQuarterRule: true, breMonate: 1, breVariableFirstYear: true, breEstimated: true, basisPct: 80, offset: false, rates: rates({ heilmittel: 80, logopaedie: 80, ergotherapie: 80 }), caps: "bbhv", dentalCaps: [750, 1500, 3000, 4500] },
    note: "Selbstbehalt gilt nur für ambulant und stationär, nicht für Zahnleistungen. Die erfolgsabhängige BRE legt Signal Iduna jedes Jahr neu fest (Kinder: die Hälfte).",
  },
  {
    id: "custom", insurer: "", tariff: "Eigener Tarif", deadlines: "none",
    adult: { sb: 0, breFix: 0 }, child: { sb: 0, breFix: 0 },
    common: { sbDental: true, sbQuarterRule: false, breMonate: 0, breVariableFirstYear: false, breEstimated: true, basisPct: 80, offset: false, rates: rates() },
    note: "",
  },
];

export function personFromPreset(presetId, kind, extra = {}) {
  const p = PRESETS.find(x => x.id === presetId) || PRESETS[2];
  return {
    id: "p-" + Math.random().toString(36).slice(2, 10),
    name: "", kind, presetId: p.id, insurer: p.insurer, tariff: p.tariff, deadlines: p.deadlines,
    start: "", beitrag: 0, note: p.note,
    ...structuredClone(p.common), ...structuredClone(p[kind] || p.adult), ...extra,
  };
}

export const yearOf = inv => Number(String(inv.datum || "").slice(0, 4)) || new Date().getFullYear();
const num = v => Number(v) || 0;

// ---------- Zahn-Höchstbeträge der ersten Versicherungsjahre ----------
// Das 1. Versicherungsjahr läuft vom Versicherungsbeginn bis 31.12., danach je Kalenderjahr.
export const dentalCapsOf = p => {
  if (Array.isArray(p.dentalCaps)) return p.dentalCaps.filter(x => Number(x) > 0).length ? p.dentalCaps.map(Number) : null;
  return PRESETS.find(x => x.id === p.presetId)?.common.dentalCaps || null;
};
const startYearOf = p => Number(String(p.start || "").slice(0, 4)) || null;
const rateOf = (p, k) => num(p.rates?.[k] ?? (CAPPED_CATS.includes(k) ? p.rates?.heilmittel : undefined) ?? 100) / 100;
const baseOf = (p, i) => { const pc = positionCheck(p, i); return { pc, base: pc.rows.length ? Math.min(num(i.betrag), pc.recognized + pc.rest) : num(i.betrag) }; };
const wasReimbursed = i => i.eingereicht || (i.erstattet !== null && i.erstattet !== undefined && i.erstattet !== "");

export function dentalLedger(p, invoices, year) {
  const caps = dentalCapsOf(p), sy = startYearOf(p);
  const idx = sy ? year - sy + 1 : null;
  const limitFor = y => { if (!caps || !sy) return Infinity; const n = y - sy + 1; return n >= 1 && n <= caps.length ? caps[n - 1] : Infinity; };
  const map = {};
  let used = 0, usedBefore = 0, usedThis = 0, cutThis = 0, accident = 0;
  const list = invoices.filter(i => i.personId === p.id && isDental(i.kategorie) && yearOf(i) <= year && (!sy || yearOf(i) >= sy))
    .sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  for (const i of list) {
    const y = yearOf(i);
    const benefit = baseOf(p, i).base * rateOf(p, i.kategorie);
    let granted = benefit;
    const counts = y === year || wasReimbursed(i);
    if (i.unfall) { if (y === year) accident += benefit; }
    else if (counts) {
      const lim = limitFor(y);
      if (lim !== Infinity) granted = Math.min(benefit, Math.max(0, lim - used));
      used += granted;
      if (y < year) usedBefore += granted; else usedThis += granted;
    }
    if (y === year) cutThis += benefit - granted;
    map[i.id] = { benefit, granted, cut: benefit - granted };
  }
  const limit = limitFor(year);
  return { map, active: limit !== Infinity, idx, limit, usedBefore, usedThis, cutThis, accident,
    remaining: limit === Infinity ? Infinity : Math.max(0, limit - usedBefore - usedThis), endsYear: caps && sy ? sy + caps.length : null, caps, startYear: sy };
}

function firstYearInfo(p, year) {
  const st = String(p.start || "");
  const sy = Number(st.slice(0, 4)), sm = Number(st.slice(5, 7));
  if (!sy || !sm) return { first: false, before: false, months: 12, sbFactor: 1 };
  if (year < sy) return { first: false, before: true, months: 0, sbFactor: 0 };
  if (year !== sy) return { first: false, before: false, months: 12, sbFactor: 1 };
  const q = Math.ceil(sm / 3);
  return { first: true, before: false, months: 13 - sm, sbFactor: p.sbQuarterRule ? (5 - q) / 4 : 1 };
}

export function calc(p, invoices, year, taxRatePct) {
  const inv = invoices.filter(i => i.personId === p.id && yearOf(i) === year);
  const regular = inv.filter(i => !isNeutral(i.kategorie));
  const neutral = inv.filter(i => isNeutral(i.kategorie));
  const rate = i => rateOf(p, i.kategorie);
  const base = i => baseOf(p, i);
  const sbApplies = i => p.sbDental !== false || !isDental(i.kategorie);
  const dental = dentalLedger(p, invoices, year);
  const dCut = i => dental.map[i.id]?.cut || 0;
  const total = inv.reduce((a, i) => a + num(i.betrag), 0);
  const fy = firstYearInfo(p, year);
  const sb = num(p.sb) * fy.sbFactor;
  const breFix = num(p.breFix) * fy.months / 12;
  const breVar = fy.first && !p.breVariableFirstYear ? 0 : num(p.breMonate) * num(p.beitrag) * fy.months / 12;
  const bre = breFix + breVar;
  const breTax = bre * (num(p.basisPct) / 100) * (num(taxRatePct) / 100);
  const breNet = bre - breTax;
  // Aufschlüsselung je Rechnung: Höchstbeträge, Satz, dann Selbstbehalt chronologisch
  let sbRemaining = sb;
  const lines = [...regular].sort((a, b) => (a.datum || "").localeCompare(b.datum || "")).map(i => {
    const amount = num(i.betrag), r = rate(i), b = base(i), dentalCut = dCut(i), elig = b.base * r - dentalCut;
    const sbPart = sbApplies(i) ? Math.min(sbRemaining, elig) : 0;
    sbRemaining -= sbPart;
    const capCut = amount - b.base;
    return { inv: i, amount, rate: r, eligible: elig, capCut, rateCut: b.base - b.base * r, dentalCut, notCovered: amount - elig, sbPart, refund: elig - sbPart, sbFree: !sbApplies(i), pc: b.pc };
  });
  const neutralLines = [...neutral].sort((a, b) => (a.datum || "").localeCompare(b.datum || "")).map(i => {
    const amount = num(i.betrag), r = rate(i), dentalCut = dCut(i), elig = amount * r - dentalCut;
    return { inv: i, amount, rate: r, eligible: elig, capCut: 0, rateCut: amount - amount * r, dentalCut, notCovered: amount - elig, sbPart: 0, refund: elig, neutral: true };
  });
  const eligible = lines.reduce((a, l) => a + l.eligible, 0);
  const eligibleSb = lines.filter(l => !l.sbFree).reduce((a, l) => a + l.eligible, 0);
  const neutralRefund = neutralLines.reduce((a, l) => a + l.refund, 0);
  const payout = lines.reduce((a, l) => a + l.refund, 0);
  const sbUsed = sb - sbRemaining;
  const notCovered = lines.reduce((a, l) => a + l.notCovered, 0);
  const capCut = lines.reduce((a, l) => a + l.capCut, 0);
  const dentalCut = lines.reduce((a, l) => a + l.dentalCut, 0);
  const regularTotal = lines.reduce((a, l) => a + l.amount, 0);
  const submitted = regular.filter(i => i.eingereicht);
  const unsubmitted = regular.filter(i => !i.eingereicht);
  const breLost = submitted.length > 0 && !p.offset;

  let verdict, tone;
  if (fy.before) { verdict = "Noch nicht versichert"; tone = "muted"; }
  else if (p.offset) { verdict = "Einreichen – BRE bleibt"; tone = "good"; }
  else if (breLost) { verdict = "Alle einreichen"; tone = "bad"; }
  else if (regular.length === 0) { verdict = "Leistungsfrei"; tone = "good"; }
  else if (payout > 0 && Math.abs(payout - breNet) < 50) { verdict = "Knapp – abwarten"; tone = "warn"; }
  else if (payout > breNet) { verdict = "Einreichen lohnt sich"; tone = "good"; }
  else { verdict = "BRE behalten"; tone = "keep"; }

  const sbLeft = Math.max(0, sb - eligibleSb);
  const rest = payout < breNet ? Math.max(0, breNet - payout) + sbLeft : 0;
  const threshold = eligible + rest;
  const submitWins = p.offset || breLost || payout > breNet;
  const best = breLost ? payout : Math.max(payout, breNet);
  return { dental, dentalCut, lines, neutralLines, sbUsed, notCovered, capCut, regularTotal, inv, regular, neutral, total, eligible, neutralRefund, sb, payout, bre, breFix, breVar, breTax, breNet,
    rest, threshold, fy, verdict, tone, submitted, unsubmitted, breLost, submitWins, best };
}

// Fristen aus den Tarifbedingungen und offenen Rechnungen
export function deadlines(persons, invoices, today = new Date()) {
  const Y = today.getFullYear();
  const items = [];
  const add = (date, text, kind = "tarif") => items.push({ date, text, kind });
  const byRule = {};
  for (const p of persons) (byRule[p.deadlines] ||= []).push(p);
  const names = ps => ps.map(p => p.name || "?").join(", ");
  const started = (p, y) => !p.start || Number(p.start.slice(0, 4)) <= y;

  if (byRule.universa) {
    const ps = byRule.universa;
    const prev = ps.filter(p => started(p, Y - 1));
    if (prev.length) add(`${Y}-10-31`, `Garantierte BRE ${Y - 1} von uniVersa wird spätestens im Oktober ausgezahlt, wenn ${Y - 1} leistungsfrei war (${names(prev)})`);
    add(`${Y + 1}-01-31`, `Beiträge ${Y} an uniVersa vollständig gezahlt – sonst keine BRE (${names(ps)})`);
  }
  if (byRule.signal) {
    const ps = byRule.signal;
    if (ps.some(p => started(p, Y - 1))) add(`${Y}-07-01`, `BRE ${Y - 1} von Signal Iduna ab jetzt abrufbar (${names(ps)})`);
    add(`${Y + 1}-03-31`, `Beiträge ${Y} an Signal Iduna gezahlt – Voraussetzung für die BRE (${names(ps)})`);
  }
  if (persons.length) add(`${Y}-12-31`, `Jahresende: entscheiden, ob Rechnungen ${Y} eingereicht werden`, "decision");
  for (const i of invoices) {
    if (!i.bezahlt && i.faellig) add(i.faellig, `${i.arzt || "Rechnung"} bezahlen – ${fmtEur(i.betrag)}`, "invoice");
  }
  const t = today.toISOString().slice(0, 10);
  return items.map(x => ({ ...x, overdue: x.date < t })).sort((a, b) => a.date.localeCompare(b.date));
}

export const fmtEur = n => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
export const fmtShort = d => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : "";
