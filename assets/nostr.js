// Birit Box — a tiny Nostr client for SCHEDULED sessions (user, Nov 18: "after mag schedule kahit hindi naka bukas
// yung app naka display parin sa website"). Nostr = an open network of free public "relays" (not our servers).
// A host's device signs a small event (pub name, Pub #, mode, start / end time — what the website shows) and
// sends it to a few relays; the website reads them back, even when the app is closed. Each device has its own
// key (made here, kept on the device); signatures are BIP-340 Schnorr on secp256k1, written out below with
// BigInt (no library, nothing downloaded). The events expire (NIP-40) when the session's hour is over.
// Shared by the app (landing.js / room.js) and copied for the website (hosting/site/assets/nostr.js).

export const RELAYS = (() => {
  // tests only: a relay on THIS computer (sessionStorage "birit.test.relays"); anything else is ignored
  try { const t = (sessionStorage.getItem("birit.test.relays") || "").split(",").filter((u) => /^ws:\/\/(localhost|127\.0\.0\.1):\d+$/.test(u)); if (t.length) return t; } catch {}
  return ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
})();
export const KIND = 30078;                 // app-specific, replaceable per "d" (= the room code)
export const TAG = "biritbox-schedule";

// ---- secp256k1 ----
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
function inv(a, m = P) {               // a^-1 mod m (extended Euclid)
  let [x, y, u, v] = [mod(a, m), m, 1n, 0n];
  while (x !== 0n) { const q = y / x; [y, x] = [x, y - q * x]; [v, u] = [u, v - q * u]; }
  return mod(v, m);
}
function add(p1, p2) {                 // affine point add (null = infinity) — kept for callers; the hot path is Jacobian
  return toA(jAdd(toJ(p1), toJ(p2)));
}
// Jacobian coordinates (X/Z², Y/Z³): no inverse per step, ONE at the end. (Nov 18 load test: the old affine math did
// ~500 inverses per check — 50 ms on a PC, far more on a phone; hundreds of bookings froze the calendar.)
const J0 = [0n, 1n, 0n];
const toJ = (p) => (p ? [p[0], p[1], 1n] : J0);
function toA(j) { if (j[2] === 0n) return null; const zi = inv(j[2]), zi2 = mod(zi * zi); return [mod(j[0] * zi2), mod(j[1] * zi2 * zi)]; }
function jDbl(p) {
  const [X, Y, Z] = p; if (Z === 0n || Y === 0n) return J0;
  const YY = mod(Y * Y), S = mod(4n * X * YY), M = mod(3n * X * X), X3 = mod(M * M - 2n * S);
  return [X3, mod(M * (S - X3) - 8n * YY * YY), mod(2n * Y * Z)];
}
function jAdd(p, q) {
  if (p[2] === 0n) return q; if (q[2] === 0n) return p;
  const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q;
  const Z1Z1 = mod(Z1 * Z1), Z2Z2 = mod(Z2 * Z2), U1 = mod(X1 * Z2Z2), U2 = mod(X2 * Z1Z1);
  const S1 = mod(Y1 * Z2 * Z2Z2), S2 = mod(Y2 * Z1 * Z1Z1);
  if (U1 === U2) return S1 === S2 ? jDbl(p) : J0;
  const H = mod(U2 - U1), R = mod(S2 - S1), HH = mod(H * H), HHH = mod(H * HH), V = mod(U1 * HH);
  const X3 = mod(R * R - HHH - 2n * V);
  return [X3, mod(R * (V - X3) - S1 * HHH), mod(Z1 * Z2 * H)];
}
function table(pt) { const t = [J0, toJ(pt)]; for (let i = 2; i < 16; i++) t.push(jAdd(t[i - 1], t[1])); return t; }   // pt·0 … pt·15
let _gTable = null;
const gTable = () => _gTable || (_gTable = table(G));
// a·A + b·B with one shared chain of doublings, 4 bits at a time (Strauss–Shamir)
function mul2(a, A, b, B) {
  const ta = a ? (A === G ? gTable() : table(A)) : null, tb = b ? (B === G ? gTable() : table(B)) : null;
  let r = J0;
  for (let i = 63; i >= 0; i--) {
    r = jDbl(jDbl(jDbl(jDbl(r))));
    const sh = BigInt(i * 4);
    if (ta) { const n = Number((a >> sh) & 15n); if (n) r = jAdd(r, ta[n]); }
    if (tb) { const n = Number((b >> sh) & 15n); if (n) r = jAdd(r, tb[n]); }
  }
  return r;
}
function mul(k, pt = G) { k = mod(k, N); return k === 0n ? null : toA(mul2(k, pt, 0n, null)); }
function liftX(x) {                    // the point with even y for this x
  if (x >= P) return null;
  const c = mod(x * x * x + 7n); let y = 1n, b = c, e = (P + 1n) / 4n;
  while (e > 0n) { if (e & 1n) y = mod(y * b); b = mod(b * b); e >>= 1n; }
  if (mod(y * y) !== c) return null;
  return [x, y % 2n === 0n ? y : P - y];
}
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const toBytes = (n) => unhex(n.toString(16).padStart(64, "0"));
const toInt = (u8) => BigInt("0x" + (hex(u8) || "0"));
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
const sha256 = async (u8) => new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
async function tagged(tag, ...msgs) { const t = await sha256(new TextEncoder().encode(tag)); return sha256(cat(t, t, ...msgs)); }

export function pubOf(privHex) { return hex(toBytes(mul(BigInt("0x" + privHex))[0])); }
// BIP-340 sign: 32-byte message -> 64-byte signature (hex)
export async function schnorrSign(msgU8, privHex, auxU8 = crypto.getRandomValues(new Uint8Array(32))) {
  const d0 = BigInt("0x" + privHex);
  if (d0 <= 0n || d0 >= N) throw new Error("bad key");
  const Pp = mul(d0);
  const d = Pp[1] % 2n === 0n ? d0 : N - d0;
  const t = toBytes(d ^ toInt(await tagged("BIP0340/aux", auxU8)));
  const px = toBytes(Pp[0]);
  const k0 = mod(toInt(await tagged("BIP0340/nonce", t, px, msgU8)), N);
  if (k0 === 0n) throw new Error("bad nonce");
  const R = mul(k0);
  const k = R[1] % 2n === 0n ? k0 : N - k0;
  const rx = toBytes(R[0]);
  const e = mod(toInt(await tagged("BIP0340/challenge", rx, px, msgU8)), N);
  return hex(cat(rx, toBytes(mod(k + e * d, N))));
}
export async function schnorrVerify(msgU8, pubHex, sigHex) {
  const Pp = liftX(BigInt("0x" + pubHex)); if (!Pp) return false;
  const sig = unhex(sigHex); const r = toInt(sig.slice(0, 32)), s = toInt(sig.slice(32));
  if (r >= P || s >= N) return false;
  const e = mod(toInt(await tagged("BIP0340/challenge", sig.slice(0, 32), unhex(pubHex), msgU8)), N);
  const R = toA(mul2(s, G, mod(N - e, N), Pp));        // s·G − e·P in one pass
  return !!R && R[1] % 2n === 0n && R[0] === r;
}

// ---- this device's key ----
export function myKey() {
  let k = "";
  try { k = localStorage.getItem("birit.nostrKey") || ""; } catch {}
  if (!/^[0-9a-f]{64}$/.test(k)) {
    do { k = hex(crypto.getRandomValues(new Uint8Array(32))); } while (BigInt("0x" + k) === 0n || BigInt("0x" + k) >= N);
    try { localStorage.setItem("birit.nostrKey", k); } catch {}
  }
  // the public key is a slow BigInt point multiply — work it out ONCE per key (Nov 18: the calendar asked 30×/render → 0.3 s lag)
  if (_myKeyCache.priv !== k) { _myKeyCache.priv = k; _myKeyCache.pub = pubOf(k); }
  return { priv: k, pub: _myKeyCache.pub };
}
const _myKeyCache = { priv: "", pub: "" };

// ---- events ----
// Proof-of-work (NIP-13): a booking's id must start with POW_BITS zero bits. One booking costs a phone about a
// second; booking EVERY hour of a week would cost a spammer hours — the slots stay fair (user, Nov 18: one public
// session per hour for everyone). Hashing for it uses the small synchronous SHA-256 below (fast enough in a loop).
export const POW_BITS = 16;
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Sync(bytes) {
  const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
  m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}
export function zeroBits(idHex) { let n = 0; for (const ch of idHex) { const v = parseInt(ch, 16); if (v === 0) { n += 4; continue; } n += Math.clz32(v) - 28; break; } return n; }
const enc = new TextEncoder();
export async function signEvent(ev, key = myKey(), pow = 0) {
  const e = { pubkey: key.pub, created_at: Math.floor(Date.now() / 1000), kind: ev.kind, tags: ev.tags || [], content: ev.content || "" };
  let idU8;
  if (pow > 0) {                                   // find a nonce whose event id has `pow` leading zero bits
    const tags = e.tags.filter((t) => t[0] !== "nonce");
    for (let n = 0; ; n++) {
      e.tags = [...tags, ["nonce", String(n), String(pow)]];
      idU8 = sha256Sync(enc.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])));
      if (zeroBits(hex(idU8)) >= pow) break;
      if (n % 20000 === 19999) await new Promise((r) => setTimeout(r, 0));   // keep the page responsive
    }
  } else idU8 = await sha256(enc.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])));
  return { ...e, id: hex(idU8), sig: await schnorrSign(idU8, key.priv) };
}
// send to the relays; resolves with how many said OK (each relay gets 6 s)
export function publish(ev, relays = RELAYS) {
  return Promise.all(relays.map((url) => new Promise((res) => {
    let ws, done = false;
    const end = (ok) => { if (done) return; done = true; try { ws && ws.close(); } catch {} res(ok); };
    try { ws = new WebSocket(url); } catch { return res(false); }
    const t = setTimeout(() => end(false), 6000);
    ws.onopen = () => ws.send(JSON.stringify(["EVENT", ev]));
    ws.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; } if (d[0] === "OK" && d[1] === ev.id) { clearTimeout(t); end(!!d[2]); } };
    ws.onerror = () => { clearTimeout(t); end(false); };
  }))).then((r) => r.filter(Boolean).length);
}
// a session's BOOKING (scheduled, or "on the go" = now): replaces any earlier one for the same room code
export async function scheduleEvent(s) {
  const content = JSON.stringify({ v: 1, pub: s.pub, pubNo: s.pubNo, mode: s.mode, host: s.host, startAt: s.startAt, endsAt: s.endsAt, cancelled: !!s.cancelled, live: !!s.live });
  const exp = Math.floor(Math.max(s.endsAt || 0, Date.now() + 60000) / 1000); // the cancel must outlive the booking (Nov 18: a relay that missed the cancel brought the hour back)
  return signEvent({ kind: KIND, content, tags: [["d", "biritbox:" + s.roomId], ["t", TAG], ["expiration", String(exp)]] }, myKey(), s.cancelled ? 0 : POW_BITS);
}

// ---- reading the bookings (app + website) ----
const u8 = (h) => unhex(h);
// a relay event -> a checked booking, or null (bad id / signature / work / content)
export async function checkBooking(ev) {
  if (!ev || ev.kind !== KIND || !/^[0-9a-f]{64}$/.test(ev.id || "") || !/^[0-9a-f]{64}$/.test(ev.pubkey || "") || !/^[0-9a-f]{128}$/.test(ev.sig || "")) return null;
  const dTag = (ev.tags || []).find((x) => x[0] === "d");
  if (!dTag || !/^biritbox:[a-z0-9]{4,12}$/.test(dTag[1] || "") || !(ev.tags || []).some((x) => x[0] === "t" && x[1] === TAG)) return null;
  let c; try { c = JSON.parse(ev.content); } catch { return null; }
  if (!c || c.v !== 1) return null;
  // cheap checks FIRST (fields, the work on the id), the signature last — spam is turned away for almost nothing
  const startAt = Number(c.startAt) || 0, endsAt = Number(c.endsAt) || 0;
  const mode = ["duet", "tapatan", "group"].includes(c.mode) ? c.mode : null;
  if (!c.cancelled && (zeroBits(ev.id) < POW_BITS || !mode || !/^\d{4}$/.test(String(c.pubNo)) || endsAt <= startAt || endsAt - startAt > 2 * 3600e3)) return null;
  // TODAY only (user, Nov 18: "today lang dapat pwede mag book … unfair sa iba na nag-aabang"): a booking made for
  // more than 24 h after it was signed doesn't count, whatever app made it
  if (!c.cancelled && startAt > (Number(ev.created_at) || 0) * 1000 + 24 * 3600e3) return null;
  const id = hex(await sha256(enc.encode(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]))));
  if (id !== ev.id) return null;
  // the id covers the key + content, so once its signature checked out on this device it never needs checking again
  if (!okIds().has(id)) { if (!(await schnorrVerify(u8(ev.id), ev.pubkey, ev.sig))) return null; rememberOk(id); }
  return { key: ev.pubkey + "|" + dTag[1], room: dTag[1].slice(9), by: ev.pubkey, id: ev.id, created: ev.created_at, cancelled: !!c.cancelled,
    pub: String(c.pub || "Birit Session").slice(0, 60), pubNo: String(c.pubNo || ""), mode, host: String(c.host || "").slice(0, 40), startAt, endsAt, live: !!c.live };
}
// ids whose signature this device already checked (kept small; ids are hashes, nothing personal)
let _okIds = null;
function okIds() { if (_okIds) return _okIds; try { _okIds = new Set(JSON.parse(localStorage.getItem("birit.okIds") || "[]")); } catch { _okIds = new Set(); } return _okIds; }
let _okSave = 0;
function rememberOk(id) {
  const s = okIds(); s.add(id);
  if (s.size > 800) { const keep = [...s].slice(-600); _okIds = new Set(keep); }
  clearTimeout(_okSave); _okSave = setTimeout(() => { try { localStorage.setItem("birit.okIds", JSON.stringify([..._okIds])); } catch {} }, 300);
}
// ask the relays for every booking (scheduled up to ~2 weeks ahead); resolves with the checked, current ones
export function readBookings(relays = RELAYS, ms = 7000) {
  const latest = new Map(), seen = new Set(), pending = [];
  let reached = 0;
  return Promise.all(relays.map((url) => new Promise((res) => {
    let ws; try { ws = new WebSocket(url); } catch { return res(); }
    const sub = "bb" + Math.random().toString(36).slice(2, 8);
    const t = setTimeout(() => { try { ws.close(); } catch {} res(); }, ms);
    ws.onopen = () => ws.send(JSON.stringify(["REQ", sub, { kinds: [KIND], "#t": [TAG], since: Math.floor(Date.now() / 1000) - 2 * 86400, limit: 500 }]));
    ws.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d[0] === "EOSE" && d[1] === sub) { reached++; clearTimeout(t); try { ws.close(); } catch {} res(); return; }
      if (d[0] !== "EVENT" || !d[2] || seen.has(d[2].id)) return;
      seen.add(d[2].id);
      pending.push(checkBooking(d[2]).then((b) => { if (b) { const o = latest.get(b.key); if (!o || o.created < b.created) latest.set(b.key, b); } }).catch(() => {}));
    };
    ws.onerror = () => { clearTimeout(t); res(); };
  }))).then(() => Promise.all(pending)).then(() => { const out = [...latest.values()].filter((b) => !b.cancelled && b.endsAt > Date.now()); out.reached = reached; return out; });
}
// Up to PER_HOUR public sessions at the same time, for everyone (user, Nov 18: "10 na lang … pag puno na slot … ibang
// available time"). The EARLIEST bookings keep their places; a later one that would make an hour the 11th loses.
// A device keeps at most 3 future bookings (its first 3) and never two at the same time.
export const PER_HOUR = 10;
// the most bookings of `list` running at any moment inside [startAt, endsAt)
export function busyIn(list, startAt, endsAt) {
  const pts = [startAt, ...list.filter((a) => a.startAt > startAt && a.startAt < endsAt).map((a) => a.startAt)];
  let most = 0;
  for (const p of pts) { let n = 0; for (const a of list) if (a.startAt <= p && p < a.endsAt) n++; if (n > most) most = n; }
  return most;
}
// the hour a booking belongs to = the hour it STARTS in (user, Nov 19: "bakit dalawa lumabas? walk-in yun eh")
export function hourOf(t) { const d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime(); }
export function winners(list) {
  const per = new Map(), out = [];
  for (const b of [...list].sort((a, z) => a.created - z.created || (a.id < z.id ? -1 : 1))) {
    const n = per.get(b.by) || 0;
    if (n >= 3) continue;
    const near = out.filter((a) => a.startAt < b.endsAt && b.startAt < a.endsAt);
    if (near.some((a) => a.by === b.by)) continue;               // one device, one session at a time
    const h = hourOf(b.startAt);
    if (out.filter((a) => hourOf(a.startAt) === h).length >= PER_HOUR) continue;   // its starting hour is full
    per.set(b.by, n + 1);
    out.push(b);
  }
  return out.sort((a, z) => a.startAt - z.startAt);
}
// can [startAt, endsAt) still be booked? null = yes. Otherwise: MY OWN booking at that time (when `me` is given),
// or { full: true, n } when PER_HOUR sessions already run then. (The booking for `room` itself doesn't count.)
export function clash(list, startAt, endsAt, room, me) {
  const W = winners(list).filter((b) => b.room !== room);
  if (me) { const own = W.find((b) => b.by === me && b.startAt < endsAt && startAt < b.endsAt); if (own) return own; }
  const n = W.filter((b) => hourOf(b.startAt) === hourOf(startAt)).length;
  return n >= PER_HOUR ? { full: true, n } : null;
}
