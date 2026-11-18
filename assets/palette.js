// Birit Box colour themes (user, Nov 18: "gawa ka na theme color ng application … Settings → Theme; moon button =
// shortcut ng theme"; "wag mo aalisin [ang Light] … yung dark nya sama mo sila"). Four: Light, Dark, Mango Night, Teal Club. The choice is kept per device
// ("birit.palette") and set on <html data-palette> before the page paints. Loaded as a plain script in <head>.
(function () {
  "use strict";
  var KEY = "birit.palette";
  var LIST = [
    { id: "light", name: "Light", sw: ["#FFF1E6", "#E8434A", "#FF6B35", "#2EC4B6"] },
    { id: "classic", name: "Dark", sw: ["#000000", "#E8434A", "#FF6B35", "#FFB84D"] },
    { id: "mango", name: "Mango Night", sw: ["#D9741A", "#FFB84D", "#FFD27A", "#2EC4B6"] },
    { id: "teal", name: "Teal Club", sw: ["#0FA39A", "#FF7A59", "#FFC857", "#3EE0D0"] },
  ];
  var root = document.documentElement;
  function get() {
    var v = ""; try { v = localStorage.getItem(KEY) || ""; } catch (e) {}
    if (LIST.some(function (p) { return p.id === v; })) return v;
    // first time: keep what the old sun/moon button had chosen
    var old = ""; try { old = localStorage.getItem("birit.themeSet") ? localStorage.getItem("birit.theme") || "" : ""; } catch (e) {}
    return old === "light" ? "light" : "classic";
  }
  function apply(id) { root.setAttribute("data-palette", id === "light" ? "classic" : id); root.setAttribute("data-theme", id === "light" ? "light" : "dark"); try { localStorage.setItem("birit.theme", id === "light" ? "light" : "dark"); } catch (e) {} }
  function set(id) {
    if (!LIST.some(function (p) { return p.id === id; })) return;
    try { localStorage.setItem(KEY, id); } catch (e) {}
    apply(id);
    try { window.dispatchEvent(new CustomEvent("birit-palette", { detail: id })); } catch (e) {}
  }
  apply(get());
  // another window/tab of Birit Box changed it → follow
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(get()); });

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7.3" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7.3" r="1.2" fill="currentColor"/><circle cx="17" cy="11" r="1.2" fill="currentColor"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function swatches(p) { return '<span class="pl-sw">' + p.sw.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>"; }
  // the choices, as buttons (used by the header shortcut and by Settings → Theme)
  function choicesHtml() {
    var cur = get();
    return LIST.map(function (p) {
      return '<button type="button" class="pl-opt" data-palette-pick="' + p.id + '" role="radio" aria-checked="' + (p.id === cur) + '">' + swatches(p) + '<span class="pl-name">' + p.name + '</span><span class="pl-ck">' + CHECK + "</span></button>";
    }).join("");
  }
  // header shortcut: the theme button opens a small menu of the three themes
  function wireShortcut() {
    var btn = document.getElementById("themeToggle");
    if (!btn || btn.dataset.pl) return;
    btn.dataset.pl = "1";
    btn.innerHTML = ICON;
    btn.setAttribute("aria-label", "Theme"); btn.title = "Theme";
    btn.setAttribute("aria-haspopup", "true");
    var menu = document.createElement("div");
    menu.className = "pl-menu"; menu.hidden = true; menu.setAttribute("role", "radiogroup"); menu.setAttribute("aria-label", "Theme");
    document.body.appendChild(menu);
    function place() { var r = btn.getBoundingClientRect(); menu.style.top = Math.round(r.bottom + 8) + "px"; menu.style.right = Math.max(8, Math.round(innerWidth - r.right)) + "px"; }
    function open() { menu.innerHTML = '<div class="pl-head">' + ICON + "<b>Theme</b></div>" + choicesHtml(); place(); menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); if (menu.hidden) open(); else close(); }, true);
    menu.addEventListener("click", function (e) { var b = e.target.closest("[data-palette-pick]"); if (b) { set(b.getAttribute("data-palette-pick")); open(); } e.stopPropagation(); });
    document.addEventListener("click", function () { if (!menu.hidden) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) close(); });
    addEventListener("resize", function () { if (!menu.hidden) place(); });
  }
  // anywhere else (Settings → Theme) can use the same buttons
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest(".pl-inline [data-palette-pick]"); if (!b) return; set(b.getAttribute("data-palette-pick")); var box = b.closest(".pl-inline"); if (box) box.innerHTML = choicesHtml(); });
  window.BiritPalette = { get: get, set: set, list: LIST, choicesHtml: choicesHtml };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireShortcut); else wireShortcut();
})();
