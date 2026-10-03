// Verschlüsselter Speicher: alles liegt in IndexedDB auf diesem Gerät,
// verschlüsselt mit AES-GCM. Der Schlüssel wird aus der PIN abgeleitet
// (PBKDF2-SHA-256) und existiert nur im Arbeitsspeicher, solange die App entsperrt ist.

const DB_NAME = "rechnungsmappe";
const DB_VERSION = 1;
const PBKDF2_ITER = 310000;
const CHECK_TEXT = "rechnungsmappe-ok-v1";

let dbPromise = null;
let key = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function idbGet(store, k) { return tx(store, "readonly", s => reqP(s.get(k))); }
async function idbPut(store, k, v) { return tx(store, "readwrite", s => { s.put(v, k); }); }
async function idbDel(store, k) { return tx(store, "readwrite", s => { s.delete(k); }); }
async function idbKeys(store) { return tx(store, "readonly", s => reqP(s.getAllKeys())); }
async function idbClear(store) { return tx(store, "readwrite", s => { s.clear(); }); }

const enc = new TextEncoder();
const dec = new TextDecoder();
const rand = n => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(secret, salt, iterations = PBKDF2_ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptBytes(k, bytes) {
  const iv = rand(12);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, bytes));
  return { iv, data };
}
export async function decryptBytes(k, { iv, data }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, data));
}

export async function isSetUp() { return !!(await idbGet("meta", "salt")); }
export function isUnlocked() { return !!key; }
export function lock() { key = null; }

export async function setup(pin) {
  const salt = rand(16);
  const k = await deriveKey(pin, salt);
  const check = await encryptBytes(k, enc.encode(CHECK_TEXT));
  await idbPut("meta", "salt", salt);
  await idbPut("meta", "iter", PBKDF2_ITER);
  await idbPut("meta", "check", check);
  key = k;
  try { await navigator.storage?.persist?.(); } catch {}
}

export async function unlock(pin) {
  const salt = await idbGet("meta", "salt");
  const iter = (await idbGet("meta", "iter")) || PBKDF2_ITER;
  const check = await idbGet("meta", "check");
  const k = await deriveKey(pin, salt, iter);
  try {
    const out = dec.decode(await decryptBytes(k, check));
    if (out !== CHECK_TEXT) return false;
  } catch { return false; }
  key = k;
  return true;
}

export async function loadDoc(name) {
  const rec = await idbGet("docs", name);
  if (!rec) return null;
  return JSON.parse(dec.decode(await decryptBytes(key, rec)));
}
export async function saveDoc(name, value) {
  const rec = await encryptBytes(key, enc.encode(JSON.stringify(value)));
  await idbPut("docs", name, rec);
}

export async function putBlob(id, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const rec = await encryptBytes(key, bytes);
  rec.type = blob.type || "application/octet-stream";
  await idbPut("blobs", id, rec);
}
export async function getBlob(id) {
  const rec = await idbGet("blobs", id);
  if (!rec) return null;
  const bytes = await decryptBytes(key, rec);
  return new Blob([bytes], { type: rec.type });
}
export async function deleteBlob(id) { await idbDel("blobs", id); }
export async function blobIds() { return idbKeys("blobs"); }

// PIN ändern: alles mit neuem Schlüssel neu verschlüsseln
export async function changePin(oldPin, newPin) {
  const ok = await unlock(oldPin);
  if (!ok) return false;
  const oldKey = key;
  const docNames = await idbKeys("docs");
  const docs = {};
  for (const n of docNames) docs[n] = await decryptBytes(oldKey, await idbGet("docs", n));
  const ids = await idbKeys("blobs");
  const blobs = {};
  for (const id of ids) { const r = await idbGet("blobs", id); blobs[id] = { type: r.type, bytes: await decryptBytes(oldKey, r) }; }
  const salt = rand(16);
  const k = await deriveKey(newPin, salt);
  for (const n of docNames) await idbPut("docs", n, await encryptBytes(k, docs[n]));
  for (const id of ids) { const rec = await encryptBytes(k, blobs[id].bytes); rec.type = blobs[id].type; await idbPut("blobs", id, rec); }
  await idbPut("meta", "check", await encryptBytes(k, enc.encode(CHECK_TEXT)));
  await idbPut("meta", "salt", salt);
  await idbPut("meta", "iter", PBKDF2_ITER);
  key = k;
  return true;
}

export async function wipeAll() {
  await idbClear("docs"); await idbClear("blobs"); await idbClear("meta");
  key = null;
}

// ---------- Backup ----------
const b64 = bytes => { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); };
const unb64 = str => { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
export { b64, unb64 };

export async function makeBackup(password, state) {
  const ids = await idbKeys("blobs");
  const blobs = {};
  for (const id of ids) {
    const r = await idbGet("blobs", id);
    blobs[id] = { type: r.type, data: b64(await decryptBytes(key, r)) };
  }
  const payload = enc.encode(JSON.stringify({ state, blobs }));
  const salt = rand(16);
  const k = await deriveKey(password, salt);
  const { iv, data } = await encryptBytes(k, payload);
  const file = { format: "rechnungsmappe-backup", v: 1, created: new Date().toISOString(), iter: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

export async function readBackup(file, password) {
  const k = await deriveKey(password, unb64(file.salt), file.iter || PBKDF2_ITER);
  let bytes;
  try { bytes = await decryptBytes(k, { iv: unb64(file.iv), data: unb64(file.data) }); }
  catch { throw new Error("wrong-password"); }
  return JSON.parse(dec.decode(bytes));
}

// Ersetzt alle Fotos durch die aus einer Sicherung / einem Import
export async function replaceBlobs(blobs) {
  await idbClear("blobs");
  for (const [id, b] of Object.entries(blobs || {})) {
    const rec = await encryptBytes(key, unb64(b.data));
    rec.type = b.type;
    await idbPut("blobs", id, rec);
  }
}
export async function addBlobsFromB64(blobs) {
  for (const [id, b] of Object.entries(blobs || {})) {
    const rec = await encryptBytes(key, unb64(b.data));
    rec.type = b.type;
    await idbPut("blobs", id, rec);
  }
}

export async function lastBackupAt() { return idbGet("meta", "lastBackup"); }
export async function setLastBackupAt(iso) { return idbPut("meta", "lastBackup", iso); }
