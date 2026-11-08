/* foodos · voice — kitchen voice wrapper.
   Default path is ElevenLabs through same-origin Netlify function.
   If env is missing or the call fails, it falls back to speechSynthesis. */

const VKEY = "foodos:voice:on";
const PKEY = "foodos:voice:profile";
const DEFAULT_PROFILE = {
  provider: "elevenlabs",
  model: "eleven_v3",
  voice: "foodos stove voice",
  delivery: "low, rough, calm, precise",
};

let ruVoice = null;
let on = localStorage.getItem(VKEY) !== "false";
let currentAudio = null;
let last = { mode: "idle", provider: "elevenlabs", detail: "ready" };

function pick() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  ruVoice = vs.find(v => /ru/i.test(v.lang)) || vs.find(v => /Milena|Yuri|Google рус/i.test(v.name)) || null;
}
if ("speechSynthesis" in window) { speechSynthesis.onvoiceschanged = pick; pick(); }

export const voice = {
  get on() { return on; },
  get last() { return last; },
  get profile() { return getProfile(); },
  label() {
    if (!on) return "off";
    if (last.mode === "remote") return "eleven";
    if (last.mode === "fallback") return "local";
    return getProfile().provider === "elevenlabs" ? "eleven" : "local";
  },
  set(v) {
    on = !!v;
    localStorage.setItem(VKEY, on ? "true" : "false");
    if (!on) stopAll();
    emitStatus();
  },
  toggle() { this.set(!on); return on; },
  saveProfile(next) {
    const profile = { ...DEFAULT_PROFILE, ...(next || {}) };
    localStorage.setItem(PKEY, JSON.stringify(profile));
    emitStatus();
    return profile;
  },
  say(text, mood = "step") {
    if (!on || !text) return;
    const clean = String(text).replace(/\s+/g, " ").trim().slice(0, 700);
    tryRemote(clean, mood).then((played) => { if (!played) localSay(clean); });
  },
};

function getProfile() {
  try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(PKEY)) || {}) }; }
  catch { return DEFAULT_PROFILE; }
}

function stopAll() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function setLast(next) {
  last = { ...last, ...next };
  emitStatus();
}
function emitStatus() {
  window.dispatchEvent(new CustomEvent("foodos:voice-status", { detail: { on, last, profile: getProfile() } }));
}

async function tryRemote(text, mood) {
  if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) return false;
  const profile = getProfile();
  if (profile.provider !== "elevenlabs") return false;
  try {
    const res = await fetch("/.netlify/functions/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, mood, profile }),
    });
    if (!res.ok) {
      setLast({ mode: "fallback", provider: "local", detail: await res.text().catch(() => "remote failed") });
      return false;
    }
    const type = res.headers.get("content-type") || "";
    if (!/audio\//i.test(type)) {
      const detail = /json/i.test(type)
        ? (await res.json().catch(() => ({}))).error || "remote fallback"
        : await res.text().catch(() => "remote fallback");
      setLast({ mode: "fallback", provider: "local", detail });
      return false;
    }
    const blob = await res.blob();
    if (!blob.size) return false;
    stopAll();
    currentAudio = new Audio(URL.createObjectURL(blob));
    currentAudio.play().catch(() => {});
    setLast({ mode: "remote", provider: "elevenlabs", detail: profile.model || "eleven_v3" });
    return true;
  } catch (e) {
    setLast({ mode: "fallback", provider: "local", detail: e.message || "remote failed" });
    return false;
  }
}

function localSay(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  if (ruVoice) u.voice = ruVoice;
  u.rate = .92;
  u.pitch = .72;
  u.volume = .95;
  speechSynthesis.speak(u);
  setLast({ mode: "fallback", provider: "local", detail: ruVoice?.name || "speechSynthesis" });
}
