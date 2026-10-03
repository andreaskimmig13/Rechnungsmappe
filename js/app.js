import * as store from "./store.js";
import { CATS, catLabel, PRESETS, personFromPreset, calc, deadlines, yearOf, fmtEur, fmtDate, fmtShort, BBHV, CAPPED_CATS, bbhvItem, capsOf, positionCheck } from "./calc.js";
import { normalizeImage, readPdf, ocrImages, parseInvoice } from "./scan.js";
import { aiRead, PROVIDERS, AIError } from "./ai.js";
import { buildPackage, shareOrSave } from "./exporter.js";

const APP_VERSION = "1.2.1";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const root = $("#app");

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
  const item = (href, icon, label, key) => `<a href="${href}" class="nav-i ${active === key ? "on" : ""}" ${active === key ? 'aria-current="page"' : ""}>${ic(icon)}<span>${label}</span></a>`;
  return `<nav class="nav" aria-label="Hauptmenü">
    ${item("#/", "home", "Übersicht", "home")}
    ${item("#/rechnungen", "list", "Rechnungen", "list")}
    <a href="#/neu" class="nav-scan" aria-label="Rechnung erfassen">${ic("cam", 28)}</a>
    ${item("#/fristen", "cal", "Fristen", "cal")}
    ${item("#/einstellungen", "set", "Einstellungen", "set")}
  </nav>`;
}
const header = (title, { back, right = "", sub = "" } = {}) => `<header class="top ${back ? "with-back" : ""}">
  ${back ? `<a class="icon-btn" href="${back}" aria-label="Zurück">${ic("back")}</a>` : ""}
  <div class="top-t">${sub ? `<span class="eyebrow">${esc(sub)}</span>` : ""}<h1>${esc(title)}</h1></div>${right}</header>`;

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
function yearOptions() {
  const ys = new Set([new Date().getFullYear(), ui.year, ...S.invoices.map(yearOf)]);
  return [...ys].sort((a, b) => b - a).map(y => `<option value="${y}" ${y === ui.year ? "selected" : ""}>${y}</option>`).join("");
}

function gauge(r) {
  const max = Math.max(r.threshold, r.eligible, r.sb, 1) * 1.08;
  const pct = v => Math.min(100, v / max * 100).toFixed(1);
  return `<div class="gauge" role="img" aria-label="Erstattungsfähig ${fmtEur(r.eligible)} von Schwelle ${fmtEur(r.threshold)}">
    <div class="g-sb" style="width:${pct(r.sb)}%"></div><div class="g-fill" style="width:${pct(r.eligible)}%"></div><div class="g-mark" style="left:${pct(r.threshold)}%"></div></div>`;
}

// Rechenweg: Rechnungssumme → nicht erstattet → Selbstbehalt → Erstattung
function waterfall(r, { compact = false } = {}) {
  const row = (label, val, cls = "") => `<div class="wf-r ${cls}"><span>${label}</span><span class="num">${val}</span></div>`;
  const n = r.lines.length;
  return `<div class="wf">
    ${row(`Rechnungen ${ui.year} (${n} Stück)`, fmtEur(r.regularTotal))}
    ${r.capCut > 0.004 ? row("− über Höchstbetrag (Beihilfe-Liste)", fmtEur(r.capCut), "minus") : ""}
    ${r.notCovered - r.capCut > 0.004 || !compact ? row("− nicht erstattet (Tarif unter 100 %)", fmtEur(r.notCovered - r.capCut), "minus") : ""}
    ${row(`− Selbstbehalt${r.sb > r.sbUsed + 0.004 ? ` (${fmtEur(r.sb - r.sbUsed)} noch offen)` : ""}`, fmtEur(r.sbUsed), "minus")}
    ${row("= Erstattung bei Einreichung", fmtEur(r.payout), "sum")}
    ${r.neutralLines.length ? row(`+ Vorsorge/Impfung (${r.neutralLines.length}), BRE-neutral`, fmtEur(r.neutralRefund), "extra") : ""}
  </div>`;
}

function personCard(p, r) {
  const y = ui.year;
  const head = `<div class="pc-head"><div><a class="pc-name" href="#/jahr/${p.id}/${y}">${esc(p.name)}</a><span class="muted small">${esc(p.insurer)} · ${esc(p.tariff)}</span></div><span class="pill ${r.fy.before ? "muted" : r.tone}">${esc(r.verdict)}</span></div>`;
  if (r.fy.before) return `<article class="card pcard">${head}</article>`;
  const breLine = r.breLost ? "entfällt, da eingereicht" : `${fmtEur(r.bre)} − ${fmtEur(r.breTax)} Steuer`;
  const open = `<a class="btn sm" href="#/jahr/${p.id}/${y}">${ic("list", 18)} Rechnungen ansehen</a>`;
  if (r.regular.length === 0 && !p.offset) return `<article class="card pcard">
    ${head}
    ${gauge(r)}
    <div class="split small muted"><span>${r.neutral.length ? `${r.neutral.length} Vorsorge-Rechnung(en), BRE-neutral` : `Keine Rechnungen ${y}`}</span><span>BRE netto <b class="num good-t">${fmtEur(r.breNet)}</b></span></div>
    ${r.inv.length ? open : ""}
  </article>`;
  return `<article class="card pcard">
    ${head}
    ${waterfall(r, { compact: true })}
    <div class="vs ${r.submitWins ? "" : "win"}"><span><span class="eyebrow">BRE nach Steuer</span><span class="xs muted">wenn du nichts einreichst · ${breLine}</span></span><span class="num big-n">${fmtEur(r.breLost ? 0 : r.breNet)}</span></div>
    <div class="stack-s">${gauge(r)}<div class="split xs muted"><span>Erstattungsfähig <b class="num ink">${fmtEur(r.eligible)}</b></span><span>Schwelle <b class="num ink">${fmtEur(r.threshold)}</b></span></div></div>
    ${!r.submitWins ? `<p class="small">Noch <b class="num">${fmtEur(r.rest)}</b> an Kosten, bis sich Einreichen lohnt. Bis dahin selbst zahlen.</p>` : ""}
    <div class="row-btns">${open}${r.submitWins && r.unsubmitted.length ? `<a class="btn sm primary" href="#/paket/${p.id}/${y}">${ic("share", 18)} Einreichungspaket (${r.unsubmitted.length})</a>` : ""}</div>
    ${r.fy.first ? `<p class="xs muted">Erstes Versicherungsjahr: BRE anteilig für ${r.fy.months} Monate${r.fy.sbFactor < 1 ? ", Selbstbehalt gekürzt" : ""}.</p>` : ""}
  </article>`;
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
function viewPersonYear(pid, year) {
  const p = person(pid);
  if (!p) { location.hash = "#/"; return; }
  ui.year = year;
  const r = calc(p, S.invoices, year, S.settings.taxRate);
  const line = l => `<li><a class="bk" href="#/rechnung/${l.inv.id}">
    <span class="split top-a"><strong>${esc(l.inv.arzt || "Ohne Praxisangabe")}</strong><span class="num strong nowrap">${fmtEur(l.amount)}</span></span>
    <span class="xs muted">${fmtDate(l.inv.datum)} · ${esc(l.inv.notiz || catLabel(l.inv.kategorie))}</span>
    <span class="bk-calc xs"><span>${l.capCut > 0.004 ? `Höchstbetrag −${fmtEur(l.capCut)} · ` : ""}Satz ${Math.round(l.rate * 100)} %${l.rateCut > 0.004 ? ` · −${fmtEur(l.rateCut)}` : ""}</span><span>${l.neutral ? "ohne Selbstbehalt" : l.sbFree ? "ohne SB (Zahn)" : l.sbPart > 0.004 ? `SB −${fmtEur(l.sbPart)}` : "SB schon erreicht"}</span><span class="num strong ${l.refund > 0 ? "good-t" : "muted"}">${fmtEur(l.refund)}</span></span>
    <span class="tags">${stamps(l.inv)}</span>
  </a></li>`;
  page(`${header(`${p.name} · ${year}`, { back: "#/", sub: `${p.insurer} · ${p.tariff}` })}
    <main class="main">
      <section class="card stack">
        <span class="pill ${r.tone} self-start">${esc(r.verdict)}</span>
        ${waterfall(r)}
        <div class="vs ${r.submitWins ? "" : "win"}"><span><span class="eyebrow">BRE nach Steuer</span><span class="xs muted">${r.breLost ? "entfällt, da schon eingereicht" : `${fmtEur(r.bre)} brutto − ${fmtEur(r.breTax)} Steuer`}</span></span><span class="num big-n">${fmtEur(r.breLost ? 0 : r.breNet)}</span></div>
      </section>
      <section class="stack-s">
        <div class="split"><h2 class="h3">Rechnungen ${year}</h2><span class="xs muted">Selbstbehalt in Datumsreihenfolge</span></div>
        ${r.lines.length ? `<ul class="card inv-list">${r.lines.map(line).join("")}
          <li class="bk-sum"><span>Summe Rechnungen</span><span class="num">${fmtEur(r.regularTotal)}</span><span>Selbstbehalt</span><span class="num">−${fmtEur(r.sbUsed)}</span><span class="strong">Erstattung</span><span class="num strong good-t">${fmtEur(r.payout)}</span></li></ul>`
          : `<div class="card empty small">Keine regulären Rechnungen ${year}.</div>`}
      </section>
      ${r.neutralLines.length ? `<section class="stack-s"><div class="split"><h2 class="h3">Vorsorge und Impfungen</h2><span class="xs muted">BRE-neutral, ohne Selbstbehalt</span></div>
        <ul class="card inv-list">${r.neutralLines.map(line).join("")}</ul>
        <p class="xs muted">Nur BRE-neutral, wenn die Voraussetzungen des Vorsorgeverzeichnisses deines Tarifs erfüllt sind. Kannst du jederzeit einreichen.</p></section>` : ""}
      ${r.submitWins && r.unsubmitted.length ? `<a class="btn primary big" href="#/paket/${p.id}/${year}">${ic("share", 20)} Einreichungspaket erstellen</a>` : ""}
      ${p.note ? `<p class="foot">${esc(p.note)}</p>` : ""}
    </main>`, "home");
}

function viewHome() {
  const y = ui.year;
  const unpaid = S.invoices.filter(i => !i.bezahlt);
  const late = unpaid.filter(i => i.faellig && i.faellig < today());
  const pending = S.invoices.filter(i => i.eingereicht && (i.erstattet === null || i.erstattet === undefined || i.erstattet === ""));
  const results = S.persons.map(p => ({ p, r: calc(p, S.invoices, y, S.settings.taxRate) }));
  const back = results.reduce((a, x) => a + x.r.best + x.r.neutralRefund, 0);
  const months = Array.from({ length: 12 }, (_, m) => S.invoices.filter(i => yearOf(i) === y && Number(i.datum.slice(5, 7)) === m + 1).reduce((a, i) => a + Number(i.betrag || 0), 0));
  const mMax = Math.max(...months, 1);
  const yearSum = months.reduce((a, b) => a + b, 0);
  const yearInv = S.invoices.filter(i => yearOf(i) === y);
  const curM = new Date().getFullYear() === y ? new Date().getMonth() : (y < new Date().getFullYear() ? 11 : -1);
  const dl = deadlines(S.persons, S.invoices).filter(d => !d.overdue).slice(0, 3);
  const standalone = matchMedia("(display-mode: standalone)").matches;

  page(`<header class="top home-top">
      <div class="top-t"><span class="eyebrow">Familie · PKV</span><h1>Rechnungsmappe</h1></div>
      <label class="year-sel"><span class="sr">Jahr</span><select id="year">${yearOptions()}</select></label>
    </header>
    <div class="privacy">${ic("lock", 16)} Nur auf diesem Gerät · verschlüsselt</div>
    <main class="main">
      ${installEvt && !standalone ? `<section class="card install"><div><strong>Als App installieren</strong><span class="small muted">Eigenes Symbol, Vollbild, offline nutzbar.</span></div><button class="btn primary" type="button" id="install">Installieren</button></section>` : ""}
      ${late.length ? `<section class="alert">${ic("alert", 24)}<div class="stack-s"><strong>${late.length === 1 ? "1 Rechnung" : late.length + " Rechnungen"} über dem Zahlungsziel</strong>
        <span class="small">${late.slice(0, 3).map(i => `${esc(short(i.arzt))} ${fmtEur(i.betrag)} (fällig ${fmtShort(i.faellig)})`).join(" · ")}</span>
        <div class="row-btns"><a class="btn danger-solid" href="#/rechnungen" data-filter="unpaid">Ansehen</a><button class="btn danger-line" type="button" id="paid-all">Als bezahlt markieren</button></div></div></section>` : ""}
      <section class="card family">
        <div class="split"><span class="eyebrow">Rechnungen ${y} · Familie</span><span class="xs muted">${yearInv.length} Stück</span></div>
        <div class="fam-row"><span class="num fam-n">${fmtEur(yearSum)}</span><span class="small muted">Rechnungssumme</span></div>
        <div class="fam-grid">
          <div><span class="num strong">${fmtEur(results.reduce((a, x) => a + x.r.payout + x.r.neutralRefund, 0))}</span><span class="xs muted">Erstattung bei Einreichung</span></div>
          <div><span class="num strong">${fmtEur(results.reduce((a, x) => a + x.r.sbUsed, 0))}</span><span class="xs muted">Selbstbehalt</span></div>
          <div><span class="num strong">${fmtEur(results.reduce((a, x) => a + x.r.notCovered, 0))}</span><span class="xs muted">nicht erstattet</span></div>
        </div>
      </section>
      <section class="grid2">
        <div class="card tile"><span class="eyebrow">Offen zu zahlen</span><span class="num tile-n ${late.length ? "bad-t" : ""}">${fmtEur(unpaid.reduce((a, i) => a + Number(i.betrag || 0), 0))}</span><span class="small muted">${unpaid.length} Rechnung${unpaid.length === 1 ? "" : "en"}${pending.length ? ` · ${pending.length} Erstattung offen` : ""}</span></div>
        <div class="card tile"><span class="eyebrow">Rückfluss ${y}</span><span class="num tile-n good-t">${fmtEur(back)}</span><span class="small muted">nach Steuer, beste Wahl</span></div>
      </section>
      <section class="stack">
        <h2 class="h2">Einreichen oder Rückerstattung?</h2>
        ${results.length ? results.map(x => personCard(x.p, x.r)).join("") : `<div class="card empty">Noch keine Personen. <a href="#/einstellungen">In den Einstellungen anlegen</a>.</div>`}
      </section>
      <section class="card stack">
        <div class="split"><h2 class="h3">Arztkosten ${y}</h2><span class="num strong">${fmtEur(yearSum)}</span></div>
        <div class="bars" role="img" aria-label="Arztkosten pro Monat ${y}">${months.map((v, m) => `<div class="bar ${v ? "has" : ""} ${m > curM ? "future" : ""}" style="height:${v ? Math.max(6, v / mMax * 120) : 3}px">${v === Math.max(...months) && v ? `<span>${Math.round(v).toLocaleString("de-DE")} €</span>` : ""}</div>`).join("")}</div>
        <div class="bars-x">${"JFMAMJJASOND".split("").map(c => `<span>${c}</span>`).join("")}</div>
      </section>
      <section class="stack">
        <div class="split"><h2 class="h2">Nächste Fristen</h2><a href="#/fristen" class="small">Alle</a></div>
        ${dl.length ? `<ol class="card list-plain">${dl.map(d => `<li class="dl"><span class="dl-d num">${fmtShort(d.date)}<br>${d.date.slice(0, 4)}</span><span class="small">${esc(d.text)}</span></li>`).join("")}</ol>` : `<div class="card empty small">Keine anstehenden Fristen.</div>`}
      </section>
      <p class="foot">Alle Beträge sind Schätzungen auf Basis deiner Tarifangaben. Maßgeblich sind Tarifbedingungen und Steuerbescheid.</p>
    </main>`, "home");

  $("#year").onchange = e => { ui.year = Number(e.target.value); viewHome(); };
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
  if (i.kategorie === "vorsorge") t.push(`<span class="tag">BRE-neutral</span>`);
  return t.join("");
}

function viewList() {
  const y = ui.year;
  const base = S.invoices.filter(i => yearOf(i) === y && (ui.fPerson === "all" || i.personId === ui.fPerson));
  const cnt = { unpaid: base.filter(i => !i.bezahlt).length, notsub: base.filter(i => !i.eingereicht).length, refund: base.filter(i => i.eingereicht && (i.erstattet === null || i.erstattet === undefined || i.erstattet === "")).length };
  let list = base;
  if (ui.fStatus === "unpaid") list = list.filter(i => !i.bezahlt);
  if (ui.fStatus === "notsub") list = list.filter(i => !i.eingereicht);
  if (ui.fStatus === "refund") list = list.filter(i => i.eingereicht && (i.erstattet === null || i.erstattet === undefined || i.erstattet === ""));
  const q = ui.q.trim().toLowerCase();
  if (q) list = list.filter(i => `${i.arzt} ${i.notiz} ${catLabel(i.kategorie)}`.toLowerCase().includes(q));
  list = [...list].sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
  const sum = list.reduce((a, i) => a + Number(i.betrag || 0), 0);
  const exp = expectedFor();
  const chip = (attr, val, label, cur) => `<button type="button" class="chip" data-${attr}="${val}" aria-pressed="${cur === val}">${label}</button>`;

  page(`${header("Rechnungen", { right: `<label class="year-sel"><span class="sr">Jahr</span><select id="year">${yearOptions()}</select></label>` })}
    <main class="main">
      <label class="search">${ic("search", 20)}<span class="sr">Suchen</span><input id="q" type="search" placeholder="Praxis oder Notiz suchen" value="${esc(ui.q)}"></label>
      <div class="chips">${chip("fp", "all", "Alle", ui.fPerson)}${S.persons.map(p => chip("fp", p.id, esc(p.name), ui.fPerson)).join("")}</div>
      <div class="chips">${chip("fs", "all", "Alle", ui.fStatus)}${chip("fs", "unpaid", `Offen <b class="num">${cnt.unpaid}</b>`, ui.fStatus)}${chip("fs", "notsub", `Nicht eingereicht <b class="num">${cnt.notsub}</b>`, ui.fStatus)}${chip("fs", "refund", `Erstattung offen <b class="num">${cnt.refund}</b>`, ui.fStatus)}</div>
      <div class="split list-sum"><span class="eyebrow">${y} · ${list.length} Rechnung${list.length === 1 ? "" : "en"}</span><span class="num strong">${fmtEur(sum)}</span></div>
      ${list.length ? `<ul class="card inv-list">${list.map(i => `<li><a href="#/rechnung/${i.id}" class="inv">
        <span class="thumb" data-thumb="${i.pages?.[0]?.id || ""}">${ic("file", 22)}</span>
        <span class="inv-b"><span class="split top-a"><strong>${esc(i.arzt || "Ohne Praxisangabe")}</strong><span class="num strong nowrap">${fmtEur(i.betrag)}</span></span>
        <span class="small muted">${fmtDate(i.datum)} · ${esc(person(i.personId)?.name || "?")} · ${esc(i.notiz || catLabel(i.kategorie))}</span>
        ${exp[i.id] ? `<span class="xs exp">voraussichtlich erstattet bei Einreichung: <b class="num">${fmtEur(exp[i.id].refund)}</b>${exp[i.id].sbPart > 0.004 ? ` (Selbstbehalt −${fmtEur(exp[i.id].sbPart)})` : ""}</span>` : ""}
        <span class="tags">${stamps(i)}</span></span></a></li>`).join("")}</ul>`
        : `<div class="card empty"><p>${S.invoices.length ? "Keine Rechnungen für diese Auswahl." : "Noch keine Rechnungen."}</p><a class="btn primary" href="#/neu">${ic("cam", 20)} Erste Rechnung erfassen</a></div>`}
    </main>`, "list");

  $("#year").onchange = e => { ui.year = Number(e.target.value); viewList(); };
  $("#q").oninput = e => { ui.q = e.target.value; clearTimeout(viewList._t); viewList._t = setTimeout(() => { const pos = e.target.selectionStart; viewList(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  loadThumbs();
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
  page(`${header(draft.isNew ? "Rechnung erfassen" : "Rechnung", { back: draft.isNew ? "#/" : "#/rechnungen" })}
    <main class="main">
      <section class="stack">
        ${hasPages ? `<div class="pages">${draft.pages.map((p, n) => `<figure class="pg"><img src="${p.url}" alt="Seite ${n + 1}"><figcaption><button type="button" class="icon-btn sm" data-rot="${n}" aria-label="Seite ${n + 1} drehen">${ic("rot", 18)}</button><span class="xs">Seite ${n + 1}</span><button type="button" class="icon-btn sm" data-delpg="${n}" aria-label="Seite ${n + 1} entfernen">${ic("trash", 18)}</button></figcaption></figure>`).join("")}</div>`
          : `<div class="capture-empty">${ic("file", 40)}<p>Fotografiere die Rechnung möglichst gerade, bei gutem Licht und mit allen vier Ecken im Bild.</p></div>`}
        <div class="grid2">
          <label class="btn ${hasPages ? "" : "primary"} file-btn">${ic("cam", 20)} ${hasPages ? "Weitere Seite" : "Fotografieren"}<input type="file" accept="image/*" capture="environment" class="file-in" id="f-cam"></label>
          <label class="btn file-btn">${ic("file", 20)} ${hasPages ? "Datei" : "Foto / PDF"}<input type="file" accept="image/*,application/pdf" multiple class="file-in" id="f-file"></label>
        </div>
      </section>

      ${hasPages ? `<section class="card stack read-card">
        <div class="read-st">${st?.busy ? `<span class="spin" aria-hidden="true"></span>` : st?.error ? `<span class="st-i bad">${ic("alert", 18)}</span>` : st?.done ? `<span class="st-i ok">${ic("check", 18)}</span>` : `<span class="st-i">${ic("file", 18)}</span>`}
          <div><strong>${esc(st?.title || "Noch nicht ausgelesen")}</strong><span class="small muted">${esc(st?.text || "")}</span></div></div>
        ${st?.progress != null ? `<div class="prog"><div style="width:${Math.round(st.progress * 100)}%"></div></div>` : ""}
        <div class="grid2">
          <button type="button" class="btn" id="ocr" ${st?.busy ? "disabled" : ""}>${ic("file", 20)} Ohne KI lesen</button>
          <button type="button" class="btn primary" id="ai" ${st?.busy ? "disabled" : ""}>${ic("spark", 20)} Mit KI lesen</button>
        </div>
        <p class="xs muted">KI: ${esc(prov.label)}. Nur die Seitenbilder dieser Rechnung werden gesendet.</p>
      </section>` : ""}

      ${refundBox()}
      <form id="inv-form" class="stack" novalidate>
        <h2 class="h3">Angaben ${draft.isNew ? "prüfen" : ""}</h2>
        <label class="field"><span>Für ${fieldState("personId")}</span><select id="f-person" class="${flagCls("personId")}">${S.persons.map(p => `<option value="${p.id}" ${p.id === i.personId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Praxis / Leistungserbringer ${fieldState("arzt")}</span><input id="f-arzt" class="${flagCls("arzt")}" value="${esc(i.arzt)}" autocomplete="off" placeholder="z. B. Kinderarztpraxis Dr. Meier"></label>
        <div class="grid2">
          <label class="field"><span>Rechnungsdatum ${fieldState("datum")}</span><input id="f-datum" type="date" class="${flagCls("datum")}" value="${esc(i.datum)}" required></label>
          <label class="field"><span>Betrag (€) ${fieldState("betrag")}</span><input id="f-betrag" type="number" inputmode="decimal" step="0.01" min="0" class="num ${flagCls("betrag")}" value="${i.betrag === "" || i.betrag == null ? "" : Number(i.betrag).toFixed(2)}" required></label>
          <label class="field"><span>Zahlbar bis ${fieldState("faellig")}</span><input id="f-faellig" type="date" class="${flagCls("faellig")}" value="${esc(i.faellig || "")}"></label>
          <label class="field"><span>Kategorie ${fieldState("kategorie")}</span><select id="f-kat" class="${flagCls("kategorie")}">${CATS.map(c => `<option value="${c.k}" ${c.k === i.kategorie ? "selected" : ""}>${esc(c.l)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Notiz ${fieldState("notiz")}</span><input id="f-notiz" class="${flagCls("notiz")}" value="${esc(i.notiz || "")}" placeholder="z. B. MRT Knie"></label>
        ${positionsEditor()}
        <div class="card toggles">
          <label class="tg"><span>Bezahlt</span><input type="checkbox" class="sw" id="f-bezahlt" ${i.bezahlt ? "checked" : ""}></label>
          <label class="tg"><span>Bei der Versicherung eingereicht</span><input type="checkbox" class="sw" id="f-eing" ${i.eingereicht ? "checked" : ""}></label>
          <label class="tg"><span>Erstattet (€)</span><input id="f-erst" type="number" inputmode="decimal" step="0.01" min="0" class="num mini" value="${i.erstattet ?? ""}" placeholder="–"></label>
        </div>
        <p class="form-err" id="f-err" role="alert"></p>
        <button type="submit" class="btn ink big" id="f-save">Rechnung speichern</button>
        ${!draft.isNew ? `<div class="grid2"><button type="button" class="btn" id="f-share" ${hasPages || draft.original ? "" : "disabled"}>${ic("share", 20)} Beleg teilen</button><button type="button" class="btn danger-line" id="f-del">${ic("trash", 20)} Löschen</button></div>` : ""}
      </form>
    </main>`);

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
  $("#inv-form").addEventListener("input", e => { const k = FIELD[e.target.id]; if (k) { draft.src[k] = "user"; e.target.classList.remove("f-ki", "f-chk"); e.target.closest(".field")?.querySelector(".fs")?.remove(); } collectForm(); const box = $("#refund-box"); const html = refundBox(); if (box) { if (html) box.outerHTML = html; else box.remove(); } else if (html) $("#inv-form").insertAdjacentHTML("beforebegin", html); });
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
    <div class="split"><h2 class="h3">Erstattung</h2><a class="xs" href="#/jahr/${i.personId}/${yearOf(i)}">Alle Rechnungen ${esc(p?.name || "")} ${yearOf(i)}</a></div>
    <div class="wf">
      ${row("Rechnungsbetrag", fmtEur(l.amount))}
      ${l.capCut > 0.004 ? row("− über Beihilfe-Höchstbetrag", fmtEur(l.capCut), "minus") : ""}
      ${row(`− nicht erstattet (Satz ${Math.round(l.rate * 100)} %)`, fmtEur(l.rateCut), "minus")}
      ${row(l.neutral ? "− Selbstbehalt (entfällt bei Vorsorge)" : l.sbFree ? "− Selbstbehalt (gilt nicht für Zahn)" : "− Anteil am Selbstbehalt", fmtEur(l.sbPart), "minus")}
      ${row("= voraussichtlich erstattet", fmtEur(l.refund), "sum")}
      ${real ? row("tatsächlich erstattet", fmtEur(i.erstattet), Math.abs(Number(i.erstattet) - l.refund) < 0.01 ? "extra" : "diff") : ""}
    </div>
    ${real && Math.abs(Number(i.erstattet) - l.refund) >= 0.01 ? `<p class="xs muted">Abweichung ${fmtEur(Number(i.erstattet) - l.refund)} – prüfe den Leistungsbescheid oder die Erstattungssätze im Tarif.</p>` : ""}
    ${!l.neutral && !l.sbFree ? `<p class="xs muted">Der Selbstbehalt wird auf die Rechnungen des Jahres in Datumsreihenfolge verrechnet.</p>` : ""}
  </section>`;
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
      <p class="foot">Rechnungsmappe ${APP_VERSION} · Schriften unter SIL Open Font License · PDF-Werkzeuge: pdf.js (Apache 2.0), pdf-lib (MIT) · Texterkennung: Tesseract.js (Apache 2.0)</p>
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
