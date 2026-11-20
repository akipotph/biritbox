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
  var planned = {};              // "pubkey|d" -> a scheduled session (from Nostr relays)
  var RELAYS = (function () {
    // tests only: ?relays=ws://localhost:PORT (a relay on this computer); anything else is ignored
    var t = (new URLSearchParams(location.search).get("relays") || "").split(",").filter(function (u) { return /^ws:\/\/(localhost|127\.0\.0\.1):\d+$/.test(u); });
    return t.length ? t : ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
  })();
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
    var mode = d.mode === "tapatan" ? "tapatan" : d.mode === "duet" ? "duet" : d.mode === "group" ? "group" : null;
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
      singers: Math.max(0, Math.min(10, Number(d.singers) || 0)),
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
  // the Birit mode as a small pill under the time, and its icon on a vinyl disc (user, Nov 18)
  var MODE_NAME = { tapatan: "Tapatan", group: "Group", duet: "Duet" };
  function modePill(m) { return '<span class="mpill ' + m + '">' + (MODE_NAME[m] || "") + "</span>"; }
  function vinyl(m) { return '<div class="mode vinyl ' + m + '"><span class="vl"><img src="assets/modes/' + m + '.svg" alt=""></span></div>'; }
  // ---- Listen = biritbox://guest/<code> on every device (user, Nov 19): a phone/tablet opens the Birit Box app,
  // a PC opens the Birit Box .exe (registered for biritbox:// in Windows) — never the browser.

  function card(l) {
    var c = clock(l.createdAt || Date.now()), full = l.listeners >= l.max, code = l.guest && l.guestUntil > Date.now();
    var who = esc(l.host) + (l.mode === "group" ? " · " + l.singers + " singers" : l.partner ? " &amp; " + esc(l.partner) : "");
    var btn = full ? '<span class="btn ghost is-off">' + IC.users + 'Full</span>'
      : code ? '<a class="btn primary" href="biritbox://guest/' + esc(l.guest) + '" data-listen="' + esc(l.guest) + '" data-pub="' + esc(l.pub) + '" data-pubno="' + esc(l.pubNo) + '">' + IC.ear + 'Listen</a>'
      : '<span class="btn ghost is-off">' + IC.wait + 'Opening soon</span>';
    return '<article class="sch live">' +
      '<div class="when"><span class="d">Live</span><span class="t">' + c.t + ' <small>' + c.ap + '</small></span>' + modePill(l.mode) + '</div>' +
      vinyl(l.mode) +
      '<div class="info"><h3 class="pub">' + esc(l.pub) + '</h3><div class="meta">' +
        '<span class="pubno"><b>PUB #</b><span>' + l.pubNo + '</span></span>' +
        '<span class="tag live"><i></i>Live now</span>' +
        '<span class="tag soon">Ends in ' + left(l.endsAt - Date.now()) + '</span>' +
        '<span>' + IC.user + who + '</span>' +
        '<span>' + IC.ear + l.listeners + ' / ' + l.max + ' listening</span>' +
      '</div>' + (l.song ? '<div class="sch-song">' + IC.note + esc(l.song) + '</div>' : '') + '</div>' +
      '<div class="side">' + btn + '</div>' +
    '</article>';
  }
  // ---- scheduled sessions (Nostr): the host's app signed them; we check every signature ----
  // scheduled + "on the go" bookings from Nostr relays: every signature and proof-of-work is checked
  // (assets/nostr.js); up to 10 public sessions per hour, booked for today only — the earliest keep their places
  var bookings = [];
  function readPlanned() {
    var N = window.BiritNostr;
    if (!N) return;
    N.readBookings(RELAYS).then(function (list) { bookings = N.winners(list); render(); }).catch(function () {});
  }
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(ms) { var d = new Date(ms), t = new Date(); t.setHours(0, 0, 0, 0); var k = Math.round((new Date(ms).setHours(0, 0, 0, 0) - t) / 864e5); return k === 0 ? "Today" : k === 1 ? "Tomorrow" : DAYS[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate(); }
  function ics(p) {
    var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Birit Box//Sessions//EN", "BEGIN:VEVENT", "UID:" + p.by.slice(0, 16) + p.startAt + "@biritbox",
      "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(p.startAt), "DTEND:" + f(p.endsAt), "SUMMARY:Birit Box " + ({ duet: "Duet", tapatan: "Tapatan", group: "Group" })[p.mode] + " - " + p.pub.replace(/[,;\\]/g, " "),
      "DESCRIPTION:Pub #" + p.pubNo + " - listen on akipotph.github.io/biritbox/sessions.html", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
  }
  function planCard(p) {
    var c = clock(p.startAt), started = p.startAt <= Date.now(), isLive = started && p.endsAt > Date.now() && Object.keys(found).some(function (k) { return found[k].pubNo === p.pubNo; }); // only the booking whose hour is NOW (user Nov 18: 7:00 showed Live at 5:23)
    // no "Add to calendar" (user, Nov 18: it's on the calendar by itself once the host books it)
    return '<article class="sch planned">' +
      '<div class="when"><span class="d">' + esc(dayLabel(p.startAt)) + '</span><span class="t">' + c.t + '</span><span class="ap">' + c.ap + '</span></div>' +
      '<div class="mode ' + p.mode + '"><img src="assets/modes/' + p.mode + '.svg" alt=""></div>' +
      '<div class="info"><h3 class="pub">' + esc(p.pub) + '</h3><div class="meta">' +
        '<span class="pubno"><b>PUB #</b><span>' + p.pubNo + '</span></span>' +
        (p.live ? '<span class="tag walkin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3.5h3.5a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M9.5 16.5 14 12l-4.5-4.5"/><path d="M14 12H3.5"/></svg>Walk-in</span>' : "") +
        (isLive ? '<span class="tag live"><i></i>Live now — see above</span>' : started ? '<span class="tag soon">' + (p.live ? "Host not on yet" : "Starting — host not on yet") + '</span>' : '<span class="tag upcoming">Upcoming</span><span class="tag soon">In ' + left(p.startAt - Date.now()) + '</span>') +
        '<span>' + IC.user + esc(p.host) + '</span><span>' + IC.wait + '1 hour</span>' +
      '</div></div>' +
      '<div class="side">' + modePill(p.mode) + '</div>' +
    '</article>';
  }

  var calMonth = 0, calDay = null;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function shortTime(t) { var d = new Date(t), h = d.getHours() % 12 || 12, m = d.getMinutes(); return h + (m ? ":" + two(m) : "") + (d.getHours() < 12 ? "a" : "p"); }
  function fullTime(t) { var d = new Date(t), h = d.getHours() % 12 || 12; return h + ":" + two(d.getMinutes()) + " " + (d.getHours() < 12 ? "AM" : "PM"); }
  // a day with more than 4 bookings: a small card with all of them on hover / focus
  var calTip = null;
  function showCalTip(b) {
    var st = Number(b.getAttribute("data-hour")), day = inHour(st);
    if (!day.length) { hideCalTip(); return; }
    if (!calTip) { calTip = document.createElement("div"); calTip.setAttribute("role", "tooltip"); document.body.appendChild(calTip); }
    var ic = function (dd) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + dd + "</svg>"; };
    var CLOCK = ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), PEOPLE = ic('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.7c2.6.2 4.4 2 5 5.3"/>'), MIC = ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>');
    var NAME = { duet: "Duet", tapatan: "Tapatan", group: "Group" }, n = Math.min(PER_HOUR, day.length), full = n >= PER_HOUR;
    var meter = ""; for (var i = 0; i < PER_HOUR; i++) meter += '<i class="' + (day[i] ? day[i].mode : "") + '"></i>';
    calTip.className = "cal-tip v2";
    calTip.innerHTML = '<div class="tp-head"><span class="tp-tile">' + CLOCK + '</span><div class="tp-ttl"><b>' + fullTime(st) + " – " + fullTime(st + 3600e3) + "</b><small>" + PEOPLE + n + " of " + PER_HOUR + " places" + (full ? ' · <strong>Full</strong>' : "") + "</small></div></div>" +
      '<div class="tp-meter">' + meter + '</div><ul class="tp-list">' + day.map(function (x) {
        return '<li><span class="tp-no"><b>PUB #</b>' + esc(x.pubNo) + '</span><span class="tp-name" title="' + esc(x.pub) + '">' + MIC + "<span>" + esc(x.pub) + "</span></span>" +
          '<em class="tp-mode ' + x.mode + '"><i class="tp-fig" style="--fig:url(' + new URL("assets/modes/" + x.mode + ".svg", location.href).href + ')"></i>' + NAME[x.mode] + "</em></li>";
      }).join("") + "</ul>";
    calTip.hidden = false;
    var r = b.getBoundingClientRect(), w = calTip.offsetWidth, hh = calTip.offsetHeight;
    var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)), top = r.top - hh - 6;
    if (top < 8) top = r.bottom + 6;
    top = Math.max(8, Math.min(top, innerHeight - hh - 8));
    calTip.style.left = left + "px"; calTip.style.top = top + "px";
  }
  function hideCalTip() { if (calTip) calTip.hidden = true; }
  // TODAY's board, like the app (user, Nov 19: "pati design na bago ng calendar"): bookings are for today only, so
  // 16 hour tiles (7 AM – 10 PM starts), 10 bars each (one per place, coloured by mode) and "n/10"; hover = the
  // hour card. A booking counts on the day it STARTS (Nov 19 bug: 11:04 PM – 12:04 AM showed on the next day too).
  var OPEN_H = 7, CLOSE_H = 23, PER_HOUR = 10;
  function busyIn(list, st, en) {
    var pts = [st].concat(list.filter(function (a) { return a.startAt > st && a.startAt < en; }).map(function (a) { return a.startAt; })), most = 0;
    pts.forEach(function (pt) { var n = 0; list.forEach(function (a) { if (a.startAt <= pt && pt < a.endsAt) n++; }); if (n > most) most = n; });
    return most;
  }
  // a booking belongs to the hour it STARTS in (Nov 19: a 9:12 walk-in showed in 9 PM and 10 PM)
  function hourOf(t) { var d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime(); }
  function inHour(st) { return bookings.filter(function (x) { return hourOf(x.startAt) === st && (filter === "all" || x.mode === filter); }).sort(function (a, z) { return a.startAt - z.startAt; }); }
  function renderCal() {
    var grid = document.getElementById("calGrid");
    if (!grid) return;
    var t0 = dayStart(Date.now()), now = Date.now(), d = new Date(t0);
    calDay = t0;
    document.getElementById("calTitle").textContent = "Today · " + MON[d.getMonth()] + " " + d.getDate();
    document.getElementById("calYear").textContent = "";
    var nav = document.querySelector("#schCal .cal-nav"); if (nav) nav.hidden = true;
    grid.className = "cal-grid board";
    var html = "";
    for (var h = OPEN_H; h < CLOSE_H; h++) {
      var st = t0 + h * 3600e3, en = st + 3600e3, past = en <= now, near = inHour(st), n = Math.min(PER_HOUR, near.length);
      var bars = ""; for (var i = 0; i < PER_HOUR; i++) bars += '<i class="' + (near[i] ? near[i].mode : "") + '"></i>';
      var lbl = (h % 12 || 12) + " " + (h < 12 ? "AM" : "PM");
      html += '<button type="button" class="hr' + (past ? " past" : "") + (n >= PER_HOUR ? " full" : "") + '" data-hour="' + st + '"' + (near.length ? ' data-has="1"' : "") + ' aria-label="' + lbl + ", " + n + " of " + PER_HOUR + ' booked"><b>' + lbl + '</b><span class="bars">' + bars + "</span><em>" + (n >= PER_HOUR ? "Full" : n + "/" + PER_HOUR) + "</em></button>";
    }
    grid.innerHTML = html;
    var day = bookings.filter(function (x) { return x.startAt >= t0 && x.startAt < t0 + 864e5 && (filter === "all" || x.mode === filter); }).sort(function (a, z) { return a.startAt - z.startAt; });
    document.getElementById("calDayTitle").textContent = "Today · " + MON[d.getMonth()] + " " + d.getDate() + " — " + (day.length ? day.length + (day.length === 1 ? " session" : " sessions") : "free all day");
    document.getElementById("calDayList").innerHTML = day.length ? day.map(planCard).join("") : '<div class="cal-free">No one has booked today yet. Hosts book an hour in the Birit Box app (calendar button beside Birit na!).</div>';
  }
  function render() {
    var rows = Object.keys(found).map(function (k) { return found[k]; })
      .filter(function (l) { return l.endsAt > Date.now() && (filter === "all" || l.mode === filter); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var liveNos = {}; Object.keys(found).forEach(function (k) { liveNos[found[k].pubNo] = 1; });
    // booked = scheduled ahead; walk-in = started right away with "Birit na!" on a free hour (user, Nov 19)
    var upcoming = bookings.filter(function (p) { return p.endsAt > Date.now() && !p.live && !liveNos[p.pubNo]; }).length;
    var walkins = bookings.filter(function (p) { return p.endsAt > Date.now() && p.live; }).length;
    var total = rows.length + upcoming;
    // three stat chips with icons (user, Nov 19: "lagyan mo design … plain lang")
    var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
    // commercial icon badges (user, Nov 19: "pang commercial icon sana"): a solid round badge per status
    var B = function (d, sw) { return '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2.4) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg></span>"; };
    var ON_AIR = '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"/>';
    var CAL_OK = '<rect x="3.5" y="5" width="17" height="16" rx="3.2"/><path d="M8 2.8v4.4M16 2.8v4.4M3.5 10h17"/><path d="M8.6 15.2l2.4 2.4 4.6-4.8"/>';
    var ENTER = '<path d="M14 3.5h3.5a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M9.5 16.5 14 12l-4.5-4.5"/><path d="M14 12H3.5"/>';
    document.getElementById("schCount").innerHTML =
      '<span class="stat s-live" title="On air now">' + B(ON_AIR, 2.3) + "<b>" + rows.length + "</b>Live</span>" +
      '<span class="stat s-booked" title="Scheduled ahead">' + B(CAL_OK) + "<b>" + upcoming + "</b>Booked</span>" +
      '<span class="stat s-walkin" title="Started right away with Birit na!">' + B(ENTER) + "<b>" + walkins + "</b>Walk-in</span>";
    list.innerHTML = rows.map(card).join("");
    list.hidden = !rows.length;
    document.getElementById("schEmpty").hidden = !!total;
    if (calDay == null) calDay = dayStart(Date.now());
    renderCal();
    // a shown guest code runs out (they last 10 minutes; the host's app makes the next one) → look again
    // 3 s later instead of waiting for the next 45 s look, so Listen is back quickly
    clearTimeout(render.t);
    var next = rows.reduce(function (m, l) { return l.guestUntil > Date.now() ? Math.min(m, l.guestUntil) : m; }, Infinity);
    if (next < Infinity) render.t = setTimeout(function () { look(); }, Math.max(3000, next - Date.now() + 3000));
  }
  (function () {
    var g = document.getElementById("calGrid"); if (!g) return;
    g.addEventListener("mouseover", function (e) { var b = e.target.closest("[data-hour]"); if (b) showCalTip(b); else hideCalTip(); });
    g.addEventListener("mouseleave", hideCalTip);
    g.addEventListener("focusin", function (e) { var b = e.target.closest("[data-hour]"); if (b) showCalTip(b); });
    g.addEventListener("focusout", hideCalTip);
    addEventListener("scroll", hideCalTip, { passive: true });
  })();
  document.getElementById("calGrid") && document.getElementById("calGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-day]"); if (!b) return;
    calDay = Number(b.getAttribute("data-day")); renderCal();
  });
  document.getElementById("calPrev") && document.getElementById("calPrev").addEventListener("click", function () { if (calMonth > 0) { calMonth--; renderCal(); } });
  document.getElementById("calNext") && document.getElementById("calNext").addEventListener("click", function () { if (calMonth < 1) { calMonth++; renderCal(); } });
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
  if (window.BiritNostr) readPlanned(); else window.addEventListener("birit-nostr", readPlanned, { once: true });
  setInterval(function () { if (!document.hidden) readPlanned(); }, 120000);
  setInterval(render, 30000);   // "Ends in" stays right between looks
})();
