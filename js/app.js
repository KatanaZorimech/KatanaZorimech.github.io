(function () {
  "use strict";

  var ROUTES = ["home", "travel", "movies", "books", "french"];
  var DEFAULT_ROUTE = "home";

  var splash = document.getElementById("splash");
  var app = document.getElementById("app");
  var main = document.getElementById("main");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var heroImg = document.querySelector(".hero-img");
  if (heroImg) {
    heroImg.addEventListener("error", function () {
      heroImg.classList.add("is-missing");
    });
  }

  function getRouteFromHash() {
    var h = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
    if (!h || h === "") return DEFAULT_ROUTE;
    var parts = h.split("/");
    var key = parts[0];
    if (ROUTES.indexOf(key) !== -1) return key;
    return DEFAULT_ROUTE;
  }

  function setActiveNav(route) {
    var links = document.querySelectorAll(".site-nav a[data-route]");
    links.forEach(function (a) {
      var r = a.getAttribute("data-route");
      if (r === route) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  function showView(route) {
    var views = document.querySelectorAll(".view[data-view]");
    views.forEach(function (section) {
      var v = section.getAttribute("data-view");
      if (v === route) {
        section.classList.remove("is-hidden");
        section.removeAttribute("hidden");
      } else {
        section.classList.add("is-hidden");
        section.setAttribute("hidden", "");
      }
    });
    setActiveNav(route);
  }

  function applyRouteFromHash() {
    var route = getRouteFromHash();
    showView(route);
  }

  window.addEventListener("hashchange", applyRouteFromHash);

  function dismissSplash() {
    if (!splash || !app) return;
    splash.setAttribute("aria-hidden", "true");
    splash.style.display = "none";
    app.removeAttribute("inert");
    app.classList.add("is-visible");
    applyRouteFromHash();
    if (main) {
      main.focus({ preventScroll: true });
    }
  }

  function runRippleAt(clientX, clientY) {
    var rx = clientX + "px";
    var ry = clientY + "px";
    var layer = document.createElement("div");
    layer.className = "ripple-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.setProperty("--rx", rx);
    layer.style.setProperty("--ry", ry);

    var reduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.body.appendChild(layer);
    requestAnimationFrame(function () {
      layer.classList.add("is-animating");
    });

    var duration = reduced ? 350 : 780;
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      layer.remove();
      dismissSplash();
    }

    layer.addEventListener("animationend", finish, { once: true });
    window.setTimeout(function () {
      if (layer.parentNode) finish();
    }, duration + 120);
  }

  var splashLocked = false;

  function onSplashPointer(event) {
    if (splashLocked) return;
    splashLocked = true;
    var x = event.clientX;
    var y = event.clientY;
    if (typeof x !== "number" || typeof y !== "number") {
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    }
    runRippleAt(x, y);
  }

  if (splash) {
    splash.addEventListener("click", onSplashPointer);
    splash.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSplashPointer({
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
        });
      }
    });
  }

  var rawHash = window.location.hash;
  if (!rawHash || rawHash === "#") {
    window.location.replace("#/");
  }
  applyRouteFromHash();
})();
