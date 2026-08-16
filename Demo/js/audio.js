/** Background music controller — starts after first user gesture. */

const BGM_SRC = "assets/audio/bgm.mp3";
const BGM_VOLUME = 0.32;

let audio = null;
let unlocked = false;
let muted = false;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = muted ? 0 : BGM_VOLUME;
  return audio;
}

export function initBgm() {
  ensureAudio();
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    playBgm();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playBgm() {
  const a = ensureAudio();
  a.volume = muted ? 0 : BGM_VOLUME;
  const p = a.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      /* autoplay blocked until gesture */
    });
  }
}

export function setBgmMuted(next) {
  muted = !!next;
  if (audio) audio.volume = muted ? 0 : BGM_VOLUME;
  try {
    localStorage.setItem("shadows_fall_bgm_muted", muted ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
  return muted;
}

export function isBgmMuted() {
  return muted;
}

export function loadBgmMutePref() {
  try {
    muted = localStorage.getItem("shadows_fall_bgm_muted") === "1";
  } catch (_) {
    muted = false;
  }
  if (audio) audio.volume = muted ? 0 : BGM_VOLUME;
}

export function mountBgmToggle(parent = document.body) {
  loadBgmMutePref();
  let btn = document.getElementById("bgm-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "bgm-toggle";
    btn.type = "button";
    btn.className = "bgm-toggle";
    parent.appendChild(btn);
  }
  const sync = () => {
    btn.textContent = muted ? "音乐：关" : "音乐：开";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  };
  sync();
  btn.onclick = () => {
    setBgmMuted(!muted);
    if (!muted) playBgm();
    sync();
  };
  return btn;
}
