// Birit Box website — the theme player.
// Automatic (user, Nov 16: "automatic mo na"): it starts by itself when the
// page opens. Browsers (Chrome, Edge, Safari, Firefox) usually block sound
// until the visitor taps, clicks or presses a key, so when they block it, the
// theme starts on that first tap / click / key instead. The pause button
// always works, and once the visitor pauses it, it stays paused.
// Never automatic in a local preview (file://) — only on the real website.
(function () {
  var box = document.getElementById("theme");
  if (!box) return;
  var audio = box.querySelector("audio");
  var btn = box.querySelector(".theme-btn");
  var bar = box.querySelector(".theme-bar i");
  var time = box.querySelector(".theme-time");
  var userPaused = false;
  var fmt = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function play() { var p = audio.play(); if (p && p.catch) p.catch(function () {}); return p; }
  function sync() {
    var on = !audio.paused && !audio.ended;
    box.classList.toggle("playing", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Pause the Birit Box theme" : "Play the Birit Box theme");
  }
  btn.addEventListener("click", function () {
    if (audio.paused || audio.ended) { userPaused = false; play(); }
    else { userPaused = true; audio.pause(); }
  });
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  audio.addEventListener("ended", function () { sync(); bar.style.width = "0%"; time.textContent = fmt(audio.duration || 63); });
  audio.addEventListener("timeupdate", function () {
    var d = audio.duration || 63;
    bar.style.width = (100 * audio.currentTime / d).toFixed(2) + "%";
    time.textContent = fmt(d - audio.currentTime);
  });

  // ---- automatic start ----
  if (location.protocol === "file:") return;
  var EVENTS = ["pointerdown", "keydown", "touchstart"];
  function onFirst(e) {
    stopWaiting();
    if (btn.contains(e.target)) return;            // a press on the play button itself is handled by the button
    if (!userPaused && audio.paused && !audio.ended) play();
  }
  function stopWaiting() { EVENTS.forEach(function (t) { document.removeEventListener(t, onFirst, true); }); }
  audio.preload = "auto";
  var first = audio.play();
  if (first && first.catch) {
    first.catch(function () {                       // blocked until the visitor interacts
      EVENTS.forEach(function (t) { document.addEventListener(t, onFirst, true); });
    });
  }
})();

// Support: GCash | GoTyme (user, Nov 17) — the owner's own QR codes; a tap on the QR → our popup: the brand, the full
// name, a thank-you, "Open …" on a phone (its official store page — Open from there), and a note that this
// message is Birit Box's (a QR Ph code is payment data, not a link). The same as the app's About App.
(function () {
  var box = document.querySelector(".libre-stub");
  if (!box || !box.querySelector("[data-pay-open]")) return;
  var PAY = {
    gcash:  { name: "GCash",  qr: "assets/gcash-qr.png",  android: "https://play.google.com/store/apps/details?id=com.globe.gcash.android", ios: "https://apps.apple.com/ph/app/id520020791" },
    gotyme: { name: "GoTyme", qr: "assets/gotyme-qr.png", android: "https://play.google.com/store/apps/details?id=ph.com.gotyme", ios: "https://apps.apple.com/ph/app/id1637067963" }
  };
  var TO = "SER AKILA M. REFIL";
  var ICON = { gcash: '<img class="pay-ic" src="assets/gcash-icon.png" alt="" width="20" height="20">', gotyme: '<img class="pay-ic" src="assets/gotyme-icon.png" alt="" width="20" height="20">' };
  var os = /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "";
  var cur = "gcash", dlg = null;
  function open() {
    var p = PAY[cur], store = os ? p[os] : "";
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "pay-pop";
      dlg.setAttribute("aria-labelledby", "payTitle");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest(".pay-x")) dlg.close(); });
    }
    dlg.setAttribute("data-pay", cur);
    dlg.innerHTML = '<div class="pay-card">' +
      '<button type="button" class="pay-x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<div class="pay-lockup" aria-label="Birit Box"><img class="pay-logo" src="assets/app-icon.png" alt="" width="48" height="48"><span class="wordmark" aria-hidden="true"><span class="birit">Birit</span> <span class="box">Box</span></span></div>' +
      '<p class="pay-brand">' + ICON[cur] + '<span>' + p.name + '</span></p>' +
      '<h2 id="payTitle">Thank you for your support!</h2>' +
      '<p class="pay-to"><span>Send to</span><b>' + TO + '</b></p>' +
      '<p class="pay-thanks">Because of you, the birit keeps going — and Birit Box stays free for everyone.</p>' +
      '<img class="pay-qr" src="' + p.qr + '" alt="' + p.name + ' QR code for ' + TO + '" width="220" height="220">' +
      '<p class="pay-how">' + (os ? 'Screenshot the QR, then in ' + p.name + ': Scan QR → Upload.' : 'Scan the QR with the ' + p.name + ' app on your phone.') + '</p>' +
      (store ? '<a class="pay-open" href="' + store + '" target="_blank" rel="noopener">' + ICON[cur] + 'Open ' + p.name + '</a>' : '') +
      '<p class="pay-note">Note: this message is from Birit Box, not from ' + p.name + '. You send your support inside your own ' + p.name + ' app.</p>' +
      '</div>';
    if (!dlg.open) dlg.showModal();
  }
  box.addEventListener("click", function (e) {
    var t = e.target.closest("[data-pay]");
    if (t) {
      cur = t.getAttribute("data-pay");
      box.querySelectorAll("[data-pay]").forEach(function (b) { b.setAttribute("aria-selected", String(b === t)); });
      var btn = box.querySelector("[data-pay-open]"), img = btn.querySelector("img");
      img.src = PAY[cur].qr; img.alt = PAY[cur].name + " QR code";
      btn.setAttribute("aria-label", "Support via " + PAY[cur].name + " — show the details");
      return;
    }
    if (e.target.closest("[data-pay-open]")) open();
  });
})();

// Contact form (user, Nov 18: "sarili natin form … wala ng import ng email" + "security para sa spam").
// Sent with Web3Forms to the Birit Box inbox. Spam guards: a hidden honeypot (bots fill it → quietly dropped),
// no send in the first 3 s after the page opens, 60 s between sends, length limits, plus Web3Forms' own filter.
(function () {
  var form = document.getElementById("contactForm");
  if (!form) return;
  var ENDPOINT = "https://api.web3forms.com/submit";
  var MIN_MS = 3000, GAP_MS = 60000, LAST = "birit.contact.last";
  var opened = Date.now();
  var status = form.querySelector(".cf-status"), btn = form.querySelector('button[type="submit"]');
  var f = { name: form.elements.name, email: form.elements.email, message: form.elements.message };
  function say(msg, kind) { status.textContent = msg; status.className = "cf-status" + (kind ? " " + kind : ""); }
  function lastSent() { try { return +localStorage.getItem(LAST) || 0; } catch (e) { return 0; } }
  function markSent() { try { localStorage.setItem(LAST, String(Date.now())); } catch (e) {} }
  function bad(el, msg) { el.setAttribute("aria-invalid", "true"); el.focus(); say(msg, "err"); return false; }
  function check() {
    Object.keys(f).forEach(function (k) { f[k].removeAttribute("aria-invalid"); });
    var name = f.name.value.trim(), email = f.email.value.trim(), msg = f.message.value.trim();
    if (name.length < 2) return bad(f.name, "Please type your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(f.email, "Please type a valid email so we can reply.");
    if (msg.length < 10) return bad(f.message, "Your message is a bit short.");
    if ((msg.match(/https?:\/\//gi) || []).length > 3) return bad(f.message, "Please send fewer links.");
    return true;
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (btn.disabled) return;
    if (form.elements.botcheck && form.elements.botcheck.checked) { form.reset(); say("Thanks! Your message was sent.", "ok"); return; }   // bot: dropped quietly
    if (!check()) return;
    if (Date.now() - opened < MIN_MS) { say("One moment, then press Send again.", "err"); return; }
    var wait = GAP_MS - (Date.now() - lastSent());
    if (wait > 0) { say("Message sent already. You can send another in " + Math.ceil(wait / 1000) + " s.", "err"); return; }
    var key = form.elements.access_key.value;
    if (!key || key.indexOf("[[") === 0) { say("The message form isn't ready yet. Please try again later.", "err"); return; }
    btn.disabled = true; say("Sending…");
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: key,
        subject: "Birit Box website: message from " + f.name.value.trim().slice(0, 80),
        from_name: "Birit Box website",
        name: f.name.value.trim().slice(0, 80),
        email: f.email.value.trim().slice(0, 120),
        message: f.message.value.trim().slice(0, 2000),
        botcheck: false
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.success, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.message) || "send failed");
        markSent(); form.reset(); say("Thanks! Your message was sent. We'll reply by email.", "ok");
      })
      .catch(function () { say("Couldn't send right now. Please check your internet and try again.", "err"); })
      .then(function () { btn.disabled = false; });
  });
})();

// Download counter (user, Nov 18): how many times the apps were downloaded, from GitHub Releases
// (akipotph/biritbox). GitHub counts each download of a release file; this adds them up in the
// browser — no server, no tracking. Kept for 10 minutes so a visitor doesn't ask GitHub each time.
(function () {
  var box = document.getElementById("dlCounter");
  if (!box) return;
  var API = "https://api.github.com/repos/akipotph/biritbox/releases?per_page=100";
  var KEY = "birit.dlcount", KEEP = 10 * 60 * 1000;
  var kindOf = function (name) {
    name = String(name || "").toLowerCase();
    if (/remote/.test(name) && /\.apk$/.test(name)) return "remote";
    if (/\.apk$/.test(name)) return "android";
    if (/\.(exe|msi|zip)$/.test(name)) return "windows";
    return null;
  };
  function show(c) {
    var n = c.android + c.remote + c.windows;
    document.getElementById("dlTotal").textContent = n.toLocaleString("en-US");
    document.getElementById("dlWord").textContent = n === 1 ? "download" : "downloads";
    box.classList.add("ready");
    document.querySelectorAll("[data-dl]").forEach(function (el) {
      var k = c[el.getAttribute("data-dl")] || 0;
      el.querySelector("b").textContent = k.toLocaleString("en-US");   // every card shows its own count, 0 too
      el.lastChild.textContent = k === 1 ? " download" : " downloads";
    });
  }
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && Date.now() - saved.t < KEEP) return show(saved.c); } catch (e) {}
  fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
    .then(function (rels) {
      var c = { android: 0, remote: 0, windows: 0 };
      (Array.isArray(rels) ? rels : []).forEach(function (rel) {
        (rel.assets || []).forEach(function (a) { var k = kindOf(a.name); if (k) c[k] += Number(a.download_count) || 0; });
      });
      try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), c: c })); } catch (e) {}
      show(c);
    })
    .catch(function () { box.hidden = true; });   // GitHub busy / offline: no counter rather than a wrong one
})();
