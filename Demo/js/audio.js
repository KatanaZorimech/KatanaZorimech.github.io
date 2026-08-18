/** Background music + synthesized combat SFX (Web Audio). */

const BGM_SRC = "assets/audio/bgm.mp3";
const BGM_VOLUME = 0.32;
const SFX_VOLUME = 0.28;

let audio = null;
let unlocked = false;
let muted = false;
let audioCtx = null;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = muted ? 0 : BGM_VOLUME;
  return audio;
}

function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function resumeAudioCtx() {
  const ctx = ensureAudioCtx();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function initBgm() {
  ensureAudio();
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    resumeAudioCtx();
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

/**
 * Synthesized one-shots.
 * @param {"playerAttack"|"enemyAttack"} kind
 */
export function playSfx(kind) {
  if (muted) return;
  const ctx = resumeAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = SFX_VOLUME;
  master.connect(ctx.destination);

  if (kind === "playerAttack") {
    // Bright psychic pulse — higher, shorter
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.18);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now);
    osc2.frequency.exponentialRampToValueAtTime(440, now + 0.08);
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc2.connect(gain2);
    gain2.connect(master);
    osc2.start(now);
    osc2.stop(now + 0.12);
    return;
  }

  if (kind === "enemyAttack") {
    // Heavy tear — lower, darker, slightly longer
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.75, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.25);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.3);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.35, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noise.connect(nGain);
    nGain.connect(master);
    noise.start(now);
    noise.stop(now + 0.09);
  }
}
