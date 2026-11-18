// Birit Sessions — the LIVE list of public Duet / Tapatan sessions (user, Nov 18: "paganahin muna sa website").
// No server: like the Birit Box app, this page meets the hosts through free public WebTorrent trackers.
// It joins the "lobby" swarm and sends a few WebRTC offers; every Birit Box app that is hosting a public
// session with "Show on the website" answers once, sends its listing (pub name, Pub #, mode, host,
// partner, when it ends, listeners, the current 10-minute guest code) and hangs up. Nothing is stored.
// Listen = biritbox://guest/<code> → opens the Birit Box app (Android); the host Allows or Denies.
(function () {
  "use strict";
  var list = document.getElementById("schList");
  if (!list) return;
  var TRACKERS = ["wss://tracker.openwebtorrent.com", "wss://tracker.webtorrent.dev"];
  var ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
  var LOBBY = "biritbox/v1/lobby";
  var OFFERS = 8;                // per tracker = how many live hosts one look can reach
  var LOOK_MS = 9000;            // how long one look listens for answers
  var EVERY_MS = 45000;          // look again
  var found = {};                // pubNo -> listing (newest)
  var filter = "all";
  var looking = false;

  var bin = function (u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
  var randBin = function (n) { return bin(crypto.getRandomValues(new Uint8Array(n))); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function sha1bin(text) { return crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)).then(function (b) { return bin(new Uint8Array(b)); }); }
  function waitIce(pc, ms) {
    return new Promise(function (res) {
      if (pc.iceGatheringState === "complete") return res();
      var t = setTimeout(res, ms);
      pc.addEventListener("icegatheringstatechange", function () { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
    });
  }

  // a listing from a host's app: keep only what we show, in safe sizes
  function clean(d) {
    if (!d || d.t !== "listing" || d.v !== 1) return null;
    var mode = d.mode === "tapatan" ? "tapatan" : d.mode === "duet" ? "duet" : null;
    var pubNo = /^\d{4}$/.test(String(d.pubNo)) ? String(d.pubNo) : null;
    var ends = Number(d.endsAt) || 0;
    if (!mode || !pubNo || ends < Date.now()) return null;
    var g = /^g[a-z0-9]{6}$/i.test(String(d.guest || "")) ? String(d.guest).toLowerCase() : null;
    return {
      pub: String(d.pub || "Birit Session").slice(0, 60), pubNo: pubNo, mode: mode,
      host: String(d.host || "").slice(0, 40), partner: d.partner ? String(d.partner).slice(0, 40) : "",
      createdAt: Number(d.createdAt) || 0, endsAt: ends,
      listeners: Math.max(0, Math.min(99, Number(d.listeners) || 0)), max: Math.max(1, Math.min(99, Number(d.max) || 5)),
      guest: g, guestUntil: Number(d.guestUntil) || 0,
      song: d.song ? String(d.song).slice(0, 90) : "", tapatan: d.tapatan ? String(d.tapatan).slice(0, 12) : "",
      seen: Date.now(),
    };
  }

  // one look: offers to the lobby on each tracker, collect what the hosts send
  function look() {
    if (looking) return Promise.resolve();
    looking = true;
    setStatus("Looking for live sessions…", true);
    return sha1bin(LOBBY).then(function (infoHash) {
      var peerId = randBin(20), pcs = [], sockets = [];
      TRACKERS.forEach(function (url) {
        var ws; try { ws = new WebSocket(url); } catch (e) { return; }
        sockets.push(ws);
        var pending = {};
        ws.onopen = function () {
          var offers = [], made = 0;
          for (var i = 0; i < OFFERS; i++) (function () {
            var pc = new RTCPeerConnection({ iceServers: ICE });
            pcs.push(pc);
            var dc = pc.createDataChannel("birit", { ordered: true });
            var id = randBin(20);
            pending[id] = pc;
            dc.onmessage = function (e) {
              var d; try { d = JSON.parse(e.data); } catch (x) { return; }
              var l = clean(d);
              if (l) { found[l.pubNo] = l; render(); }
            };
            pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return waitIce(pc, 1500); }).then(function () {
              offers.push({ offer: { type: "offer", sdp: pc.localDescription.sdp }, offer_id: id });
              if (++made === OFFERS && ws.readyState === 1) {
                ws.send(JSON.stringify({ action: "announce", info_hash: infoHash, peer_id: peerId, numwant: OFFERS,
                  uploaded: 0, downloaded: 0, left: 1, event: "started", offers: offers }));
              }
            }).catch(function () { made++; });
          })();
        };
        ws.onmessage = function (e) {
          var d; try { d = JSON.parse(e.data); } catch (x) { return; }
          if (d.info_hash !== infoHash || !d.answer || !pending[d.offer_id]) return;
          var pc = pending[d.offer_id];
          if (pc.signalingState === "have-local-offer") pc.setRemoteDescription(d.answer).catch(function () {});
        };
        ws.onerror = function () {};
      });
      return new Promise(function (res) {
        setTimeout(function () {
          sockets.forEach(function (w) { try { w.close(); } catch (e) {} });
          pcs.forEach(function (p) { try { p.close(); } catch (e) {} });
          res();
        }, LOOK_MS);
      });
    }).catch(function () {}).then(function () {
      looking = false;
      // drop listings that ended or weren't heard from in two looks
      Object.keys(found).forEach(function (k) { var l = found[k]; if (l.endsAt < Date.now() || Date.now() - l.seen > 2 * EVERY_MS + LOOK_MS) delete found[k]; });
      render();
      setStatus(Object.keys(found).length ? "Updated just now" : "No live sessions right now", false);
    });
  }

  var two = function (n) { return String(n).padStart(2, "0"); };
  function clock(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return { t: ((h % 12) || 12) + ":" + two(m), ap: h < 12 ? "AM" : "PM" }; }
  function left(ms) { var m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; }
  var IC = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M13 15.5a6 6 0 0 1 8 4.5"/></svg>',
    ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  function card(l) {
    var c = clock(l.createdAt || Date.now()), full = l.listeners >= l.max, code = l.guest && l.guestUntil > Date.now();
    var who = esc(l.host) + (l.partner ? " &amp; " + esc(l.partner) : "");
    var btn = full ? '<span class="btn ghost is-off">' + IC.users + 'Full</span>'
      : code ? '<a class="btn primary" href="biritbox://guest/' + esc(l.guest) + '">' + IC.ear + 'Listen</a>'
      : '<span class="btn ghost is-off">' + IC.wait + 'Opening soon</span>';
    return '<article class="sch live">' +
      '<div class="when"><span class="d">Live</span><span class="t">' + c.t + '</span><span class="ap">' + c.ap + '</span></div>' +
      '<div class="mode ' + l.mode + '"><img src="assets/modes/' + l.mode + '.svg" alt=""></div>' +
      '<div class="info"><h3 class="pub">' + esc(l.pub) + '</h3><div class="meta">' +
        '<span class="pubno"><b>PUB #</b><span>' + l.pubNo + '</span></span>' +
        '<span class="tag live"><i></i>Live now</span>' +
        '<span class="tag soon">Ends in ' + left(l.endsAt - Date.now()) + '</span>' +
        '<span>' + IC.user + who + '</span>' +
        '<span>' + IC.ear + l.listeners + ' / ' + l.max + ' listening</span>' +
      '</div>' + (l.song ? '<div class="sch-song">' + IC.note + esc(l.song) + '</div>' : '') + '</div>' +
      '<div class="side">' + btn + '<small>' + (l.mode === "tapatan" ? "Tapatan" : "Duet") + '</small></div>' +
    '</article>';
  }
  function render() {
    var rows = Object.keys(found).map(function (k) { return found[k]; })
      .filter(function (l) { return l.endsAt > Date.now() && (filter === "all" || l.mode === filter); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    document.getElementById("schCount").textContent = rows.length + (rows.length === 1 ? " session" : " sessions");
    list.innerHTML = rows.map(card).join("");
    list.hidden = !rows.length;
    document.getElementById("schEmpty").hidden = !!rows.length;
    // a shown guest code runs out (they last 10 minutes; the host's app makes the next one) → look again
    // 3 s later instead of waiting for the next 45 s look, so Listen is back quickly
    clearTimeout(render.t);
    var next = rows.reduce(function (m, l) { return l.guestUntil > Date.now() ? Math.min(m, l.guestUntil) : m; }, Infinity);
    if (next < Infinity) render.t = setTimeout(function () { look(); }, Math.max(3000, next - Date.now() + 3000));
  }
  function setStatus(text, busy) {
    var s = document.getElementById("schStatus");
    if (!s) return;
    s.querySelector("span").textContent = text;
    s.classList.toggle("busy", !!busy);
    document.getElementById("schRefresh").disabled = !!busy;
  }
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });
  document.getElementById("schRefresh").addEventListener("click", function () { look(); });
  if (!window.RTCPeerConnection || !window.crypto || !crypto.subtle) { setStatus("This browser can't look for sessions", false); return; }
  look();
  setInterval(function () { if (!document.hidden) look(); }, EVERY_MS);
  setInterval(render, 30000);   // "Ends in" stays right between looks
})();
