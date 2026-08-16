/** Coarse pointer / no hover ≈ phone or tablet touch play. */
export function isTouchPlay() {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(hover: none)").matches) return true;
  } catch (_) {
    /* ignore */
  }
  return "ontouchstart" in window && navigator.maxTouchPoints > 0;
}

export function isPortraitMobile() {
  try {
    const narrow = window.matchMedia("(max-width: 920px)").matches;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    return narrow && portrait && isTouchPlay();
  } catch (_) {
    return false;
  }
}

/** Ask browser to lock landscape (may fail outside fullscreen). */
export function tryLockLandscape() {
  const o = screen.orientation;
  if (!o || typeof o.lock !== "function") return Promise.resolve(false);
  return o
    .lock("landscape")
    .then(() => true)
    .catch(() => false);
}

/**
 * Full-screen “rotate to landscape” gate for phones in portrait.
 * Returns disposer.
 */
export function mountLandscapeGate() {
  let gate = document.getElementById("landscape-gate");
  if (!gate) {
    gate = document.createElement("div");
    gate.id = "landscape-gate";
    gate.className = "landscape-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-live", "polite");
    gate.innerHTML = `
      <div class="landscape-gate-inner">
        <div class="landscape-phone" aria-hidden="true"></div>
        <p class="landscape-gate-title">请横屏游玩</p>
        <p class="landscape-gate-body">将手机横过来，以获得更好的战斗与地图体验。</p>
      </div>
    `;
    document.body.appendChild(gate);
  }

  const sync = () => {
    const show = isPortraitMobile();
    gate.hidden = !show;
    document.documentElement.classList.toggle("force-landscape-hint", show);
    document.body.classList.toggle("is-portrait-blocked", show);
  };

  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", sync);
  if (screen.orientation) {
    screen.orientation.addEventListener("change", sync);
  }

  // Best-effort lock after first tap (iOS usually ignores; Android may accept).
  const onFirstGesture = () => {
    if (!isPortraitMobile()) tryLockLandscape();
    document.removeEventListener("pointerdown", onFirstGesture);
  };
  document.addEventListener("pointerdown", onFirstGesture, { passive: true });

  return () => {
    window.removeEventListener("resize", sync);
    window.removeEventListener("orientationchange", sync);
    document.removeEventListener("pointerdown", onFirstGesture);
  };
}
