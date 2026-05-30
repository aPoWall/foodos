/* foodos · voice — ru speechSynthesis wrapper */
let ruVoice = null, on = false;
function pick() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  ruVoice = vs.find(v => /ru/i.test(v.lang)) || vs.find(v => /Milena|Yuri|Google рус/i.test(v.name)) || null;
}
if ("speechSynthesis" in window) { speechSynthesis.onvoiceschanged = pick; pick(); }

export const voice = {
  get on() { return on; },
  set(v) { on = v; if (!v && "speechSynthesis" in window) speechSynthesis.cancel(); },
  toggle() { on = !on; if (!on && "speechSynthesis" in window) speechSynthesis.cancel(); return on; },
  say(text) {
    if (!on || !("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU"; if (ruVoice) u.voice = ruVoice; u.rate = .98;
    speechSynthesis.speak(u);
  },
};
