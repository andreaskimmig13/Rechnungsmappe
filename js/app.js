import * as store from "./store.js";
import { CATS, catLabel, PRESETS, personFromPreset, calc, deadlines, yearOf, fmtEur, fmtDate, fmtShort, BBHV, CAPPED_CATS, bbhvItem, capsOf, positionCheck, isDental, isNeutral, dentalCapsOf, dentalLedger } from "./calc.js";
import { normalizeImage, readPdf, ocrImages, parseInvoice } from "./scan.js";
import { aiRead, PROVIDERS, AIError } from "./ai.js";
import { buildPackage, shareOrSave } from "./exporter.js";

const APP_VERSION = "2.1.0";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const root = $("#app");

// ---------- Darstellung: automatisch / hell / dunkel ----------
function getTheme() { try { return localStorage.getItem("rm-theme") || "auto"; } catch { return "auto"; } }
function applyTheme(t = getTheme()) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement("meta"); m.name = "theme-color"; m.content = dark ? "#0C111D" : "#F5F6F8"; document.head.append(m);
}
function setTheme(t) { try { localStorage.setItem("rm-theme", t); } catch {} applyTheme(t); }
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());

// ---------- Icons ----------
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  set: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  rot: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/>',
  doc: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  tooth: '<path d="M7 3c-2.2 0-4 1.8-4 4.3 0 3 1.4 4.4 2 7.7.4 2.4.8 6 2.5 6 1.6 0 1.6-4.5 4.5-4.5s2.9 4.5 4.5 4.5c1.7 0 2.1-3.6 2.5-6 .6-3.3 2-4.7 2-7.7C21 4.8 19.2 3 17 3c-2 0-3 1-5 1S9 3 7 3z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5.2-3L3.5 15.3a1.5 1.5 0 0 1 2.6-1.5L8 16"/>',
  pill: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bed: '<path d="M3 7v12M3 13h18v6M21 13a3 3 0 0 0-3-3h-8v3"/><circle cx="7" cy="11" r="1.5"/>',
  shield: '<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  speech: '<path d="M4 5h16v11H9l-5 4z"/>',
  crutch: '<path d="M8 3h8M12 3v18M9 21h6M9 9h6"/>',
};
const ic = (n, s = 24, extra = "") => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[n]}</svg>`;

// ---------- Zustand ----------
let S = null;          // entschlüsselter Zustand
let draft = null;      // Rechnung in Bearbeitung
let ui = { fPerson: "all", fStatus: "all", q: "", year: new Date().getFullYear() };
let hiddenAt = 0;
let installEvt = null;
let picking = 0;       // Zeitpunkt, an dem Kamera/Dateiauswahl geöffnet wurde

const defaultState = () => ({
  version: 1,
  settings: { taxRate: 42, lockMinutes: 1, ai: { provider: "claude", apiKey: "", model: "", askBefore: true } },
  persons: [], invoices: [],
});

async function save() { await store.saveDoc("state", S); }
const person = id => S.persons.find(p => p.id === id);

// ---------- Kleine UI-Helfer ----------
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}

function modal({ title, body = "", actions = [{ label: "OK", value: true, primary: true }], onOpen }) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "modal-bg";
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <h2 id="m-title">${esc(title)}</h2><div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button type="button" class="btn ${a.primary ? "primary" : ""} ${a.danger ? "danger" : ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div></div>`;
    document.body.append(wrap);
    const close = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", e => {
      const b = e.target.closest("[data-i]");
      if (b) { const a = actions[Number(b.dataset.i)]; const v = a.collect ? a.collect(wrap) : a.value; if (v === undefined && a.collect) return; close(v); }
      else if (e.target === wrap) close(null);
    });
    onOpen?.(wrap);
    setTimeout(() => (wrap.querySelector("input") || wrap.querySelector(".primary"))?.focus(), 30);
  });
}
const confirmBox = (title, text, label = "OK", danger = false) =>
  modal({ title, body: `<p>${text}</p>`, actions: [{ label: "Abbrechen", value: false }, { label, value: true, primary: !danger, danger }] });

function nav(active) {
  const item = (href, icon, label, key) => `<a href="${href}" class="nav-i ${active === key ? "on" : ""}" ${active === key ? 'aria-current="page"' : ""}>${ic(icon, 22)}<span>${label}</span></a>`;
  return `<nav class="nav" aria-label="Hauptmenü">
    ${item("#/", "home", "Übersicht", "home")}
    ${item("#/rechnungen", "list", "Rechnungen", "list")}
    <a href="#/neu" class="nav-add" aria-label="Rechnung erfassen"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></a>
    ${item("#/fristen", "cal", "Fristen", "cal")}
    ${item("#/einstellungen", "set", "Einstellungen", "set")}
  </nav>`;
}
const header = (title, { back, right = "", sub = "", lead = "" } = {}) => `<header class="top ${back ? "with-back" : ""}">
  ${back ? `<a class="icon-btn" href="${back}" aria-label="Zurück">${ic("back", 22)}</a>` : ""}${lead}
  <div class="top-t"><h1>${esc(title)}</h1>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</div>${right}</header>`;

// ---------- Kleine Darstellungshelfer ----------
const MONTHS = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_L = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const fmtEur0 = n => Math.round(Number(n) || 0).toLocaleString("de-DE") + " €";
const dShort = iso => iso ? `${Number(iso.slice(8, 10))}. ${MONTHS_L[Number(iso.slice(5, 7)) - 1]}` : "";
const dLong = iso => iso ? `${dShort(iso)} ${iso.slice(0, 4)}` : "";
const refundOpen = i => i.eingereicht && (i.erstattet === null || i.erstattet === undefined || i.erstattet === "");
function initials(name) {
  const w = String(name || "?").trim().split(/\s+/);
  if (w[1] && /^\d+$/.test(w[1])) return (w[0][0] + w[1]).toUpperCase();
  return (w[0][0] + (w[1]?.[0] || "")).toUpperCase();
}
const avatar = (p, sm = false) => `<span class="av ${sm ? "sm" : ""} c${Math.max(0, S.persons.indexOf(p)) % 4}" aria-hidden="true">${esc(initials(p?.name))}</span>`;
function statusOf(i) {
  if (i.erstattet !== null && i.erstattet !== undefined && i.erstattet !== "") return { cls: "good", label: `erstattet ${fmtEur(i.erstattet)}` };
  if (i.eingereicht) return { cls: "acc", label: "eingereicht" };
  if (!i.bezahlt && i.faellig && i.faellig < today()) return { cls: "bad", label: "überfällig" };
  if (!i.bezahlt) return { cls: "warn", label: i.faellig ? `zahlen bis ${fmtShort(i.faellig)}` : "offen" };
  return { cls: "muted", label: "bezahlt" };
}
const CAT_IC = { ambulant: "doc", zahn: "tooth", zahnersatz: "tooth", zahnprophylaxe: "tooth", heilmittel: "hand", logopaedie: "speech", ergotherapie: "hand", arznei: "pill", hilfsmittel: "crutch", sehhilfe: "eye", stationaer: "bed", vorsorge: "shield" };
function yearSeg() {
  const now = new Date().getFullYear();
  const ys = [...new Set([now, ui.year, ...S.invoices.map(yearOf)])].sort((a, b) => a - b);
  if (ys.length > 3) return `<label class="year-sel"><span class="sr">Jahr</span><select id="year">${[...ys].reverse().map(y => `<option value="${y}" ${y === ui.year ? "selected" : ""}>${y}</option>`).join("")}</select></label>`;
  if (ys.length === 1) ys.unshift(now - 1);
  return `<div class="seg" role="group" aria-label="Jahr">${ys.map(y => `<button type="button" data-year="${y}" aria-pressed="${y === ui.year}">${y}</button>`).join("")}</div>`;
}
function bindYear(rerender) {
  $$("[data-year]").forEach(b => b.onclick = () => { ui.year = Number(b.dataset.year); rerender(); });
  const sel = $("#year"); if (sel) sel.onchange = e => { ui.year = Number(e.target.value); rerender(); };
}

function page(html, active) {
  root.innerHTML = `<div class="screen">${html}</div>${active !== undefined ? nav(active) : ""}`;
  window.scrollTo(0, 0);
}

// ---------- Sperre und Einrichtung ----------
function pinPad({ title, sub, onDone, error = "", extra = "" }) {
  root.innerHTML = `<div class="lock">
    <div class="lock-in">
      <div class="lock-logo">${ic("lock", 32)}</div>
      <h1>${esc(title)}</h1>
      <p class="lock-sub">${sub}</p>
      <div class="dots" aria-live="polite">${"<span></span>".repeat(6)}</div>
      <p class="lock-err" role="alert">${esc(error)}</p>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}<span></span><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="Löschen">⌫</button></div>
      ${extra}
    </div></div>`;
  let pin = "";
  const dots = $$(".dots span");
  const upd = () => dots.forEach((d, i) => d.classList.toggle("on", i < pin.length));
  const press = async k => {
    if (k === "del") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += k;
    upd();
    if (pin.length === 6) { const p = pin; pin = ""; setTimeout(upd, 150); await onDone(p); }
  };
  $(".pad").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b) press(b.dataset.k); });
  const onKey = e => { if (!$(".pad")) { document.removeEventListener("keydown", onKey); return; } if (/^\d$/.test(e.key)) press(e.key); if (e.key === "Backspace") press("del"); };
  document.addEventListener("keydown", onKey);
}

function showLock(error = "") {
  pinPad({
    title: "Rechnungsmappe", sub: "PIN eingeben", error,
    extra: `<button type="button" class="link-btn" id="forgot">PIN vergessen?</button>`,
    onDone: async pin => {
      $(".lock-sub").textContent = "Wird entschlüsselt …";
      const ok = await store.unlock(pin);
      if (!ok) { showLock("Falsche PIN. Bitte erneut versuchen."); return; }
      S = (await store.loadDoc("state")) || defaultState();
      route();
    },
  });
  $("#forgot").onclick = async () => {
    const ok = await confirmBox("PIN vergessen", "Ohne PIN lassen sich die Daten nicht entschlüsseln – auch nicht von uns. Du kannst alles löschen und neu beginnen, danach ein Backup wiederherstellen.", "Alles löschen", true);
    if (ok) { await store.wipeAll(); location.hash = ""; start(); }
  };
}

function setupWelcome() {
  root.innerHTML = `<div class="screen welcome">
    <div class="welcome-mark">${ic("lock", 36)}</div>
    <h1>Rechnungsmappe</h1>
    <p class="lead">Arztrechnungen der Familie erfassen und sehen, ob sich Einreichen lohnt oder die Beitragsrückerstattung mehr bringt.</p>
    <ul class="ticks">
      <li>${ic("check", 20)}<span>Alle Daten bleiben auf diesem Handy, verschlüsselt mit deiner PIN.</span></li>
      <li>${ic("check", 20)}<span>Kein Konto, kein Server mit deinen Rechnungen.</span></li>
      <li>${ic("check", 20)}<span>Fotos werden nur an eine KI geschickt, wenn du es pro Rechnung erlaubst.</span></li>
    </ul>
    <button type="button" class="btn primary big" id="go">Einrichten</button>
  </div>`;
  $("#go").onclick = () => setupPin();
}

function setupPin(first = null, error = "") {
  pinPad({
    title: first ? "PIN wiederholen" : "PIN festlegen",
    sub: first ? "Zur Sicherheit noch einmal." : "6 Ziffern. Damit werden deine Daten verschlüsselt. Ohne PIN kommt niemand an die Daten – auch du nicht, also gut merken.",
    error,
    onDone: async pin => {
      if (!first) { if (/^(\d)\1{5}$/.test(pin) || pin === "123456") { setupPin(null, "Bitte keine zu einfache PIN wählen."); return; } setupPin(pin); return; }
      if (pin !== first) { setupPin(null, "Die PINs stimmen nicht überein."); return; }
      $(".lock-sub").textContent = "Wird eingerichtet …";
      await store.setup(pin);
      S = defaultState();
      await save();
      setupPeople();
    },
  });
}

function setupPeople() {
  page(`${header("Wer ist versichert?", { sub: "Einrichtung · Schritt 2 von 2" })}
    <main class="main">
      <section class="card">
        <h2 class="h2">Daten übernehmen</h2>
        <p class="muted">Hast du eine Importdatei aus der bisherigen Rechnungsmappe oder ein Backup? Dann lade sie hier – Personen, Tarife und Rechnungen werden übernommen.</p>
        <label class="btn primary file-btn">${ic("file", 20)} Datei laden<input type="file" id="imp" accept="application/json,.json" class="file-in"></label>
      </section>
      <div class="or">oder neu anlegen</div>
      <div id="plist" class="stack"></div>
      <section class="card stack">
        <div class="grid2">
          <label class="field"><span>Name</span><input id="np-name" autocomplete="off" placeholder="z. B. Andreas"></label>
          <label class="field"><span>Art</span><select id="np-kind"><option value="adult">Erwachsene/r</option><option value="child">Kind / Jugendliche/r</option></select></label>
        </div>
        <label class="field"><span>Tarif</span><select id="np-preset">${PRESETS.map(p => `<option value="${p.id}">${esc(p.insurer ? p.insurer + " · " + p.tariff : p.tariff)}</option>`).join("")}</select></label>
        <div class="grid2">
          <label class="field"><span>Monatsbeitrag Krankenvers. (€)</span><input id="np-beitrag" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00"></label>
          <label class="field"><span>Versichert seit</span><input id="np-start" type="date"></label>
        </div>
        <button type="button" class="btn" id="np-add">${ic("plus", 20)} Person hinzufügen</button>
      </section>
      <label class="field card"><span>Dein Grenzsteuersatz in % (inkl. Soli/Kirchensteuer)</span><input id="np-tax" type="number" inputmode="decimal" step="0.1" min="0" max="55" value="${S.settings.taxRate}"></label>
      <button type="button" class="btn primary big" id="np-done">Fertig</button>
    </main>`);
  const renderList = () => {
    $("#plist").innerHTML = S.persons.map(p => `<div class="row-card"><div><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.insurer)} · ${esc(p.tariff)}${p.beitrag ? " · " + fmtEur(p.beitrag) + "/Monat" : ""}</span></div></div>`).join("");
  };
  renderList();
  $("#np-add").onclick = async () => {
    const name = $("#np-name").value.trim();
    if (!name) { toast("Bitte einen Namen eingeben."); $("#np-name").focus(); return; }
    S.persons.push(personFromPreset($("#np-preset").value, $("#np-kind").value, { name, beitrag: Number($("#np-beitrag").value) || 0, start: $("#np-start").value }));
    await save(); renderList();
    $("#np-name").value = ""; $("#np-beitrag").value = "";
    toast(`${name} hinzugefügt`);
  };
  $("#imp").onchange = e => importFile(e.target.files[0], { replace: true });
  $("#np-done").onclick = async () => {
    if (!S.persons.length) { toast("Lege mindestens eine Person an oder lade eine Datei."); return; }
    S.settings.taxRate = Number($("#np-tax").value) || 0;
    await save(); location.hash = "#/"; route();
  };
}

// ---------- Übersicht ----------
// Zahn-Budget als Ring-Zeile
function dentalRow(p, r, { full = false } = {}) {
  const d = r.dental;
  if (!d.caps || !d.startYear) return "";
  const hasDental = S.invoices.some(i => i.personId === p.id && isDental(i.kategorie));
  if (!d.active) return full && hasDental && d.endsYear ? `<p class="xs muted">Zahn-Höchstbeträge: seit ${d.endsYear} keine Begrenzung mehr.</p>` : "";
  if (!full && !hasDental) return "";
  const used = d.usedBefore + d.usedThis;
  const pct = Math.min(100, used / d.limit * 100);
  const col = d.remaining <= 0.004 ? "var(--bad-dot)" : d.remaining < d.limit * .25 ? "var(--warn-dot)" : "var(--acc)";
  return `<section class="card stack-s">
    <div class="row-s" style="gap:14px">
      <div class="ring" style="background:conic-gradient(${col} ${pct * 3.6}deg, var(--line) 0)" aria-hidden="true"><span>${Math.round(pct)} %</span></div>
      <div class="row-t"><b style="white-space:normal">Zahn-Budget</b><span class="xs muted">${fmtEur(d.remaining)} frei bis Ende ${ui.year} · genutzt ${fmtEur(used)} von ${fmtEur(d.limit)}</span></div>
    </div>
    ${d.cutThis > 0.004 ? `<p class="xs bad-t">${fmtEur(d.cutThis)} liegen ${ui.year} über der Grenze und werden nicht erstattet.</p>` : ""}
    ${full ? `<p class="xs muted">Zusammengerechnet seit Versicherungsbeginn: ${d.caps.map((c, n) => `bis Ende ${d.startYear + n} ${fmtEur0(c)}`).join(" · ")}. Ab ${d.endsYear} unbegrenzt. Unfallfolgen zählen nicht mit, Vorjahre nur mit eingereichten Rechnungen.</p>` : ""}
  </section>`;
}

// Was bringt welche Wahl? (für Übersicht und Detail)
function choiceOf(p, r) {
  if (r.fy.before) return { amount: 0, label: "noch nicht versichert", tone: "muted", choice: "none" };
  if (r.breLost) return { amount: r.payout + r.neutralRefund, label: "einreichen", tone: "bad", choice: "submit" };
  if (p.offset || r.submitWins) return { amount: r.payout + r.neutralRefund, label: "Erstattung", tone: "good", choice: "submit" };
  if (!r.regular.length) return { amount: r.breNet + r.neutralRefund, label: "leistungsfrei", tone: "good", choice: "keep" };
  return { amount: r.breNet + r.neutralRefund, label: "Rückerstattung", tone: "good", choice: "keep" };
}

function personRow(p, r) {
  const y = ui.year, c = choiceOf(p, r);
  let detail = "";
  if (r.regular.length && !r.fy.before) {
    if (r.breLost) detail = `<div class="bar-t bad"><div style="width:100%"></div></div><span class="xs muted">Schon eingereicht – Rückerstattung entfällt, alle Rechnungen ${y} einreichen</span>`;
    else if (p.offset) detail = `<span class="xs muted">${fmtEur0(r.eligible)} erstattungsfähig – Rückerstattung bleibt trotzdem</span>`;
    else if (r.submitWins) detail = `<div class="bar-t good"><div style="width:100%"></div></div><span class="xs muted">${fmtEur0(r.eligible)} erstattungsfähig – Einreichen lohnt sich${r.unsubmitted.length ? ` (${r.unsubmitted.length} offen)` : ""}</span>`;
    else detail = `<div class="bar-t"><div style="width:${Math.min(100, r.eligible / Math.max(1, r.threshold) * 100).toFixed(1)}%"></div></div><span class="xs muted">${fmtEur0(r.eligible)} von ${fmtEur0(r.threshold)} – Einreichen lohnt sich noch nicht</span>`;
  }
  const d = r.dental;
  const dental = d.active && S.invoices.some(i => i.personId === p.id && isDental(i.kategorie) && yearOf(i) <= y)
    ? `<span class="chip-s">${ic("tooth", 14)} Zahn-Budget: noch ${fmtEur0(d.remaining)}</span>` : "";
  return `<a class="prow" href="#/jahr/${p.id}/${y}">
    <div class="prow-h">${avatar(p)}<span class="prow-t"><b>${esc(p.name)}</b><span class="xs muted">${esc(p.insurer)} · ${esc(p.tariff)}</span></span>
      <span class="prow-v"><b>${c.choice === "none" ? "–" : fmtEur0(c.amount)}</b><span class="xs ${c.tone === "bad" ? "bad-t" : c.tone === "muted" ? "muted" : "good-t"}">${esc(c.label)}</span></span></div>
    ${detail || dental ? `<div class="prow-d">${detail}${dental}</div>` : ""}
  </a>`;
}

// Rechenweg (aufklappbar)
function calcDetails(p, r, open = false) {
  const row = (label, val, cls = "") => `<div class="wf-r ${cls}"><span>${label}</span><span class="num">${val}</span></div>`;
  const other = r.notCovered - r.capCut - r.dentalCut;
  return `<details class="card calc" ${open ? "open" : ""}><summary>So rechnet die App ${ic("chev", 18)}</summary><div class="wf">
    ${row(`Rechnungen (${r.lines.length})`, fmtEur(r.regularTotal))}
    ${r.capCut > 0.004 ? row("über Beihilfe-Höchstbetrag", "− " + fmtEur(r.capCut), "minus") : ""}
    ${other > 0.004 ? row("nicht erstattet (Satz unter 100 %)", "− " + fmtEur(other), "minus") : ""}
    ${r.dentalCut > 0.004 ? row("über Zahn-Höchstbetrag", "− " + fmtEur(r.dentalCut), "minus") : ""}
    ${row(`Selbstbehalt${r.sb > r.sbUsed + 0.004 ? ` (noch ${fmtEur(r.sb - r.sbUsed)} offen)` : ""}`, "− " + fmtEur(r.sbUsed), "minus")}
    ${row("Erstattung bei Einreichung", fmtEur(r.payout), "sum")}
    ${r.neutralLines.length ? row(`zusätzlich Vorsorge/Prophylaxe (${r.neutralLines.length})`, "+ " + fmtEur(r.neutralRefund), "extra") : ""}
    ${row("Rückerstattung brutto", fmtEur(r.bre), "sub-h")}
    ${row(`davon Steuer (${S.settings.taxRate} % auf ${p.basisPct} %)`, "− " + fmtEur(r.breTax), "minus")}
    ${row("Rückerstattung nach Steuer", fmtEur(r.breNet), "sum")}
    ${r.fy.first ? `<p class="xs muted" style="padding-top:6px">Erstes Versicherungsjahr: Rückerstattung anteilig für ${r.fy.months} Monate${r.fy.sbFactor < 1 ? ", Selbstbehalt gekürzt" : ""}.</p>` : ""}
  </div></details>`;
}

// Voraussichtliche Erstattung je Rechnung (für Liste und Detail)
function expectedFor(invoices = S.invoices) {
  const map = {};
  const years = [...new Set(invoices.map(yearOf))];
  for (const p of S.persons) for (const y of years) {
    const r = calc(p, invoices, y, S.settings.taxRate);
    for (const l of [...r.lines, ...r.neutralLines]) map[l.inv.id] = l;
  }
  return map;
}

// ---------- Aufschlüsselung pro Person und Jahr ----------
function invRow(l) {
  const i = l.inv, st = statusOf(i);
  const notes = [];
  if (l.capCut > 0.004) notes.push(`Höchstbetrag −${fmtEur(l.capCut)}`);
  if (l.rateCut > 0.004) notes.push(`Satz ${Math.round(l.rate * 100)} % −${fmtEur(l.rateCut)}`);
  if (l.dentalCut > 0.004) notes.push(`Zahn-Budget −${fmtEur(l.dentalCut)}`);
  if (l.sbPart > 0.004) notes.push(`trägt ${fmtEur(l.sbPart)} Selbstbehalt`);
  if (l.inv.unfall) notes.push("Unfall");
  return `<a class="row" href="#/rechnung/${i.id}">
    <span class="row-t"><b>${esc(i.arzt || "Ohne Praxisangabe")}</b><span class="xs muted">${dShort(i.datum)}${notes.length ? " · " + notes.join(" · ") : ""}</span><span class="st ${st.cls}">${esc(st.label)}</span></span>
    <span class="row-v"><b>${fmtEur(l.amount)}</b><span class="xs ${l.refund > 0 ? "good-t" : "muted"}">${fmtEur(l.refund)} zurück</span></span></a>`;
}

function viewPersonYear(pid, year) {
  const p = person(pid);
  if (!p) { location.hash = "#/"; return; }
  ui.year = year;
  const r = calc(p, S.invoices, year, S.settings.taxRate);
  const c = choiceOf(p, r);
  const recSubmit = c.choice === "submit";
  page(`${header(`${p.name} · ${year}`, { back: "#/", sub: `${p.insurer} · ${p.tariff}`, lead: avatar(p, true) })}
    <main class="main">
      <section class="choice">
        <div class="ch ${recSubmit ? "rec" : ""}">${recSubmit ? `<span class="badge">Empfohlen</span>` : ""}<span class="sub">Einreichen</span><b>${fmtEur(r.payout)}</b><span class="xs muted">Erstattung nach Selbstbehalt</span></div>
        <div class="ch ${!recSubmit && c.choice !== "none" ? "rec" : ""}">${!recSubmit && c.choice !== "none" ? `<span class="badge">Empfohlen</span>` : ""}<span class="sub">Selbst zahlen</span><b class="${r.breLost ? "muted" : "good-t"}">${fmtEur(r.breLost ? 0 : r.breNet)}</b><span class="xs muted">${r.breLost ? "entfällt – schon eingereicht" : "Rückerstattung nach Steuer"}</span></div>
      </section>
      ${r.regular.length && !r.submitWins && !r.breLost ? `<section class="card stack-s"><div class="bar-t"><div style="width:${Math.min(100, r.eligible / Math.max(1, r.threshold) * 100).toFixed(1)}%"></div></div>
        <span class="small" style="color:var(--ink2)">Einreichen lohnt sich ab <b>${fmtEur0(r.threshold)}</b> erstattungsfähigen Kosten. Es fehlen noch ${fmtEur0(r.rest)}.</span></section>` : ""}
      ${r.submitWins && r.unsubmitted.length ? `<a class="btn primary big" href="#/paket/${p.id}/${year}">${ic("share", 20)} Einreichungspaket erstellen (${r.unsubmitted.length})</a>` : ""}
      ${calcDetails(p, r)}
      ${dentalRow(p, r, { full: true })}
      <section class="stack-s">
        <div class="split" style="margin:0 4px"><h2 class="h3">Rechnungen</h2><span class="xs muted">Erstattung je Rechnung</span></div>
        ${r.lines.length ? `<div class="card list">${r.lines.map(invRow).join("")}<div class="sum-row"><span>Summe ${fmtEur(r.regularTotal)}</span><span class="good-t">${fmtEur(r.payout)} zurück</span></div></div>`
          : `<div class="card empty small">Keine Rechnungen ${year}.</div>`}
      </section>
      ${r.neutralLines.length ? `<section class="stack-s"><div class="split" style="margin:0 4px"><h2 class="h3">Vorsorge und Prophylaxe</h2><span class="xs muted">ohne Selbstbehalt, BRE-neutral</span></div>
        <div class="card list">${r.neutralLines.map(invRow).join("")}</div>
        <p class="xs muted" style="margin:0 4px">BRE-neutral nur, wenn die Voraussetzungen des Vorsorgeverzeichnisses deines Tarifs erfüllt sind. Kannst du jederzeit einreichen.</p></section>` : ""}
      ${p.note ? `<p class="foot">${esc(p.note)}</p>` : ""}
      <p class="foot">Schätzung auf Basis deiner Tarifangaben. <a href="#/person/${p.id}">Tarif bearbeiten</a></p>
    </main>`, "home");
}

function greeting() {
  const h = new Date().getHours();
  const first = (S.persons.find(p => p.kind === "adult") || S.persons[0])?.name?.split(" ")[0];
  return `${h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"}${first ? ", " + esc(first) : ""}`;
}

function viewHome() {
  const y = ui.year;
  const yearInv = S.invoices.filter(i => yearOf(i) === y);
  const unpaid = S.invoices.filter(i => !i.bezahlt);
  const late = unpaid.filter(i => i.faellig && i.faellig < today());
  const pending = S.invoices.filter(refundOpen);
  const results = S.persons.map(p => ({ p, r: calc(p, S.invoices, y, S.settings.taxRate) }));
  const back = results.reduce((a, x) => a + choiceOf(x.p, x.r).amount, 0);
  const payoutSum = results.reduce((a, x) => a + x.r.payout + x.r.neutralRefund, 0);
  const sbSum = results.reduce((a, x) => a + x.r.sbUsed, 0);
  const months = Array.from({ length: 12 }, (_, m) => yearInv.filter(i => Number(i.datum.slice(5, 7)) === m + 1).reduce((a, i) => a + Number(i.betrag || 0), 0));
  const mMax = Math.max(...months, 1);
  const yearSum = months.reduce((a, b) => a + b, 0);
  const curM = new Date().getFullYear() === y ? new Date().getMonth() : (y < new Date().getFullYear() ? 11 : -1);
  const dl = deadlines(S.persons, S.invoices).filter(d => !d.overdue).slice(0, 3);
  const standalone = matchMedia("(display-mode: standalone)").matches;
  const groups = {};
  for (const { p, r } of results) { const c = choiceOf(p, r); if (c.choice !== "none") (groups[c.choice] ||= []).push(p.name); }
  const how = [groups.keep?.length ? `Rückerstattung: ${groups.keep.join(", ")}` : "", groups.submit?.length ? `Einreichen: ${groups.submit.join(", ")}` : ""].filter(Boolean).join(" · ");
  const unpaidSum = unpaid.reduce((a, i) => a + Number(i.betrag || 0), 0);

  page(`<header class="top"><div class="top-t"><span class="sub">${greeting()}</span><h1>Übersicht</h1></div>${yearSeg()}</header>
    <main class="main">
      ${installEvt && !standalone ? `<section class="card install"><div><strong>Als App installieren</strong><span class="small muted">Eigenes Symbol, Vollbild, offline nutzbar.</span></div><button class="btn primary sm" type="button" id="install">Installieren</button></section>` : ""}
      <section class="card hero">
        <span class="sub">Rückfluss ${y} bei bester Wahl</span>
        <span class="hero-n">${fmtEur0(back)}</span>
        <span class="xs muted">nach Steuer${how ? " · " + esc(how) : ""}</span>
        <div class="hero-grid">
          <div><span class="sub">Rechnungen</span><b>${fmtEur(yearSum)}</b><span class="xs muted">${yearInv.length} Stück</span></div>
          <div><span class="sub">Noch zu zahlen</span><b class="${late.length ? "bad-t" : ""}">${fmtEur(unpaidSum)}</b><span class="xs muted">${unpaid.length} offen</span></div>
          <div><span class="sub">Bei Einreichung</span><b>${fmtEur(payoutSum)}</b><span class="xs muted">nach ${fmtEur0(sbSum)} Selbstbehalt</span></div>
          <div><span class="sub">Erstattung ausstehend</span><b>${pending.length}</b><span class="xs muted">${pending.length === 1 ? "Rechnung" : "Rechnungen"} eingereicht</span></div>
        </div>
      </section>
      ${late.length ? `<div class="stack-s"><a class="notice bad" href="#/rechnungen" data-filter="unpaid"><span class="dot"></span><span>${late.length === 1 ? "1 Rechnung" : late.length + " Rechnungen"} über dem Zahlungsziel</span>${ic("chev", 18)}</a>
        <button class="btn sm self-start" type="button" id="paid-all" style="margin-left:4px">Alle als bezahlt markieren</button></div>` : ""}
      <section class="stack-s">
        <h2 class="sec-t">Familie</h2>
        ${results.length ? `<div class="card list">${results.map(x => personRow(x.p, x.r)).join("")}</div>` : `<div class="card empty">Noch keine Personen. <a href="#/einstellungen">In den Einstellungen anlegen</a>.</div>`}
      </section>
      <section class="card stack">
        <div class="split"><h2 class="h3">Arztkosten</h2><span class="small muted">${fmtEur(yearSum)} gesamt</span></div>
        <div class="bars" role="img" aria-label="Arztkosten pro Monat ${y}">${months.map((v, m) => `<div class="bar ${v ? "has" : ""} ${m > curM ? "future" : ""}" style="height:${v ? Math.max(6, v / mMax * 92) : 4}px">${v === Math.max(...months) && v ? `<span>${fmtEur0(v)}</span>` : ""}</div>`).join("")}</div>
        <div class="bars-x">${"JFMAMJJASOND".split("").map((c, m) => `<span class="${months[m] ? "on" : ""}">${c}</span>`).join("")}</div>
      </section>
      <section class="stack-s">
        <div class="split" style="margin:0 4px"><h2 class="h3" style="font-size:17px">Als Nächstes</h2><a href="#/fristen" class="small">Alle</a></div>
        ${dl.length ? `<div class="card list">${dl.map(d => `<div class="dl"><span class="datebox"><span>${MONTHS[Number(d.date.slice(5, 7)) - 1]}${d.date.slice(0, 4) !== String(new Date().getFullYear()) ? " " + d.date.slice(2, 4) : ""}</span><b>${Number(d.date.slice(8, 10))}</b></span><span class="small">${esc(d.text)}</span></div>`).join("")}</div>` : `<div class="card empty small">Keine anstehenden Fristen.</div>`}
      </section>
      <p class="foot">Alle Beträge sind Schätzungen auf Basis deiner Tarifangaben.</p>
      <div class="privacy-foot">${ic("lock", 14)} Nur auf diesem Gerät · verschlüsselt</div>
    </main>`, "home");

  bindYear(viewHome);
  $("#install")?.addEventListener("click", async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; viewHome(); });
  $("[data-filter=unpaid]")?.addEventListener("click", () => { ui.fStatus = "unpaid"; ui.fPerson = "all"; });
  $("#paid-all")?.addEventListener("click", async () => {
    if (!(await confirmBox("Als bezahlt markieren?", `${late.length} überfällige Rechnung(en) werden als bezahlt markiert.`, "Markieren"))) return;
    late.forEach(i => { i.bezahlt = true; i.bezahltAm = today(); });
    await save(); toast("Als bezahlt markiert"); viewHome();
  });
}
const short = s => { s = String(s || "Rechnung"); return s.length > 28 ? s.slice(0, 26) + "…" : s; };

// ---------- Rechnungsliste ----------
function stamps(i) {
  const t = [];
  if (i.bezahlt) t.push(`<span class="tag good">Bezahlt</span>`);
  else if (i.faellig && i.faellig < today()) t.push(`<span class="tag bad">Überfällig seit ${fmtShort(i.faellig)}</span>`);
  else t.push(`<span class="tag warn">Offen${i.faellig ? " bis " + fmtShort(i.faellig) : ""}</span>`);
  if (i.erstattet !== null && i.erstattet !== undefined && i.erstattet !== "") t.push(`<span class="tag good">Erstattet ${fmtEur(i.erstattet)}</span>`);
  else if (i.eingereicht) t.push(`<span class="tag acc">Eingereicht${i.eingereichtAm ? " " + fmtShort(i.eingereichtAm) : ""}</span>`);
  else t.push(`<span class="tag">Nicht eingereicht</span>`);
  if (isNeutral(i.kategorie)) t.push(`<span class="tag">BRE-neutral</span>`);
  if (i.unfall) t.push(`<span class="tag">Unfall</span>`);
  return t.join("");
}

function viewList() {
  const y = ui.year;
  const base = S.invoices.filter(i => yearOf(i) === y && (ui.fPerson === "all" || i.personId === ui.fPerson));
  const cnt = { unpaid: base.filter(i => !i.bezahlt).length, notsub: base.filter(i => !i.eingereicht && !isNeutral(i.kategorie)).length, refund: base.filter(refundOpen).length };
  let list = base;
  if (ui.fStatus === "unpaid") list = list.filter(i => !i.bezahlt);
  if (ui.fStatus === "notsub") list = list.filter(i => !i.eingereicht);
  if (ui.fStatus === "refund") list = list.filter(refundOpen);
  const q = ui.q.trim().toLowerCase();
  if (q) list = list.filter(i => `${i.arzt} ${i.notiz} ${catLabel(i.kategorie)}`.toLowerCase().includes(q));
  list = [...list].sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
  const exp = expectedFor();
  const byMonth = [];
  for (const i of list) { const k = (i.datum || "").slice(0, 7); let g = byMonth.find(x => x.k === k); if (!g) byMonth.push(g = { k, items: [] }); g.items.push(i); }
  const seg = (val, label, n) => `<button type="button" data-fs="${val}" aria-pressed="${ui.fStatus === val}">${label}${n ? `<span class="cnt">${n}</span>` : ""}</button>`;
  const chip = (val, label) => `<button type="button" class="chip" data-fp="${val}" aria-pressed="${ui.fPerson === val}">${label}</button>`;
  const row = i => { const st = statusOf(i), e = exp[i.id], pn = person(i.personId)?.name || "?";
    return `<a href="#/rechnung/${i.id}" class="row">
      <span class="cat">${ic(CAT_IC[i.kategorie] || "doc", 20)}</span>
      <span class="row-t"><b>${esc(i.arzt || "Ohne Praxisangabe")}</b><span class="xs muted">${dShort(i.datum)} · ${esc(pn)}${i.notiz ? " · " + esc(i.notiz) : ""}</span>${e ? `<span class="xs good-t">${fmtEur(e.refund)} zurück</span>` : ""}</span>
      <span class="row-v"><b>${fmtEur(i.betrag)}</b><span class="st ${st.cls}">${esc(st.label)}</span></span></a>`; };

  page(`${header("Rechnungen", { right: yearSeg() })}
    <main class="main">
      <label class="search">${ic("search", 18)}<span class="sr">Suchen</span><input id="q" type="search" placeholder="Suchen" value="${esc(ui.q)}"></label>
      <div class="seg full" role="group" aria-label="Status">${seg("all", "Alle")}${seg("unpaid", "Zu zahlen", cnt.unpaid)}${seg("notsub", "Einreichen", cnt.notsub)}${seg("refund", "Erstattung", cnt.refund)}</div>
      ${S.persons.length > 1 ? `<div class="chips">${chip("all", "Alle")}${S.persons.map(p => chip(p.id, esc(p.name))).join("")}</div>` : ""}
      ${byMonth.length ? byMonth.map(g => `<div class="stack-s"><div class="month-h"><span>${g.k ? `${MONTHS_L[Number(g.k.slice(5, 7)) - 1]} ${g.k.slice(0, 4)}` : "Ohne Datum"}</span><span>${fmtEur(g.items.reduce((a, i) => a + Number(i.betrag || 0), 0))}</span></div>
        <div class="card list">${g.items.map(row).join("")}</div></div>`).join("")
        : `<div class="card empty"><p>${S.invoices.length ? "Keine Rechnungen für diese Auswahl." : "Noch keine Rechnungen."}</p><a class="btn primary" href="#/neu">${ic("cam", 20)} Erste Rechnung erfassen</a></div>`}
    </main>`, "list");

  bindYear(viewList);
  $("#q").oninput = e => { ui.q = e.target.value; clearTimeout(viewList._t); viewList._t = setTimeout(() => { const pos = e.target.selectionStart; viewList(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
}
root.addEventListener("click", e => {
  const fp = e.target.closest("[data-fp]"); if (fp) { ui.fPerson = fp.dataset.fp; viewList(); return; }
  const fs = e.target.closest("[data-fs]"); if (fs) { ui.fStatus = fs.dataset.fs; viewList(); return; }
  if (e.target.closest(".file-in")) picking = Date.now();
});
async function loadThumbs() {
  for (const el of $$("[data-thumb]")) {
    const id = el.dataset.thumb; if (!id) continue;
    const b = await store.getBlob(id); if (!b || !el.isConnected) continue;
    const url = URL.createObjectURL(b);
    el.innerHTML = `<img src="${url}" alt="">`;
  }
}

// ---------- Erfassen / Bearbeiten ----------
function newDraft() {
  return {
    isNew: true,
    inv: { id: uid("inv-"), personId: S.persons[0]?.id || "", datum: today(), arzt: "", betrag: "", kategorie: "ambulant", faellig: "", bezahlt: false, bezahltAm: "", eingereicht: false, eingereichtAm: "", erstattet: null, notiz: "", pages: [], original: null, createdAt: new Date().toISOString() },
    pages: [], original: null, pdfText: "", status: null, sure: {}, src: {}, removed: [],
  };
}
async function draftFromInvoice(inv) {
  const d = { isNew: false, inv: structuredClone(inv), pages: [], original: inv.original ? { id: inv.original.id, type: inv.original.type } : null, pdfText: "", status: null, sure: {}, src: {}, removed: [] };
  for (const pg of inv.pages || []) { const b = await store.getBlob(pg.id); if (b) d.pages.push({ id: pg.id, blob: b, url: URL.createObjectURL(b) }); }
  return d;
}

function fieldState(k) {
  if (draft.src[k] === "ki") return `<span class="fs ki">KI</span>`;
  if (draft.src[k] === "ocr") return draft.sure[k] ? `<span class="fs ok">sicher</span>` : `<span class="fs chk">bitte prüfen</span>`;
  return "";
}
const flagCls = k => draft.src[k] === "ki" ? "f-ki" : draft.src[k] === "ocr" && !draft.sure[k] ? "f-chk" : "";

function viewEdit() {
  const i = draft.inv;
  const hasPages = draft.pages.length > 0;
  const st = draft.status;
  const prov = PROVIDERS[S.settings.ai.provider] || PROVIDERS.claude;
  const st0 = statusOf(i);
  const fr = (id, label, k, control) => `<label class="fr" for="${id}"><span>${label}${k ? fieldState(k) : ""}</span>${control}</label>`;
  page(`<header class="top with-back">
      <a class="icon-btn" href="${draft.isNew ? "#/" : "#/rechnungen"}" aria-label="Zurück">${ic("back", 22)}</a>
      <span class="top-c">${draft.isNew ? "Rechnung erfassen" : "Rechnung"}</span>
      ${!draft.isNew ? `<button type="button" class="icon-btn" id="f-share" aria-label="Beleg teilen" ${hasPages || draft.original ? "" : "disabled"}>${ic("up", 20)}</button>` : `<span style="width:44px"></span>`}
    </header>
    <main class="main">
      ${!draft.isNew ? `<section class="inv-hero">
          <span class="small muted">${esc(i.arzt || "Ohne Praxisangabe")}</span>
          <span class="amt">${fmtEur(i.betrag)}</span>
          <span class="pill-st ${st0.cls}">${st0.cls === "bad" ? `Zahlungsziel ${dShort(i.faellig)} überschritten` : esc(st0.label[0].toUpperCase() + st0.label.slice(1))}</span>
        </section>
        <div class="grid2">
          <button type="button" class="btn ${i.bezahlt ? "on" : "primary"}" id="q-paid">${i.bezahlt ? `${ic("check", 18)} Bezahlt` : "Als bezahlt"}</button>
          <button type="button" class="btn ${i.eingereicht ? "on" : ""}" id="q-sub">${i.eingereicht ? `${ic("check", 18)} Eingereicht` : "Eingereicht"}</button>
        </div>` : ""}

      <section class="${hasPages ? "card stack" : "stack"}">
        ${hasPages ? `<div class="pages">${draft.pages.map((p, n) => `<figure class="pg"><img src="${p.url}" alt="Seite ${n + 1}"><figcaption><button type="button" class="icon-btn sm" data-rot="${n}" aria-label="Seite ${n + 1} drehen">${ic("rot", 18)}</button><span class="xs">Seite ${n + 1}</span><button type="button" class="icon-btn sm" data-delpg="${n}" aria-label="Seite ${n + 1} entfernen">${ic("trash", 18)}</button></figcaption></figure>`).join("")}</div>`
          : `<div class="capture-empty">${ic("cam", 36)}<p>Fotografiere die Rechnung gerade, bei gutem Licht und mit allen vier Ecken im Bild – oder wähle ein PDF.</p></div>`}
        <div class="grid2">
          <label class="btn ${hasPages ? "" : "primary"} file-btn">${ic("cam", 20)} ${hasPages ? "Weitere Seite" : "Fotografieren"}<input type="file" accept="image/*" capture="environment" class="file-in" id="f-cam"></label>
          <label class="btn file-btn">${ic("file", 20)} ${hasPages ? "Datei" : "Foto / PDF"}<input type="file" accept="image/*,application/pdf" multiple class="file-in" id="f-file"></label>
        </div>
        ${hasPages ? `<div class="read-st">${st?.busy ? `<span class="spin" aria-hidden="true"></span>` : st?.error ? `<span class="st-i bad">${ic("alert", 18)}</span>` : st?.done ? `<span class="st-i ok">${ic("check", 18)}</span>` : `<span class="st-i">${ic("file", 18)}</span>`}
            <div><strong>${esc(st?.title || "Beleg gespeichert")}</strong><span class="xs muted">${esc(st?.text || "Angaben automatisch auslesen lassen:")}</span></div></div>
          ${st?.progress != null ? `<div class="prog"><div style="width:${Math.round(st.progress * 100)}%"></div></div>` : ""}
          <div class="grid2">
            <button type="button" class="btn sm" id="ocr" ${st?.busy ? "disabled" : ""}>${ic("file", 18)} Ohne KI lesen</button>
            <button type="button" class="btn sm soft" id="ai" ${st?.busy ? "disabled" : ""}>${ic("spark", 18)} Mit KI lesen</button>
          </div>
          <p class="xs muted">KI: ${esc(prov.label)}. Nur die Seitenbilder dieser Rechnung werden gesendet.</p>` : ""}
      </section>

      <form id="inv-form" class="stack" novalidate>
        <div class="card flist">
          ${fr("f-person", "Für", "personId", `<select id="f-person" class="${flagCls("personId")}">${S.persons.map(p => `<option value="${p.id}" ${p.id === i.personId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`)}
          ${fr("f-arzt", "Praxis", "arzt", `<input id="f-arzt" class="${flagCls("arzt")}" value="${esc(i.arzt)}" autocomplete="off" placeholder="z. B. Dr. Meier">`)}
          ${fr("f-betrag", "Betrag (€)", "betrag", `<input id="f-betrag" type="number" inputmode="decimal" step="0.01" min="0" class="${flagCls("betrag")}" value="${i.betrag === "" || i.betrag == null ? "" : Number(i.betrag).toFixed(2)}" placeholder="0,00" required>`)}
          ${fr("f-datum", "Rechnungsdatum", "datum", `<input id="f-datum" type="date" class="${flagCls("datum")}" value="${esc(i.datum)}" required>`)}
          ${fr("f-faellig", "Zahlbar bis", "faellig", `<input id="f-faellig" type="date" class="${flagCls("faellig")}" value="${esc(i.faellig || "")}">`)}
          ${fr("f-kat", "Kategorie", "kategorie", `<select id="f-kat" class="${flagCls("kategorie")}">${CATS.map(c => `<option value="${c.k}" ${c.k === i.kategorie ? "selected" : ""}>${esc(c.l)}</option>`).join("")}</select>`)}
          ${fr("f-notiz", "Notiz", "notiz", `<input id="f-notiz" class="${flagCls("notiz")}" value="${esc(i.notiz || "")}" placeholder="z. B. MRT Knie">`)}
        </div>
        ${positionsEditor()}
        ${refundBox()}
        <div class="card toggles">
          <label class="tg"><span>Bezahlt</span><input type="checkbox" class="sw" id="f-bezahlt" ${i.bezahlt ? "checked" : ""}></label>
          ${isDental(i.kategorie) ? `<label class="tg"><span class="tg-t"><span>Unfallfolge</span><span class="xs muted">zählt nicht zum Zahn-Höchstbetrag</span></span><input type="checkbox" class="sw" id="f-unfall" ${i.unfall ? "checked" : ""}></label>` : ""}
          <label class="tg"><span>Eingereicht</span><input type="checkbox" class="sw" id="f-eing" ${i.eingereicht ? "checked" : ""}></label>
          <label class="tg"><span>Erstattet (€)</span><input id="f-erst" type="number" inputmode="decimal" step="0.01" min="0" class="mini" value="${i.erstattet ?? ""}" placeholder="–"></label>
        </div>
        <p class="form-err" id="f-err" role="alert"></p>
        <button type="submit" class="btn primary big" id="f-save">${draft.isNew ? "Rechnung speichern" : "Änderungen speichern"}</button>
        ${!draft.isNew ? `<button type="button" class="btn text-danger" id="f-del">Rechnung löschen</button>` : ""}
      </form>
    </main>`);

  $("#q-paid")?.addEventListener("click", () => quickToggle("bezahlt"));
  $("#q-sub")?.addEventListener("click", () => quickToggle("eingereicht"));
  $("#f-cam").onchange = e => addFiles(e.target.files);
  $("#f-file").onchange = e => addFiles(e.target.files);
  $("#ocr")?.addEventListener("click", () => runOcr());
  $("#ai")?.addEventListener("click", () => runAi());
  $$("[data-rot]").forEach(b => b.onclick = () => rotatePage(Number(b.dataset.rot)));
  $$("[data-delpg]").forEach(b => b.onclick = () => removePage(Number(b.dataset.delpg)));
  $("#inv-form").onsubmit = saveDraft;
  $("#f-kat").addEventListener("change", () => { collectForm(); viewEdit(); });
  $("#f-person").addEventListener("change", () => { collectForm(); viewEdit(); });
  $("#pos-add")?.addEventListener("click", () => { collectForm(); const k = draft.inv.kategorie; (draft.inv.positions ||= []).push({ code: k === "logopaedie" ? "51b" : "54a", text: "", qty: 1, price: 0 }); viewEdit(); });
  $$("[data-delpos]").forEach(b => b.onclick = () => { collectForm(); draft.inv.positions.splice(Number(b.dataset.delpos), 1); viewEdit(); });
  $$("[data-pos]").forEach(el => el.addEventListener("change", () => {
    const pos = draft.inv.positions[Number(el.dataset.pos)]; const f = el.dataset.f;
    pos[f] = f === "code" ? el.value : Number(el.value) || 0;
    draft.src.positions = "user"; collectForm(); viewEdit();
  }));
  $("#f-del")?.addEventListener("click", deleteInvoice);
  $("#f-share")?.addEventListener("click", shareBeleg);
  // Eingaben sofort in den Entwurf übernehmen, damit ein Neuzeichnen nichts verliert
  const FIELD = { "f-person": "personId", "f-arzt": "arzt", "f-datum": "datum", "f-betrag": "betrag", "f-faellig": "faellig", "f-kat": "kategorie", "f-notiz": "notiz" };
  $("#inv-form").addEventListener("input", e => { const k = FIELD[e.target.id]; if (k) { draft.src[k] = "user"; e.target.classList.remove("f-ki", "f-chk"); e.target.closest(".fr, .field")?.querySelector(".fs")?.remove(); } collectForm(); const box = $("#refund-box"); const html = refundBox(); if (box) { if (html) box.outerHTML = html; else box.remove(); } else if (html) $(".toggles").insertAdjacentHTML("beforebegin", html); });
  $("#inv-form").addEventListener("change", collectForm);
}

function positionsEditor() {
  const i = draft.inv;
  if (!CAPPED_CATS.includes(i.kategorie)) return "";
  const p = person(i.personId);
  const capped = p && capsOf(p) === "bbhv";
  const pos = i.positions || [];
  const items = BBHV.items.filter(x => x.cat === i.kategorie || x.cat === "both");
  const pc = p ? positionCheck(p, i) : { rows: [] };
  const diff = pos.length ? Math.round(((Number(i.betrag) || 0) - pc.billed) * 100) / 100 : 0;
  return `<section class="card stack" id="pos-ed">
    <div class="split"><h2 class="h3">Leistungspositionen ${fieldState("positions")}</h2><span class="xs muted">${capped ? `Höchstbeträge BBhV ab ${fmtDate(BBHV.valid)}` : "ohne Höchstbeträge im Tarif"}</span></div>
    ${capped ? `<p class="xs muted">Dein Tarif erstattet ${i.kategorie === "logopaedie" ? "Logopädie" : "Ergotherapie"} nur bis zum Beihilfe-Höchstbetrag je Leistung. Trag die Positionen der Rechnung ein, dann rechnet die App den Teil heraus, der nicht erstattet wird.</p>` : ""}
    ${pc.rows.map((r, n) => `<div class="pos ${r.cut > 0.004 ? "pos-cut" : ""}">
      <select data-pos="${n}" data-f="code" aria-label="Leistung"><option value="">Andere Leistung</option>${items.map(x => `<option value="${x.code}" ${x.code === r.code ? "selected" : ""}>${x.code} · ${esc(x.l)}</option>`).join("")}</select>
      <div class="pos-row">
        <label class="pf"><span>Anzahl</span><input data-pos="${n}" data-f="qty" type="number" inputmode="numeric" min="1" step="1" value="${r.qty}"></label>
        <label class="pf"><span>Preis je (€)</span><input data-pos="${n}" data-f="price" type="number" inputmode="decimal" min="0" step="0.01" value="${r.price.toFixed(2)}"></label>
        <button type="button" class="icon-btn sm" data-delpos="${n}" aria-label="Position entfernen">${ic("trash", 18)}</button>
      </div>
      <div class="xs ${r.cut > 0.004 ? "warn-t" : "muted"}">${r.max != null ? (r.cut > 0.004 ? `Anerkannt ${fmtEur(r.max)} statt ${fmtEur(r.price)} je Leistung → ${fmtEur(r.cut)} nicht erstattungsfähig` : `Im Rahmen des Höchstbetrags (${fmtEur(r.max)})`) : capped ? "Ohne Höchstbetrag gerechnet – passende Leistung wählen" : ""}</div>
    </div>`).join("")}
    <button type="button" class="btn sm" id="pos-add">${ic("plus", 18)} Position hinzufügen</button>
    ${pos.length ? `<div class="wf">
      <div class="wf-r"><span>Abgerechnet laut Positionen</span><span class="num">${fmtEur(pc.billed)}</span></div>
      ${capped ? `<div class="wf-r minus"><span>− über Höchstbetrag</span><span class="num">${fmtEur(pc.capCut)}</span></div><div class="wf-r sum"><span>= erstattungsfähig vor Satz</span><span class="num">${fmtEur(pc.recognized + pc.rest)}</span></div>` : ""}
    </div>
    ${Math.abs(diff) >= 0.01 ? `<p class="xs warn-t">Die Positionen ergeben ${fmtEur(pc.billed)}, der Rechnungsbetrag ist ${fmtEur(i.betrag)}. ${diff > 0 ? "Der Rest wird ohne Höchstbetrag gerechnet." : "Bitte Positionen prüfen."}</p>` : ""}` : ""}
  </section>`;
}

function refundBox() {
  const i = draft.inv;
  if (!(Number(i.betrag) > 0) || !i.personId || !i.datum) return "";
  const others = S.invoices.filter(x => x.id !== i.id);
  const l = expectedFor([...others, i])[i.id];
  if (!l) return "";
  const p = person(i.personId);
  const real = i.erstattet !== null && i.erstattet !== undefined && i.erstattet !== "";
  const row = (a, b, cls = "") => `<div class="wf-r ${cls}"><span>${a}</span><span class="num">${b}</span></div>`;
  return `<section class="card stack-s" id="refund-box">
    <div class="split"><h2 class="h3">Erstattung bei Einreichung</h2><a class="xs" href="#/jahr/${i.personId}/${yearOf(i)}">${esc(p?.name || "")} ${yearOf(i)}</a></div>
    <div class="wf">
      ${row("Rechnungsbetrag", fmtEur(l.amount))}
      ${l.capCut > 0.004 ? row("− über Beihilfe-Höchstbetrag", fmtEur(l.capCut), "minus") : ""}
      ${row(`− nicht erstattet (Satz ${Math.round(l.rate * 100)} %)`, fmtEur(l.rateCut), "minus")}
      ${l.dentalCut > 0.004 ? row("− über Zahn-Höchstbetrag", fmtEur(l.dentalCut), "minus") : ""}
      ${row(l.neutral ? "− Selbstbehalt (entfällt bei Vorsorge)" : l.sbFree ? "− Selbstbehalt (gilt nicht für Zahn)" : "− Anteil am Selbstbehalt", fmtEur(l.sbPart), "minus")}
      ${row("= voraussichtlich erstattet", fmtEur(l.refund), "sum")}
      ${real ? row("tatsächlich erstattet", fmtEur(i.erstattet), Math.abs(Number(i.erstattet) - l.refund) < 0.01 ? "extra" : "diff") : ""}
    </div>
    ${real && Math.abs(Number(i.erstattet) - l.refund) >= 0.01 ? `<p class="xs muted">Abweichung ${fmtEur(Number(i.erstattet) - l.refund)} – prüfe den Leistungsbescheid oder die Erstattungssätze im Tarif.</p>` : ""}
    ${(() => { if (!isDental(i.kategorie) || !p) return ""; const d = dentalLedger(p, [...others, i], yearOf(i)); return d.active ? `<p class="xs ${l.dentalCut > 0.004 ? "bad-t" : "muted"}">${i.unfall ? "Unfallfolge: zählt nicht zum Zahn-Budget." : `Zahn-Budget ${p.name}: noch ${fmtEur(d.remaining)} von ${fmtEur(d.limit)} frei (inkl. dieser Rechnung).`}</p>` : ""; })()}
    ${!l.neutral && !l.sbFree ? `<p class="xs muted">Der Selbstbehalt wird auf die Rechnungen des Jahres in Datumsreihenfolge verrechnet.</p>` : ""}
  </section>`;
}

async function quickToggle(k) {
  collectForm();
  const i = draft.inv;
  i[k] = !i[k];
  if (k === "bezahlt") i.bezahltAm = i.bezahlt ? today() : "";
  if (k === "eingereicht") i.eingereichtAm = i.eingereicht ? today() : "";
  const idx = S.invoices.findIndex(x => x.id === i.id);
  if (idx >= 0) { S.invoices[idx] = { ...S.invoices[idx], [k]: i[k], bezahltAm: i.bezahltAm, eingereichtAm: i.eingereichtAm }; await save(); }
  toast(k === "bezahlt" ? (i.bezahlt ? "Als bezahlt markiert" : "Nicht mehr bezahlt") : (i.eingereicht ? "Als eingereicht markiert" : "Nicht mehr eingereicht"));
  viewEdit();
}

function collectForm() {
  if (!$("#inv-form")) return;
  const i = draft.inv;
  i.personId = $("#f-person").value; i.arzt = $("#f-arzt").value.trim(); i.datum = $("#f-datum").value;
  const b = $("#f-betrag").value; i.betrag = b === "" ? "" : Math.round(Number(b) * 100) / 100;
  i.faellig = $("#f-faellig").value || ""; i.kategorie = $("#f-kat").value; i.notiz = $("#f-notiz").value.trim();
  const wasPaid = i.bezahlt, wasSub = i.eingereicht;
  i.bezahlt = $("#f-bezahlt").checked; i.eingereicht = $("#f-eing").checked;
  if (i.bezahlt && !wasPaid) i.bezahltAm = today();
  if (i.eingereicht && !wasSub) i.eingereichtAm = today();
  const er = $("#f-erst").value; i.erstattet = er === "" ? null : Number(er);
  const uf = $("#f-unfall"); if (uf) i.unfall = uf.checked; else if (!isDental(i.kategorie)) delete i.unfall;
}

async function addFiles(files) {
  collectForm();
  const list = [...(files || [])];
  if (!list.length) return;
  let pdfNow = false;
  for (const f of list) {
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
    try {
      if (isPdf) {
        draft.status = { busy: true, title: "PDF wird geöffnet …", text: "" }; viewEdit();
        const r = await readPdf(f);
        for (const b of r.pages) draft.pages.push({ blob: b, url: URL.createObjectURL(b) });
        if (!draft.original) draft.original = { blob: f, type: "application/pdf" };
        draft.pdfText = (draft.pdfText + "\n" + r.text).trim();
        pdfNow = true;
      } else {
        const b = await normalizeImage(f);
        draft.pages.push({ blob: b, url: URL.createObjectURL(b) });
      }
    } catch (e) {
      console.error(e);
      draft.status = { error: true, title: isPdf ? "PDF konnte nicht geöffnet werden" : "Bild konnte nicht geöffnet werden", text: isPdf ? "Ist das PDF passwortgeschützt? Mach sonst ein Foto." : "Stell die Kamera auf JPEG um oder mach einen Screenshot." };
      viewEdit(); return;
    }
  }
  draft.status = null;
  viewEdit();
  if (pdfNow && draft.pdfText.length > 40) applyParsed(parseInvoice(draft.pdfText, S.persons), "PDF-Text gelesen");
  else runOcr();
}

async function rotatePage(n) {
  const p = draft.pages[n];
  const b = await normalizeImage(p.blob, 2200, 90);
  if (p.id) draft.removed.push(p.id);
  draft.pages[n] = { blob: b, url: URL.createObjectURL(b) };
  if (draft.original) { if (draft.original.id) draft.removed.push(draft.original.id); draft.original = null; }
  viewEdit();
}
function removePage(n) {
  const p = draft.pages[n];
  if (p.id) draft.removed.push(p.id);
  draft.pages.splice(n, 1);
  if (draft.original) { if (draft.original.id) draft.removed.push(draft.original.id); draft.original = null; }
  viewEdit();
}

function applyParsed(res, title) {
  collectForm();
  let sure = 0, found = 0;
  for (const [k, v] of Object.entries(res.fields)) {
    if (v === undefined || v === null || v === "") continue;
    // Nichts überschreiben, was jemand selbst eingetragen hat
    if (draft.src[k] === "user") continue;
    // Bei gespeicherten Rechnungen nur Lücken füllen (plus Kategorie/Positionen)
    if (!draft.isNew && !["positions", "kategorie"].includes(k) && draft.inv[k] !== "" && draft.inv[k] != null) continue;
    if (!draft.isNew && k === "kategorie" && !["logopaedie", "ergotherapie"].includes(v)) continue;
    draft.inv[k] = v; draft.src[k] = "ocr"; draft.sure[k] = !!res.sure[k];
    found++; if (res.sure[k]) sure++;
  }
  const keys = ["datum", "betrag", "arzt", "faellig"];
  const keyFound = keys.filter(k => res.fields[k]).length, keySure = keys.filter(k => res.fields[k] && res.sure[k]).length;
  draft.status = { done: true, title, text: found ? `${keyFound} von 4 Hauptfeldern gefunden${keySure < keyFound ? ` – orange markierte bitte prüfen` : ""}.` : "Nichts Brauchbares gefunden. Versuch es mit KI oder trag die Felder selbst ein." };
  viewEdit();
}

async function runOcr() {
  if (!draft.pages.length) return;
  // Gespeichertes PDF: eingebetteten Text erneut lesen
  if (draft.pdfText.length <= 40 && draft.original?.id) {
    try { const b = await store.getBlob(draft.original.id); if (b) draft.pdfText = (await readPdf(b, 6)).text || ""; } catch {}
  }
  if (draft.pdfText.length > 40) { applyParsed(parseInvoice(draft.pdfText, S.persons), "PDF-Text gelesen"); return; }
  draft.status = { busy: true, title: "Texterkennung läuft …", text: "Beim ersten Mal werden die deutschen Sprachdaten geladen (einmalig, braucht Internet).", progress: 0 };
  viewEdit();
  try {
    const text = await ocrImages(draft.pages.map(p => p.blob), m => {
      if (!draft?.status?.busy) return;
      const label = /loading|load/i.test(m.status) ? "Texterkennung wird geladen …" : /recogniz/i.test(m.status) ? "Text wird erkannt …" : m.status;
      draft.status.title = label; draft.status.progress = m.progress;
      const t = $(".read-st strong"); if (t) t.textContent = label;
      const pr = $(".prog > div"); if (pr) pr.style.width = Math.round((m.progress || 0) * 100) + "%";
    });
    draft.ocrText = text;
    applyParsed(parseInvoice(text, S.persons), "Auf dem Gerät gelesen");
  } catch (e) {
    console.error(e);
    draft.status = { error: true, title: "Texterkennung nicht verfügbar", text: navigator.onLine ? "Die Texterkennung konnte nicht geladen werden. Versuch es später oder nutze KI." : "Beim ersten Mal braucht die Texterkennung Internet, um die Sprachdaten zu laden." };
    viewEdit();
  }
}

async function runAi() {
  collectForm();
  const ai = S.settings.ai;
  const prov = PROVIDERS[ai.provider] || PROVIDERS.claude;
  if (!ai.apiKey) {
    const go = await modal({ title: "API-Schlüssel fehlt", body: `<p>Für das Auslesen mit ${esc(prov.label)} brauchst du einen eigenen Schlüssel. Trag ihn in den Einstellungen ein.</p>`, actions: [{ label: "Abbrechen", value: false }, { label: "Zu den Einstellungen", value: true, primary: true }] });
    if (go) { sessionStorage.setItem("returnTo", location.hash); location.hash = "#/einstellungen"; }
    return;
  }
  if (ai.askBefore) {
    const r = await modal({
      title: `An ${prov.label} senden?`,
      body: `<p>${draft.pages.length === 1 ? "Das Foto dieser Rechnung wird" : `Die ${Math.min(3, draft.pages.length)} Seitenbilder dieser Rechnung werden`} zum Auslesen an ${esc(prov.label)} geschickt. Sonst verlässt nichts das Gerät.</p><label class="tg plain"><span>Nicht mehr fragen</span><input type="checkbox" class="sw" id="m-noask"></label>`,
      actions: [{ label: "Abbrechen", value: null }, { label: "Senden", primary: true, collect: w => ({ noask: $("#m-noask", w).checked }) }],
    });
    if (!r) return;
    if (r.noask) { ai.askBefore = false; await save(); }
  }
  draft.status = { busy: true, title: `${prov.label} liest die Rechnung …`, text: "Das dauert meist ein paar Sekunden." };
  viewEdit();
  try {
    const fields = await aiRead(ai, draft.pages.map(p => p.blob), S.persons, draft.pdfText);
    collectForm();
    let n = 0;
    for (const [k, v] of Object.entries(fields)) { if (draft.src[k] === "user") continue; draft.inv[k] = v; draft.src[k] = "ki"; n++; }
    draft.status = { done: true, title: `Mit ${prov.label} gelesen`, text: n ? `${n} Felder übernommen (blau markiert). Bitte kurz prüfen.` : "Die KI hat nichts erkannt." };
  } catch (e) {
    console.error(e);
    draft.status = { error: true, title: "KI-Auslesen fehlgeschlagen", text: e instanceof AIError ? e.message : "Unbekannter Fehler. Prüfe die Internetverbindung." };
  }
  viewEdit();
}

async function saveDraft(e) {
  e.preventDefault();
  collectForm();
  const i = draft.inv;
  const err = $("#f-err");
  if (!i.personId) { err.textContent = "Bitte zuerst eine Person anlegen (Einstellungen)."; return; }
  if (!i.datum) { err.textContent = "Bitte das Rechnungsdatum angeben."; $("#f-datum").focus(); return; }
  if (!(Number(i.betrag) > 0)) { err.textContent = "Bitte den Betrag angeben."; $("#f-betrag").focus(); return; }
  const btn = $("#f-save"); btn.disabled = true; btn.textContent = "Wird verschlüsselt gespeichert …";
  try {
    const pages = [];
    for (const p of draft.pages) {
      if (p.id && !p.blob) { pages.push({ id: p.id, type: "image/jpeg" }); continue; }
      if (p.id) { pages.push({ id: p.id, type: p.blob.type || "image/jpeg" }); continue; }
      const id = uid("pg-"); await store.putBlob(id, p.blob); pages.push({ id, type: p.blob.type || "image/jpeg" });
    }
    let original = null;
    if (draft.original?.blob) { const id = uid("orig-"); await store.putBlob(id, draft.original.blob); original = { id, type: "application/pdf" }; }
    else if (draft.original?.id) original = { id: draft.original.id, type: draft.original.type };
    for (const id of draft.removed) await store.deleteBlob(id);
    i.pages = pages; i.original = original;
    const idx = S.invoices.findIndex(x => x.id === i.id);
    if (idx >= 0) S.invoices[idx] = i; else S.invoices.push(i);
    await save();
    ui.year = yearOf(i);
    const wasNew = draft.isNew;
    draft = null;
    toast("Rechnung gespeichert");
    location.hash = wasNew ? "#/" : "#/rechnungen";
  } catch (ex) {
    console.error(ex);
    err.textContent = ex?.name === "QuotaExceededError" ? "Der Speicher des Handys ist voll." : "Speichern fehlgeschlagen. Bitte noch einmal versuchen.";
    btn.disabled = false; btn.textContent = "Rechnung speichern";
  }
}

async function deleteInvoice() {
  if (!(await confirmBox("Rechnung löschen?", "Die Rechnung und ihre Fotos werden von diesem Gerät gelöscht.", "Löschen", true))) return;
  const i = draft.inv;
  for (const p of i.pages || []) await store.deleteBlob(p.id);
  if (i.original) await store.deleteBlob(i.original.id);
  S.invoices = S.invoices.filter(x => x.id !== i.id);
  await save(); draft = null; toast("Rechnung gelöscht"); location.hash = "#/rechnungen";
}

async function shareBeleg() {
  const i = draft.inv;
  const p = person(i.personId);
  try {
    let blob;
    if (draft.original?.id) blob = await store.getBlob(draft.original.id);
    if (!blob) blob = await buildPackage({ person: p, year: yearOf(i), invoices: [i], getBlob: store.getBlob }).catch(() => null);
    if (!blob) { toast("Beleg konnte nicht erstellt werden."); return; }
    await shareOrSave(blob, `Rechnung_${i.datum}_${(i.arzt || "Beleg").replace(/[^\wäöüÄÖÜß-]+/g, "_").slice(0, 40)}.pdf`, "Arztrechnung");
  } catch (e) { console.error(e); toast("Teilen fehlgeschlagen."); }
}

// ---------- Einreichungspaket ----------
function viewPackage(pid, year) {
  const p = person(pid);
  if (!p) { location.hash = "#/"; return; }
  const inv = S.invoices.filter(i => i.personId === pid && yearOf(i) === year).sort((a, b) => a.datum.localeCompare(b.datum));
  const r = calc(p, S.invoices, year, S.settings.taxRate);
  page(`${header("Einreichungspaket", { back: "#/", sub: `${p.name} · ${year}` })}
    <main class="main">
      <section class="card stack">
        <p class="small">Die ausgewählten Rechnungen werden zu einem PDF zusammengefasst – mit Deckblatt und Summe. Das kannst du in der App oder im Portal von ${esc(p.insurer || "deiner Versicherung")} hochladen.</p>
        <p class="small muted">${r.submitWins ? `Einreichen lohnt sich: ${fmtEur(r.payout)} Erstattung gegenüber ${fmtEur(r.breLost ? 0 : r.breNet)} BRE nach Steuer.` : `Achtung: Für ${year} bringt die BRE nach Steuer (${fmtEur(r.breNet)}) voraussichtlich mehr als Einreichen (${fmtEur(r.payout)}).`}</p>
      </section>
      ${inv.length ? `<form id="pk" class="card inv-list">${inv.map(i => `<label class="pk-row"><input type="checkbox" name="sel" value="${i.id}" ${!i.eingereicht ? "checked" : ""}><span class="inv-b"><span class="split top-a"><strong>${esc(i.arzt || "Ohne Praxisangabe")}</strong><span class="num strong nowrap">${fmtEur(i.betrag)}</span></span><span class="small muted">${fmtDate(i.datum)} · ${esc(catLabel(i.kategorie))}${i.eingereicht ? " · schon eingereicht" : ""}${i.pages?.length ? "" : " · ohne Beleg"}</span></span></label>`).join("")}</form>
        <button type="button" class="btn primary big" id="pk-go">${ic("share", 20)} PDF erstellen und teilen</button>`
        : `<div class="card empty">Keine Rechnungen für ${year}.</div>`}
    </main>`);
  $("#pk-go")?.addEventListener("click", async () => {
    const ids = $$("#pk input[name=sel]:checked").map(x => x.value);
    const sel = inv.filter(i => ids.includes(i.id));
    if (!sel.length) { toast("Bitte mindestens eine Rechnung auswählen."); return; }
    const b = $("#pk-go"); b.disabled = true; b.textContent = "PDF wird erstellt …";
    try {
      const pdf = await buildPackage({ person: p, year, invoices: sel, getBlob: store.getBlob });
      const res = await shareOrSave(pdf, `Einreichung_${p.name.replace(/\W+/g, "_")}_${year}.pdf`, `Einreichung ${p.name} ${year}`);
      if (res !== "cancelled" && sel.some(i => !i.eingereicht)) {
        if (await confirmBox("Als eingereicht markieren?", `${sel.filter(i => !i.eingereicht).length} Rechnung(en) als heute eingereicht markieren?`, "Markieren")) {
          sel.forEach(i => { if (!i.eingereicht) { i.eingereicht = true; i.eingereichtAm = today(); } });
          await save(); toast("Als eingereicht markiert");
        }
      }
      viewPackage(pid, year);
    } catch (e) { console.error(e); toast("PDF konnte nicht erstellt werden."); b.disabled = false; }
  });
}

// ---------- Fristen ----------
function viewDeadlines() {
  const all = deadlines(S.persons, S.invoices);
  const over = all.filter(d => d.overdue && d.kind === "invoice");
  const next = all.filter(d => !d.overdue);
  const li = d => `<li class="dl"><span class="dl-d num ${d.overdue ? "bad-t" : ""}">${fmtShort(d.date)}<br>${d.date.slice(0, 4)}</span><span class="small">${esc(d.text)}</span></li>`;
  page(`${header("Fristen")}
    <main class="main">
      ${over.length ? `<section class="stack"><h2 class="h3 bad-t">Überfällig</h2><ol class="card list-plain">${over.map(li).join("")}</ol></section>` : ""}
      <section class="stack"><h2 class="h3">Demnächst</h2>${next.length ? `<ol class="card list-plain">${next.map(li).join("")}</ol>` : `<div class="card empty small">Keine anstehenden Fristen.</div>`}</section>
      <p class="foot">Fristen aus den Tarifbedingungen von uniVersa und Signal Iduna sowie die Zahlungsziele deiner offenen Rechnungen.</p>
    </main>`, "cal");
}

// ---------- Einstellungen ----------
async function viewSettings() {
  const s = S.settings;
  const last = await store.lastBackupAt();
  let usage = "";
  try { const est = await navigator.storage?.estimate?.(); if (est?.usage) usage = ` · ${(est.usage / 1048576).toFixed(1).replace(".", ",")} MB`; } catch {}
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const pages = S.invoices.reduce((a, i) => a + (i.pages?.length || 0), 0);
  const stale = !last || (Date.now() - new Date(last)) > 30 * 864e5;
  page(`${header("Einstellungen")}
    <main class="main">
      <section class="card dark stack">
        ${ic("lock", 32)}
        <h2 class="h2">Deine Daten bleiben auf diesem Handy</h2>
        <p class="small">Rechnungen, Fotos und Tarife liegen verschlüsselt im Speicher dieses Geräts. Es gibt kein Konto und keinen Server mit deinen Daten.</p>
        <span class="num xs soft">${S.invoices.length} Rechnungen · ${pages} Fotos · ${S.persons.length} Personen${usage}</span>
        ${persisted === false ? `<span class="xs soft">Tipp: Installiere die App auf dem Startbildschirm, damit Android den Speicher nicht automatisch aufräumt.</span>` : ""}
      </section>

      <section class="stack-s"><h3 class="sec">Backup</h3>
        <div class="card stack ${stale ? "warn-card" : ""}">
          <strong>${last ? `Letztes Backup: ${fmtDate(last.slice(0, 10))}` : "Noch kein Backup"}</strong>
          <p class="small">Ohne Backup sind deine Daten weg, wenn du das Handy verlierst oder die App löschst. Die Datei ist mit einem eigenen Passwort verschlüsselt – du kannst sie z. B. in Google Drive ablegen.</p>
          <button type="button" class="btn ink" id="bk-make">${ic("dl", 20)} Verschlüsseltes Backup erstellen</button>
          <label class="btn file-btn">${ic("file", 20)} Backup oder Import laden<input type="file" id="bk-load" accept="application/json,.json" class="file-in"></label>
        </div>
      </section>

      <section class="stack-s"><h3 class="sec">KI-Auslesen</h3>
        <form class="card list-form" id="ai-form">
          ${Object.entries(PROVIDERS).map(([k, p]) => `<label class="tg"><span class="tg-t"><span>${esc(p.label)}</span><span class="xs muted">${esc(p.note)}</span></span><input type="radio" name="prov" value="${k}" ${s.ai.provider === k ? "checked" : ""}></label>`).join("")}
          <label class="field pad-f"><span>API-Schlüssel <span class="xs muted">(${esc((PROVIDERS[s.ai.provider] || PROVIDERS.claude).keyHint)})</span></span><input id="ai-key" type="password" autocomplete="off" placeholder="Schlüssel einfügen" value="${esc(s.ai.apiKey)}"></label>
          <label class="tg"><span class="tg-t"><span>Vor jedem KI-Aufruf fragen</span><span class="xs muted">Nur die Seitenbilder werden gesendet</span></span><input type="checkbox" class="sw" id="ai-ask" ${s.ai.askBefore ? "checked" : ""}></label>
          <details class="pad-f"><summary class="small">Erweitert</summary><label class="field"><span>Modell (leer = Standard)</span><input id="ai-model" value="${esc(s.ai.model || "")}" placeholder="${esc((PROVIDERS[s.ai.provider] || PROVIDERS.claude).models[0])}"></label></details>
          <div class="pad-f"><button type="submit" class="btn primary">KI-Einstellungen speichern</button></div>
        </form>
      </section>

      <section class="stack-s"><h3 class="sec">Personen und Tarife</h3>
        <div class="card list-form">
          ${S.persons.map(p => `<a class="tg link" href="#/person/${p.id}"><span class="tg-t"><span>${esc(p.name)}</span><span class="xs muted">${esc(p.tariff)} · ${fmtEur(p.sb)} Selbstbehalt</span></span>${ic("chev", 20)}</a>`).join("")}
          <button type="button" class="tg link btnlike" id="add-p"><span>${ic("plus", 20)} Person hinzufügen</span></button>
          <form class="tg" id="tax-form"><span>Grenzsteuersatz</span><span class="row-s"><input id="tax" class="num mini" type="number" inputmode="decimal" step="0.1" min="0" max="55" value="${s.taxRate}"><span>%</span><button class="btn sm" type="submit">OK</button></span></form>
        </div>
      </section>

      <section class="stack-s"><h3 class="sec">Darstellung</h3>
        <div class="card list-form"><div class="tg"><span>Farbschema</span>
          <div class="seg" role="group" aria-label="Farbschema">${[["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(([v, l]) => `<button type="button" data-theme-set="${v}" aria-pressed="${getTheme() === v}">${l}</button>`).join("")}</div>
        </div></div>
      </section>

      <section class="stack-s"><h3 class="sec">App-Sperre</h3>
        <div class="card list-form">
          <label class="tg"><span>Sperren nach</span><select id="lockmin">${[[0, "Sofort"], [1, "1 Minute"], [5, "5 Minuten"], [15, "15 Minuten"]].map(([v, l]) => `<option value="${v}" ${s.lockMinutes === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <button type="button" class="tg link btnlike" id="pin-ch"><span>PIN ändern</span>${ic("chev", 20)}</button>
          <button type="button" class="tg link btnlike" id="lock-now"><span>Jetzt sperren</span>${ic("lock", 20)}</button>
        </div>
      </section>

      <section class="stack-s"><h3 class="sec">Gefahrenzone</h3>
        <div class="card stack"><p class="small">Löscht alle Rechnungen, Fotos und Einstellungen von diesem Gerät. Ein Backup bleibt davon unberührt.</p><button type="button" class="btn danger-line" id="wipe">Alle Daten löschen</button></div>
      </section>
      <p class="foot">Rechnungsmappe ${APP_VERSION} · Schrift Instrument Sans (SIL Open Font License) · PDF-Werkzeuge: pdf.js (Apache 2.0), pdf-lib (MIT) · Texterkennung: Tesseract.js (Apache 2.0)</p>
    </main>`, "set");

  $("#ai-form").addEventListener("change", e => { if (e.target.name === "prov") { s.ai.provider = e.target.value; save().then(viewSettings); } });
  $("#ai-form").onsubmit = async e => {
    e.preventDefault();
    s.ai.apiKey = $("#ai-key").value.trim(); s.ai.askBefore = $("#ai-ask").checked; s.ai.model = $("#ai-model").value.trim();
    await save(); toast("KI-Einstellungen gespeichert");
    const back = sessionStorage.getItem("returnTo"); if (back && draft) { sessionStorage.removeItem("returnTo"); location.hash = back; }
  };
  $("#tax-form").onsubmit = async e => { e.preventDefault(); s.taxRate = Math.min(55, Math.max(0, Number($("#tax").value) || 0)); await save(); toast("Steuersatz gespeichert"); };
  $("#lockmin").onchange = async e => { s.lockMinutes = Number(e.target.value); await save(); toast("Gespeichert"); };
  $("#lock-now").onclick = () => doLock();
  $$("[data-theme-set]").forEach(b => b.onclick = () => { setTheme(b.dataset.themeSet); $$("[data-theme-set]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  $("#add-p").onclick = async () => { const p = personFromPreset("custom", "child", { name: "Neue Person" }); S.persons.push(p); await save(); location.hash = `#/person/${p.id}`; };
  $("#bk-make").onclick = makeBackupFlow;
  $("#bk-load").onchange = e => importFile(e.target.files[0], { replace: false });
  $("#pin-ch").onclick = changePinFlow;
  $("#wipe").onclick = async () => {
    const v = await modal({ title: "Alle Daten löschen?", body: `<p>Das lässt sich nicht rückgängig machen. Tippe zur Bestätigung <b>LÖSCHEN</b>.</p><input id="m-wipe" autocomplete="off">`, actions: [{ label: "Abbrechen", value: null }, { label: "Endgültig löschen", danger: true, collect: w => $("#m-wipe", w).value.trim() }] });
    if (v === "LÖSCHEN") { await store.wipeAll(); S = null; location.hash = ""; start(); }
    else if (v !== null) toast("Nicht gelöscht – Bestätigung stimmte nicht.");
  };
}

async function makeBackupFlow() {
  const pw = await modal({
    title: "Backup-Passwort",
    body: `<p class="small">Mit diesem Passwort wird die Backup-Datei verschlüsselt. Du brauchst es zum Wiederherstellen – gut aufbewahren.</p>
      <label class="field"><span>Passwort (mind. 8 Zeichen)</span><input type="password" id="m-pw1" autocomplete="new-password"></label>
      <label class="field"><span>Wiederholen</span><input type="password" id="m-pw2" autocomplete="new-password"></label><p class="form-err" id="m-err"></p>`,
    actions: [{ label: "Abbrechen", value: null }, { label: "Backup erstellen", primary: true, collect: w => {
      const a = $("#m-pw1", w).value, b = $("#m-pw2", w).value;
      if (a.length < 8) { $("#m-err", w).textContent = "Mindestens 8 Zeichen."; return undefined; }
      if (a !== b) { $("#m-err", w).textContent = "Die Passwörter stimmen nicht überein."; return undefined; }
      return a;
    } }],
  });
  if (!pw) return;
  toast("Backup wird erstellt …");
  try {
    const blob = await store.makeBackup(pw, S);
    const res = await shareOrSave(blob, `Rechnungsmappe-Backup_${today()}.json`, "Rechnungsmappe Backup");
    if (res !== "cancelled") { await store.setLastBackupAt(new Date().toISOString()); toast("Backup erstellt"); viewSettings(); }
  } catch (e) { console.error(e); toast("Backup fehlgeschlagen."); }
}

async function changePinFlow() {
  const v = await modal({
    title: "PIN ändern",
    body: `<label class="field"><span>Aktuelle PIN</span><input type="password" inputmode="numeric" maxlength="6" id="m-o"></label>
      <label class="field"><span>Neue PIN (6 Ziffern)</span><input type="password" inputmode="numeric" maxlength="6" id="m-n1"></label>
      <label class="field"><span>Neue PIN wiederholen</span><input type="password" inputmode="numeric" maxlength="6" id="m-n2"></label><p class="form-err" id="m-err"></p>`,
    actions: [{ label: "Abbrechen", value: null }, { label: "Ändern", primary: true, collect: w => {
      const o = $("#m-o", w).value, a = $("#m-n1", w).value, b = $("#m-n2", w).value;
      if (!/^\d{6}$/.test(a)) { $("#m-err", w).textContent = "Die neue PIN muss 6 Ziffern haben."; return undefined; }
      if (a !== b) { $("#m-err", w).textContent = "Die neuen PINs stimmen nicht überein."; return undefined; }
      return { o, a };
    } }],
  });
  if (!v) return;
  toast("PIN wird geändert …");
  const ok = await store.changePin(v.o, v.a);
  toast(ok ? "PIN geändert" : "Die aktuelle PIN war falsch.");
}

// Import: Backup (verschlüsselt) oder Importdatei (aus der bisherigen Rechnungsmappe)
async function importFile(file, { replace }) {
  if (!file) return;
  let json;
  try { json = JSON.parse(await file.text()); } catch { toast("Die Datei ist keine gültige Rechnungsmappe-Datei."); return; }
  let data;
  if (json.format === "rechnungsmappe-backup") {
    const pw = await modal({ title: "Backup-Passwort", body: `<label class="field"><span>Passwort des Backups</span><input type="password" id="m-pw"></label>`, actions: [{ label: "Abbrechen", value: null }, { label: "Entschlüsseln", primary: true, collect: w => $("#m-pw", w).value }] });
    if (!pw) return;
    try { data = await store.readBackup(json, pw); } catch { toast("Falsches Passwort."); return; }
  } else if (json.format === "rechnungsmappe-import") {
    data = { state: { settings: json.settings || {}, persons: json.persons || [], invoices: json.invoices || [] }, blobs: json.blobs || {} };
  } else { toast("Unbekanntes Dateiformat."); return; }

  const incoming = data.state;
  const n = (incoming.invoices || []).length, np = (incoming.persons || []).length;
  if (!replace && (S.invoices.length || S.persons.length)) {
    const mode = await modal({ title: "Daten übernehmen", body: `<p>Die Datei enthält ${np} Personen und ${n} Rechnungen.</p><p class="small muted">„Ergänzen“ fügt Neues hinzu und behält deine Daten. „Ersetzen“ stellt genau den Stand der Datei her.</p>`, actions: [{ label: "Abbrechen", value: null }, { label: "Ersetzen", value: "replace", danger: true }, { label: "Ergänzen", value: "merge", primary: true }] });
    if (!mode) return;
    replace = mode === "replace";
  }
  toast("Daten werden übernommen …");
  if (replace) {
    await store.replaceBlobs(data.blobs);
    S = { ...defaultState(), ...incoming, settings: { ...defaultState().settings, ...(incoming.settings || {}), ai: { ...defaultState().settings.ai, ...(incoming.settings?.ai || {}) } } };
  } else {
    await store.addBlobsFromB64(data.blobs);
    for (const p of incoming.persons || []) if (!person(p.id)) S.persons.push(p);
    for (const i of incoming.invoices || []) if (!S.invoices.some(x => x.id === i.id)) S.invoices.push(i);
    if (incoming.settings?.taxRate && !S.invoices.length) S.settings.taxRate = incoming.settings.taxRate;
  }
  await save();
  toast(`${np} Personen und ${n} Rechnungen übernommen`);
  location.hash = "#/"; route();
}

// ---------- Person / Tarif ----------
function viewPerson(id) {
  const p = person(id);
  if (!p) { location.hash = "#/einstellungen"; return; }
  const num = (k, label, step = "1", extra = "") => `<label class="field"><span>${label}</span><input name="${k}" id="pp-${k}" type="number" inputmode="decimal" step="${step}" min="0" value="${esc(p[k] ?? "")}" ${extra}></label>`;
  const tg = (k, label) => `<label class="tg"><span>${label}</span><input type="checkbox" class="sw" name="${k}" id="pp-${k}" ${p[k] ? "checked" : ""}></label>`;
  page(`${header(p.name || "Person", { back: "#/einstellungen", sub: "Person und Tarif" })}
    <main class="main">
      <form id="pp" class="stack">
        <section class="card stack">
          <div class="grid2">
            <label class="field"><span>Name</span><input name="name" id="pp-name" value="${esc(p.name)}" required></label>
            <label class="field"><span>Art</span><select name="kind" id="pp-kind"><option value="adult" ${p.kind === "adult" ? "selected" : ""}>Erwachsene/r</option><option value="child" ${p.kind === "child" ? "selected" : ""}>Kind / Jugendliche/r</option></select></label>
          </div>
          <label class="field"><span>Tarif-Vorlage</span><select id="pp-preset">${PRESETS.map(x => `<option value="${x.id}" ${x.id === p.presetId ? "selected" : ""}>${esc(x.insurer ? x.insurer + " · " + x.tariff : x.tariff)}</option>`).join("")}</select></label>
          <button type="button" class="btn sm" id="pp-apply">Vorlage-Werte übernehmen</button>
          <div class="grid2">
            <label class="field"><span>Versicherer</span><input name="insurer" id="pp-insurer" value="${esc(p.insurer)}"></label>
            <label class="field"><span>Tarif</span><input name="tariff" id="pp-tariff" value="${esc(p.tariff)}"></label>
            ${num("beitrag", "Monatsbeitrag KV (€)", "0.01")}
            <label class="field"><span>Versichert seit</span><input name="start" id="pp-start" type="date" value="${esc(p.start || "")}"></label>
          </div>
        </section>
        <section class="card stack">
          <h2 class="h3">Selbstbehalt und Rückerstattung</h2>
          <div class="grid2">
            ${num("sb", "Selbstbehalt pro Jahr (€)")}
            ${num("breFix", "Garantierte BRE (€)")}
            ${num("breMonate", `Erfolgsabh. BRE (Monatsbeiträge)${p.breEstimated ? " – geschätzt" : ""}`, "0.5")}
            ${num("basisPct", "Steuerlich begünstigter Anteil (%)", "0.1", 'max="100"')}
          </div>
          <p class="xs muted">Den begünstigten Anteil findest du auf der jährlichen Beitragsbescheinigung deiner Versicherung.</p>
        </section>
        <section class="card stack">
          <h2 class="h3">Zahn-Höchstbeträge der ersten Jahre</h2>
          <p class="xs muted">Höchstleistung für Zahnleistungen zusammengerechnet seit Versicherungsbeginn. Jahr 1 läuft bis zum 31.12. des Beginnjahres. Leer lassen = keine Begrenzung.</p>
          <div class="grid2">${[0, 1, 2, 3].map(n => `<label class="field"><span>bis Ende Jahr ${n + 1}${p.start ? ` (${Number(p.start.slice(0, 4)) + n})` : ""}</span><input name="dc${n}" id="pp-dc${n}" type="number" inputmode="decimal" step="50" min="0" value="${esc((dentalCapsOf(p) || [])[n] ?? "")}"></label>`).join("")}</div>
        </section>
        <section class="card list-form">
          ${tg("sbDental", "Selbstbehalt gilt auch für Zahnleistungen")}
          ${tg("sbQuarterRule", "Selbstbehalt im ersten Jahr je Quartal gekürzt")}
          ${tg("breVariableFirstYear", "Erfolgsabh. BRE schon im ersten Jahr anteilig")}
          ${tg("offset", "Erstattungen werden auf die BRE angerechnet")}
        </section>
        <section class="card stack">
          <h2 class="h3">Erstattungssätze in %</h2>
          <div class="grid2">${CATS.map(c => `<label class="field"><span>${esc(c.l)}</span><input name="r-${c.k}" id="pp-r-${c.k}" type="number" inputmode="numeric" min="0" max="100" step="5" value="${p.rates?.[c.k] ?? 100}"></label>`).join("")}</div>
        </section>
        ${p.note ? `<p class="small muted card">${esc(p.note)}</p>` : ""}
        <button type="submit" class="btn primary big">Speichern</button>
        <button type="button" class="btn danger-line" id="pp-del">Person entfernen</button>
      </form>
    </main>`);
  $("#pp-apply").onclick = async () => {
    const np = personFromPreset($("#pp-preset").value, $("#pp-kind").value, { id: p.id, name: $("#pp-name").value.trim() || p.name, beitrag: Number($("#pp-beitrag").value) || p.beitrag, start: $("#pp-start").value || p.start });
    Object.assign(p, np); await save(); toast("Vorlage übernommen"); viewPerson(id);
  };
  $("#pp").onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    p.name = String(fd.get("name") || "").trim() || p.name; p.kind = fd.get("kind"); p.insurer = fd.get("insurer"); p.tariff = fd.get("tariff");
    p.start = fd.get("start") || ""; p.presetId = $("#pp-preset").value;
    p.deadlines = (PRESETS.find(x => x.id === p.presetId) || {}).deadlines || "none";
    for (const k of ["beitrag", "sb", "breFix", "breMonate", "basisPct"]) p[k] = Number(fd.get(k)) || 0;
    for (const k of ["sbDental", "sbQuarterRule", "breVariableFirstYear", "offset"]) p[k] = fd.get(k) === "on";
    p.rates = Object.fromEntries(CATS.map(c => [c.k, Math.min(100, Math.max(0, Number(fd.get("r-" + c.k)) || 0))]));
    p.dentalCaps = [0, 1, 2, 3].map(n => Number(fd.get("dc" + n)) || 0).filter(x => x > 0);
    await save(); toast(`${p.name} gespeichert`); location.hash = "#/einstellungen";
  };
  $("#pp-del").onclick = async () => {
    const n = S.invoices.filter(i => i.personId === id).length;
    if (!(await confirmBox(`${p.name} entfernen?`, n ? `Dazu gehören ${n} Rechnungen. Sie werden ebenfalls gelöscht.` : "Die Person wird entfernt.", "Entfernen", true))) return;
    for (const i of S.invoices.filter(i => i.personId === id)) { for (const pg of i.pages || []) await store.deleteBlob(pg.id); if (i.original) await store.deleteBlob(i.original.id); }
    S.invoices = S.invoices.filter(i => i.personId !== id); S.persons = S.persons.filter(x => x.id !== id);
    await save(); toast("Entfernt"); location.hash = "#/einstellungen";
  };
}

// ---------- Router ----------
async function route() {
  if (!store.isUnlocked() || !S) { (await store.isSetUp()) ? showLock() : setupWelcome(); return; }
  if (!S.persons.length && !S.invoices.length && location.hash !== "#/einstellungen") { setupPeople(); return; }
  const h = location.hash.replace(/^#/, "") || "/";
  const parts = h.split("/").filter(Boolean);
  if (parts[0] !== "neu" && parts[0] !== "rechnung" && !(parts[0] === "einstellungen" && draft && sessionStorage.getItem("returnTo"))) draft = null;
  switch (parts[0]) {
    case undefined: return viewHome();
    case "rechnungen": return viewList();
    case "neu": if (!draft || !draft.isNew) draft = newDraft(); return viewEdit();
    case "rechnung": {
      const inv = S.invoices.find(i => i.id === parts[1]);
      if (!inv) { location.hash = "#/rechnungen"; return; }
      if (!draft || draft.inv.id !== inv.id) draft = await draftFromInvoice(inv);
      return viewEdit();
    }
    case "paket": return viewPackage(parts[1], Number(parts[2]) || ui.year);
    case "jahr": return viewPersonYear(parts[1], Number(parts[2]) || ui.year);
    case "fristen": return viewDeadlines();
    case "einstellungen": return viewSettings();
    case "person": return viewPerson(parts[1]);
    default: location.hash = "#/";
  }
}

function doLock() { store.lock(); S = null; draft = null; route(); }

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  // Beim Fotografieren verlässt Android kurz die App – dann nicht sperren
  if (picking && Date.now() - picking < 10 * 60000) { picking = 0; return; }
  if (S && hiddenAt && Date.now() - hiddenAt >= (S.settings.lockMinutes ?? 1) * 60000) doLock();
});
window.addEventListener("hashchange", () => { $$(".modal-bg").forEach(m => m.remove()); route(); });
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S && (location.hash === "" || location.hash === "#/")) viewHome(); });

async function start() {
  if (!window.crypto?.subtle || !window.indexedDB) {
    root.innerHTML = `<div class="screen welcome"><h1>Browser nicht unterstützt</h1><p class="lead">Bitte öffne die App in einem aktuellen Chrome über https.</p></div>`;
    return;
  }
  route();
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) toast("Neue Version geladen – wird beim nächsten Öffnen aktiv."); });
    });
  }).catch(() => {});
}

start();
