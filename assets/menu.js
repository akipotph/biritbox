// Birit Box website — the menu on phones (user, Nov 21: "gawin mo tulad ng nasa remote, naka-menu dropdown"):
// a menu button beside the theme button drops the page links down as a card (like the Birit Box app's phone
// header). It closes on a link, a tap outside or Esc. Wide screens keep the menu row as it is (CSS only shows the
// button at ≤ 720 px).
(function () {
  var top = document.querySelector(".top"), wrap = top && top.querySelector(".wrap"), nav = top && top.querySelector(".nav");
  if (!top || !wrap || !nav || top.querySelector(".nav-toggle")) return;
  if (!nav.id) nav.id = "siteNav";
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "nav-toggle"; btn.setAttribute("aria-label", "Menu");
  btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", nav.id);
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>';
  var theme = wrap.querySelector(".pl-btn, .theme-btn");
  if (theme) wrap.insertBefore(btn, theme); else wrap.appendChild(btn);
  function setOpen(open) { top.classList.toggle("menu-open", open); btn.setAttribute("aria-expanded", String(open)); }
  btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(!top.classList.contains("menu-open")); });
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("click", function (e) { if (top.classList.contains("menu-open") && !top.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && top.classList.contains("menu-open")) { setOpen(false); btn.focus(); } });
  window.addEventListener("resize", function () { if (window.innerWidth > 720) setOpen(false); });
})();
