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
