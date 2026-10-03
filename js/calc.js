// Tarif-Vorlagen und die Rechnung "Einreichen oder Beitragsrückerstattung behalten?"
// Die Vorlagen enthalten nur öffentlich bekannte Tarifregeln, keine persönlichen Daten.

export const CATS = [
  { k: "ambulant", l: "Arzt (ambulant)" },
  { k: "zahn", l: "Zahnbehandlung" },
  { k: "zahnersatz", l: "Zahnersatz / Kieferorthopädie" },
  { k: "heilmittel", l: "Heilmittel (Physio, Logopädie …)" },
  { k: "arznei", l: "Arzneimittel" },
  { k: "hilfsmittel", l: "Hilfsmittel" },
  { k: "sehhilfe", l: "Brille / Kontaktlinsen" },
  { k: "stationaer", l: "Krankenhaus" },
  { k: "vorsorge", l: "Vorsorge, Impfung, Prophylaxe" },
];
export const catLabel = k => (CATS.find(c => c.k === k) || { l: k || "–" }).l;
export const isDental = k => k === "zahn" || k === "zahnersatz";

const rates = (over = {}) => ({ ambulant: 100, zahn: 100, zahnersatz: 90, heilmittel: 100, arznei: 100, hilfsmittel: 100, sehhilfe: 100, stationaer: 100, vorsorge: 100, ...over });

export const PRESETS = [
  {
    id: "universa-top300", insurer: "uniVersa", tariff: "uni-Top|Privat 300", deadlines: "universa",
    adult: { sb: 300, breFix: 600 }, child: { sb: 150, breFix: 300 },
    common: { sbDental: true, sbQuarterRule: false, breMonate: 2.5, breVariableFirstYear: false, breEstimated: false, basisPct: 85, offset: false, rates: rates() },
    note: "Reichst du nach Auszahlung der garantierten BRE noch Rechnungen für dasselbe Jahr ein, verrechnet uniVersa sie mit der BRE. Spätes Einreichen ist also möglich.",
  },
  {
    id: "signal-exklusiv1", insurer: "Signal Iduna", tariff: "EXKLUSIV 1", deadlines: "signal",
    adult: { sb: 480 }, child: { sb: 240 },
    common: { breFix: 0, sbDental: false, sbQuarterRule: true, breMonate: 1, breVariableFirstYear: true, breEstimated: true, basisPct: 80, offset: false, rates: rates({ heilmittel: 80 }) },
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
  const regular = inv.filter(i => i.kategorie !== "vorsorge");
  const neutral = inv.filter(i => i.kategorie === "vorsorge");
  const rate = i => num(p.rates?.[i.kategorie] ?? 100) / 100;
  const sbApplies = i => p.sbDental !== false || !isDental(i.kategorie);
  const total = inv.reduce((a, i) => a + num(i.betrag), 0);
  const eligibleSb = regular.filter(sbApplies).reduce((a, i) => a + num(i.betrag) * rate(i), 0);
  const eligibleFree = regular.filter(i => !sbApplies(i)).reduce((a, i) => a + num(i.betrag) * rate(i), 0);
  const eligible = eligibleSb + eligibleFree;
  const neutralRefund = neutral.reduce((a, i) => a + num(i.betrag) * rate(i), 0);
  const fy = firstYearInfo(p, year);
  const sb = num(p.sb) * fy.sbFactor;
  const payout = Math.max(0, eligibleSb - sb) + eligibleFree;
  const breFix = num(p.breFix) * fy.months / 12;
  const breVar = fy.first && !p.breVariableFirstYear ? 0 : num(p.breMonate) * num(p.beitrag) * fy.months / 12;
  const bre = breFix + breVar;
  const breTax = bre * (num(p.basisPct) / 100) * (num(taxRatePct) / 100);
  const breNet = bre - breTax;
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
  return { inv, regular, neutral, total, eligible, neutralRefund, sb, payout, bre, breFix, breVar, breTax, breNet,
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
