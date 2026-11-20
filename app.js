/* MoCA-inspired informal screening - v3
 * Self-contained, runs from file://. Everything lives inside this closure: nothing about the
 * current session's answers is exposed on window or written into input values / placeholders.
 * NOT the official MoCA. Not validated. Not diagnostic. */
(function () {
  "use strict";

  // Test hooks (only active if a test harness sets them BEFORE load; absent in normal use).
  const TS = Number(window.__MOCA_TIMESCALE) || 1;          // time scale for automated tests
  const DEBUG = window.__MOCA_DEBUG || null;

  const CANCEL = { cancelled: true };
  let runId = 0;
  let S = null;            // session state
  let clockTimer = null;

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  // touch devices (iPad): never pop the on-screen keyboard open by script
  const focusIt = (el) => { if (el && !(navigator.maxTouchPoints > 0) && !/iPad|iPhone|iPod/.test(navigator.userAgent)) el.focus(); };
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const rint = (lo, hi) => lo + rnd(hi - lo + 1);

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
    return e;
  }
  function sv(tag, props, ...kids) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (props) for (const [k, v] of Object.entries(props)) e.setAttribute(k, v);
    for (const k of kids) e.append(k);
    return e;
  }

  function sleep(ms) {
    const id = runId;
    return new Promise((res, rej) => setTimeout(() => (id === runId ? res() : rej(CANCEL)), ms * TS));
  }
  const btn = (label, cls) => h("button", { type: "button", class: "btn " + (cls || "") }, label);
  function click(b) { return new Promise((res) => b.addEventListener("click", () => res(), { once: true })); }

  // ---------- answer fields: hardened against autofill / history / spellcheck / hints ----------
  // - created fresh for every screen (so nothing carries over between sections or restarts)
  // - random, never-reused name/id (browsers key autofill history on name/id)
  // - autocomplete off, no placeholder, no value, no datalist, spellcheck/autocorrect/autocapitalize off
  function token() { return "q" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
  function field(multiline, opts) {
    opts = opts || {};
    const e = document.createElement(multiline ? "textarea" : "input");
    const id = token();
    e.name = id; e.id = id;
    if (!multiline) e.type = "text";
    const attrs = {
      autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: "false",
      "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other", "data-bwignore": "true",
      "aria-label": "Your answer", enterkeyhint: "done"
    };
    if (opts.numeric) attrs.inputmode = "numeric";
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.className = "input";
    e.value = "";
    return e;
  }
  function formOf(...kids) {
    return h("form", { autocomplete: "off", novalidate: true, onsubmit: (ev) => ev.preventDefault() }, ...kids);
  }
  function wipe(root) { // blank every field before removal (defence in depth)
    root.querySelectorAll("input,textarea").forEach((i) => { i.value = ""; });
  }


  // ---------- speech input (Web Speech API; typed fallback always kept) ----------
  const Speech = window.MocaSpeech;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function speechStatus() {
    if (location.protocol === "file:") return { ok: false, why: "file" };
    if (!SR) return { ok: false, why: "api" };
    if (window.isSecureContext === false) return { ok: false, why: "insecure" };
    return { ok: true };
  }
  const IS_IOS_EARLY = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const SPEECH_MSG = {
    file: IS_IOS_EARLY ? "Voice answers are off: this page was opened as a local file. Open the exam from its https:// web address (for example from the Home Screen icon) and typing still works meanwhile." : "Voice answers are off: this page was opened directly from a file (file://), where Chrome and Edge do not allow speech recognition. Close this tab and double-click start-exam.bat instead (it opens http://localhost:8765). You can keep going now by typing your answers.",
    api: IS_IOS_EARLY ? "Voice answers are off: speech recognition is not available in this browser. On iPad use Safari (iPadOS 14.5 or later) with Dictation turned on (Settings > General > Keyboard > Enable Dictation). You can keep going now by typing your answers." : "Voice answers are off: this browser does not support speech recognition. Use Chrome or Edge (opened through start-exam.bat). You can keep going now by typing your answers.",
    insecure: "Voice answers are off: speech recognition needs a secure page. Use start-exam.bat, which opens http://localhost:8765. You can keep going now by typing your answers.",
    "not-allowed": "The microphone is blocked. Click the lock/mic icon in the address bar, allow the microphone for this page, then try again. Typing still works.",
    "service-not-allowed": IS_IOS_EARLY ? "Speech recognition is not available. On iPad: Settings > General > Keyboard > turn on Enable Dictation (and Siri), then reload this page. Typing still works." : "Speech recognition is not allowed for this page. Use start-exam.bat (http://localhost:8765) in Chrome or Edge. Typing still works.",
    "audio-capture": "No microphone was found or it is in use by another app. Check your microphone. Typing still works.",
    network: "Speech recognition could not reach the browser's speech service (internet needed). Typing still works.",
    "language-not-supported": "English (US) speech recognition is not available in this browser. Typing still works."
  };
  const viaMic = new WeakSet();
  let activeRec = null;
  function showBanner(msg) {
    const b = $("speechBanner"); if (!b) return;
    if (msg) { b.textContent = msg; b.classList.remove("hidden"); } else b.classList.add("hidden");
  }
  function stopMic() { if (activeRec) { try { activeRec.stop(); } catch (_) { } activeRec = null; } }

  function makeRecognizer({ keepAlive, single, onUpdate, onState }) {
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = "", wantRun = false, fatal = false, sawFinal = false;
    r.onstart = () => onState("start");
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], t = (res[0] && res[0].transcript) || "";
        if (res.isFinal) { finalText += (finalText ? "\n" : "") + t.trim(); sawFinal = true; } else interim += t;
      }
      onUpdate(finalText, interim);
      if (single && sawFinal) { wantRun = false; try { r.stop(); } catch (_) { } }
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(e.error)) { fatal = true; wantRun = false; }
      onState("error", e.error);
    };
    r.onend = () => {
      if (wantRun && keepAlive && !fatal) { try { r.start(); return; } catch (_) { } }
      onState("end", sawFinal ? "heard" : "silent");
    };
    return {
      start() { wantRun = true; fatal = false; try { r.start(); } catch (_) { onState("error", "audio-capture"); } },
      stop() { wantRun = false; try { r.stop(); } catch (_) { } }
    };
  }

  // Mic button for one answer field. Transcripts are written into the same fresh, random-named,
  // no-autocomplete field the clinician/patient can also type in.
  function micControl(f, o) {
    o = o || {};
    const st = speechStatus();
    const status = h("span", { class: "mic-status small muted" });
    const b = h("button", { type: "button", class: "btn mic-btn", title: st.ok ? "Speak your answer" : "Voice input unavailable (see the notice at the top)" }, "\uD83C\uDFA4 Speak");
    if (!st.ok) { b.disabled = true; status.textContent = "voice unavailable, type instead"; return h("span", { class: "mic-ctl" }, b, status); }
    let rec = null, base = "";
    const setIdle = (msg) => { b.classList.remove("rec"); b.textContent = "\uD83C\uDFA4 Speak"; status.textContent = msg || ""; if (activeRec === rec) activeRec = null; rec = null; };
    b.addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      stopMic();
      base = o.append === false ? "" : (f.value && !/\s$/.test(f.value) ? f.value + " " : f.value);
      const myRec = rec = makeRecognizer({
        keepAlive: !!o.keepAlive, single: !!o.single,
        onUpdate: (fin, interim) => {
          const txt = (fin ? fin : "") + (interim ? (fin ? "\n" : "") + interim : "");
          const joined = txt.split("\n").join(o.joiner || " ");
          f.value = base + (o.convert ? o.convert(joined) : joined);
          viaMic.add(f);
        },
        onState: (kind, info) => {
          if (kind === "start") { b.classList.add("rec"); b.textContent = "\u23F9 Stop (listening)"; status.textContent = "listening\u2026"; showBanner(null); }
          else if (kind === "error") { setIdle(""); showBanner(SPEECH_MSG[info] || "Microphone error: " + info + ". Typing still works."); }
          else if (kind === "end") { setIdle(info === "silent" ? "nothing heard; try again or type" : ""); }
          if (o.onState) o.onState(kind, info);
        }
      });
      activeRec = myRec; rec.start();
    });
    return h("span", { class: "mic-ctl" }, b, status);
  }
  const withMic = (f, o) => h("div", { class: "micwrap" }, f, micControl(f, o));
  const numStr = (t) => { const n = Speech.spokenNumber(t); return n == null ? t.trim() : String(n); };


  // ---------- spoken stimuli (speechSynthesis; built into the browser, nothing leaves the page) ----------
  const TTSOK = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const tts = { voices: [], voice: null, rate: 0.9, listeners: [] };
  const voiceOn = () => TTSOK && !!S && !!S.settings.voiceOut;
  function bestVoice(vs) {
    const en = vs.filter((v) => /^en[-_]US$/i.test(v.lang));
    const pref = (list) => list.find((v) => v.localService && /samantha|alex|aaron|nicky|siri|ava|allison|zoe|google us english|microsoft (aria|jenny|guy|zira|david)/i.test(v.name)) || list.find((v) => v.default) || list.find((v) => v.localService) || list[0];
    if (en.length) return pref(en);
    const any = vs.filter((v) => /^en/i.test(v.lang));
    return any.length ? pref(any) : null;
  }
  function loadVoices() {
    if (!TTSOK) return;
    let vs = []; try { vs = speechSynthesis.getVoices() || []; } catch (_) { }
    if (!vs.length) return;
    tts.voices = vs;
    if (!tts.voice || !vs.includes(tts.voice)) tts.voice = bestVoice(vs);
    tts.listeners.forEach((f) => f());
  }
  if (TTSOK) {
    try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (_) { speechSynthesis.onvoiceschanged = loadVoices; }
    loadVoices();
    let tries = 0; const iv = setInterval(() => { loadVoices(); if (tts.voices.length || ++tries > 20) clearInterval(iv); }, 250); // Chrome/Android sometimes never fire voiceschanged
  }
  // iOS/Safari only allow speech after a user gesture: prime the engine silently on the first tap anywhere.
  let ttsUnlocked = false;
  function unlockTTS() {
    if (!TTSOK || ttsUnlocked) return; ttsUnlocked = true;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (_) { }
  }
  document.addEventListener("pointerdown", unlockTTS, true);
  document.addEventListener("click", unlockTTS, true);
  function cancelTTS() { tts.gen = (tts.gen || 0) + 1; if (TTSOK) { try { speechSynthesis.cancel(); } catch (_) { } } }
  function makeUtterance(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = tts.rate; u.pitch = 1; u.volume = 1;
    if (tts.voice) u.voice = tts.voice;
    return u;
  }
  function rsleep(realMs) { // real-time wait (already scaled by the caller), cancelled on restart
    const id = runId;
    return new Promise((res, rej) => setTimeout(() => (id === runId ? res() : rej(CANCEL)), Math.max(0, realMs)));
  }
  // Speak items one per `gap` ms (separate utterances, not one long sentence). Returns the ONSET time
  // (performance.now()) of each item: from the engine's own `start` event when it fires.
  async function speakSequence(items, o) {
    o = o || {};
    const gap = (o.gap || 1000) * TS, lead = (o.lead == null ? 500 : o.lead) * TS, say = o.say || String;
    stopMic(); cancelTTS();
    const starts = new Array(items.length); let failed = false;
    const gen = tts.gen;                      // a later cancelTTS() (Continue pressed, voice toggled...) aborts this sequence
    const t0 = performance.now() + lead;
    for (let i = 0; i < items.length; i++) {
      const wait = t0 + i * gap - performance.now();
      if (wait > 0) await rsleep(wait);
      if (tts.gen !== gen) return { starts, failed: false, aborted: true };
      starts[i] = performance.now();
      const u = makeUtterance(say(items[i]));
      u.onstart = () => { starts[i] = performance.now(); };
      u.onerror = (e) => { if (e && e.error && !/interrupted|canceled/.test(e.error)) failed = true; };
      speechSynthesis.speak(u);
      if (failed) break;
    }
    await rsleep(gap + (o.tail || 0) * TS);
    return { starts, failed, aborted: tts.gen !== gen };
  }
  async function speakOne(text) {
    stopMic(); cancelTTS();
    let failed = false, ended = false;
    const words = text.split(/\s+/).length;
    const u = makeUtterance(text);
    u.onend = () => { ended = true; }; u.onerror = (e) => { if (e && e.error && !/interrupted|canceled/.test(e.error)) { failed = true; ended = true; } };
    speechSynthesis.speak(u);
    const t0 = performance.now(), cap = (words * 700 + 2500) * TS;
    while (!ended && performance.now() - t0 < cap) await rsleep(40 * TS + 10);
    return { failed };
  }
  const listenScreen = (msg) => h("div", { class: "listen" }, h("div", { class: "listen-icon" }, "\uD83D\uDD0A"), h("div", null, msg || "Listen carefully\u2026"));
  const repNote = (n) => (n ? `; REPLAYED ${n}\u00d7 by examiner` : "");
  function bumpReplay(key) { S.replays[key] = (S.replays[key] || 0) + 1; return S.replays[key]; }

  // ---------- text utilities ----------
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const tokens = (s) => (s || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  function wordHit(w, toks) {
    w = w.toLowerCase();
    return toks.some((t) => t === w || t === w + "s" || (w.length >= 5 && lev(t, w) <= 1));
  }
  function normSentence(s) { return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  const digitsOf = (s) => (s || "").replace(/[^0-9]/g, "");

  // ---------- content pools (all original) ----------
  const WORD_CATS = [
    { cue: "a flower", words: ["tulip", "orchid", "poppy", "lily", "violet", "marigold"] },
    { cue: "a type of building", words: ["castle", "library", "barn", "lighthouse", "stadium", "cottage"] },
    { cue: "a kind of cloth", words: ["denim", "silk", "linen", "wool", "satin", "corduroy"] },
    { cue: "a color", words: ["orange", "purple", "silver", "yellow", "turquoise", "maroon"] },
    { cue: "a part of the body", words: ["elbow", "shoulder", "ankle", "wrist", "knee", "thumb"] },
    { cue: "a fruit", words: ["pear", "mango", "plum", "lemon", "cherry", "peach"] },
    { cue: "a tool", words: ["hammer", "wrench", "shovel", "chisel", "pliers", "saw"] },
    { cue: "a musical instrument", words: ["violin", "trumpet", "flute", "harp", "cello", "clarinet"] },
    { cue: "a piece of furniture", words: ["sofa", "dresser", "bench", "wardrobe", "stool", "desk"] },
    { cue: "a vehicle", words: ["tractor", "ferry", "canoe", "ambulance", "scooter", "trolley"] },
    { cue: "a vegetable", words: ["carrot", "onion", "celery", "radish", "spinach", "turnip"] },
    { cue: "a bird", words: ["sparrow", "falcon", "pelican", "robin", "parrot", "heron"] },
    { cue: "a sport", words: ["tennis", "hockey", "archery", "rowing", "boxing", "golf"] }
  ];
  function drawWordSets(nCore, nExt) {
    const cats = shuffle(WORD_CATS);
    const mk = (c) => { const w = pick(c.words); return { word: w, cue: c.cue, options: shuffle([w].concat(sample(c.words.filter((x) => x !== w), 2))) }; };
    return { core: cats.slice(0, nCore).map(mk), ext: cats.slice(nCore, nCore + nExt).map(mk) };
  }

  const SENTENCES = [
    "The lantern was lit only after the last boat had returned.",
    "Whenever the river rises, the farmers move their goats uphill.",
    "She promised to bring the blue umbrella if the rain continued.",
    "After the concert ended, the drummer carried every cable outside.",
    "The baker who lives next door sells bread only on weekdays.",
    "My neighbor said the parcel would arrive before the storm.",
    "Nobody noticed the missing key until the guests were leaving.",
    "The teacher handed out maps while the children waited quietly.",
    "He left the window open so that the cat could come home.",
    "Until the bridge reopens, the buses will use the longer road.",
    "The gardener thinks the roses bloom best near the stone wall.",
    "Every autumn, the villagers gather chestnuts under the tallest tree.",
    "The pilot announced that the flight would land an hour late.",
    "Because the shop was closed, we shared the sandwiches on the pier.",
    "The mechanic who repaired my bicycle refused to accept any payment.",
    "If the ferry is cancelled, the choir will rehearse in the barn."
  ];

  const FLUENCY_LETTERS = ["B", "C", "D", "F", "G", "H", "L", "M", "P", "R", "S", "T", "W"];

  const ANIMALS = [  // index matches window.MOCA_ART (neutral keys on purpose)
    { ok: ["elephant"] }, { ok: ["giraffe"] }, { ok: ["zebra"] }, { ok: ["owl"] }, { ok: ["kangaroo"] },
    { ok: ["hippo", "hippopotamus", "river horse"] }, { ok: ["tortoise", "turtle"] }, { ok: ["flamingo"] }, { ok: ["gorilla"] }
  ];

  const ABSTRACT_CORE = [
    { a: "violin", b: "drum", re: /instrument|music/ },
    { a: "bridge", b: "tunnel", re: /cross|pass|route|path|way|connect|travel|transport|get (over|through|across)|structure|road/ },
    { a: "candle", b: "lamp", re: /light|illuminat|bright/ },
    { a: "umbrella", b: "raincoat", re: /rain|dry|wet|weather|protect/ },
    { a: "newspaper", b: "radio", re: /news|media|inform|communicat|broadcast|report/ },
    { a: "fence", b: "wall", re: /barrier|divid|enclos|boundar|separat|protect|block/ },
    { a: "scale", b: "thermometer", re: /measur|instrument|gauge|tool|device/ },
    { a: "map", b: "compass", re: /navigat|direction|find|guid|way|orient/ },
    { a: "calendar", b: "clock", re: /time|schedul|date/ },
    { a: "poem", b: "painting", re: /art|creat|express|imagin/ },
    { a: "salt", b: "sugar", re: /season|flavou?r|food|ingredient|cook|taste|kitchen|crystal|spice/ },
    { a: "key", b: "password", re: /unlock|access|secur|open|lock|enter/ }
  ];
  const ABSTRACT_EXT = [
    { a: "freedom", b: "justice", re: /right|value|ideal|principle|virtue|moral|concept|democra|abstract|society/ },
    { a: "ripple", b: "echo", re: /wave|spread|reverb|propagat|travel|vibrat|bounce|repeat/ },
    { a: "treaty", b: "handshake", re: /agree|peace|connect|bond|trust|unite|commit|promise|deal/ },
    { a: "compass", b: "conscience", re: /guid|direction|navigat|steer/ },
    { a: "seed", b: "spark", re: /start|begin|origin|source|ignit|grow|cause/ },
    { a: "umpire", b: "judge", re: /decid|rule|referee|fair|authorit|impartial|officiat|verdict|arbitr/ }
  ];

  // ---------- session state ----------
  function newState() {
    const words = drawWordSets(5, 7);
    return {
      startedAt: null,
      settings: { extended: false, eduYears: null, label: "", voiceOut: false, voiceName: "", rate: 0.9 },
      items: [],
      times: {},
      drawings: {},
      memory: { core: words.core, ext: words.ext, trials: [], learnedAt: null, delayMs: null, cued: null, extLearnedAt: null },
      meta: {},
      overrides: {},
      replays: {},
      eduAdj: null,
      notes: ""
    };
  }
  function addItem(it) { S.items.push(Object.assign({ auto: null, detail: "", verify: false, manual: false }, it)); }

  // ---------- chrome (header, sidebar, progress) ----------
  const DOMAINS = ["Visuospatial / Executive", "Naming", "Memory", "Attention", "Language", "Abstraction", "Delayed recall", "Orientation"];
  const view = $("content");
  function renderSteps(current, extended, doneSet) {
    const list = DOMAINS.concat(extended ? ["Extended challenge"] : []);
    $("sectionList").replaceChildren(...list.map((d) => h("li", { class: (d === current ? "active " : "") + (doneSet.has(d) ? "done" : "") }, d)));
  }
  function fmt(ms) { const t = Math.floor(ms / 1000); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(() => { if (S && S.startedAt) $("elapsed").textContent = fmt(Date.now() - S.startedAt); }, 500);
  }
  function instr(text) { return h("p", { class: "instructions" }, text); }

  // ---------- reusable tasks ----------
  async function showSequence(items, { onMs, offMs, cls }) {
    const box = h("div", { class: "stimulus " + (cls || "") });
    view.append(box);
    for (const it of items) {
      box.textContent = it; await sleep(onMs);
      box.textContent = ""; await sleep(offMs);
    }
    box.remove();
  }


  // Present a list one item at a time: read aloud when voice mode is on (items are then NEVER shown),
  // otherwise show on screen. Returns { voice, replay } where replay() re-reads (logged) or is null.
  async function presentList({ key, items, say, gap, intro, playLabel, visualLabel, visual }) {
    const go = btn(voiceOn() ? playLabel : visualLabel, "primary");
    view.replaceChildren(instr(intro), h("div", { class: "actions" }, go));
    await click(go);                       // user gesture: required by iOS/Safari for speech
    let voice = voiceOn();
    if (voice) {
      view.replaceChildren(listenScreen());
      const r = await speakSequence(items, { gap, say });
      if (r.failed) { voice = false; S.meta.ttsFailed = true; view.replaceChildren(h("div", { class: "warn-box" }, "The browser could not speak. Showing the items on screen instead.")); await sleep(1200); }
    }
    if (!voice) {
      view.replaceChildren(instr("Remember these..."));
      await sleep(700);
      await showSequence(items.map((x) => visual.fmt(x)), { onMs: visual.onMs, offMs: visual.offMs, cls: visual.cls });
    }
    return { voice, replay: voice ? async () => { const n = bumpReplay(key); await speakSequence(items, { gap, say }); return n; } : null };
  }

  async function askText({ prompt, multiline, numeric, button, note, mic, replay }) {
    const f = field(multiline, { numeric });
    const go = btn(button || "Continue", "primary");
    let replayRow = null;
    if (replay) {
      const rb = btn("\u21BB Replay (examiner; logged)"); const rs = h("span", { class: "small muted" });
      rb.addEventListener("click", async () => { rb.disabled = true; rs.textContent = "playing\u2026"; try { const n = await replay(); rs.textContent = `replayed ${n}\u00d7 (recorded in the results)`; } catch (e) { if (e !== CANCEL) throw e; } finally { rb.disabled = false; } });
      replayRow = h("div", { class: "inline-actions" }, rb, rs);
    }
    const form = formOf(instr(prompt), note ? h("p", { class: "small muted" }, note) : null, mic ? withMic(f, mic) : f, replayRow, h("div", { class: "actions" }, go));
    form.addEventListener("submit", () => { if (!multiline) go.click(); });
    view.replaceChildren(form);
    focusIt(f);
    await click(go);
    stopMic(); cancelTTS();
    const v = f.value; const spoken = viaMic.has(f); wipe(view);
    askText.lastSpoken = spoken;
    return v;
  }

  function layout(count, minD) {
    for (let d = minD; d > 40; d -= 8) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const pts = [];
        let tries = 0;
        while (pts.length < count && tries < 3000) {
          tries++;
          const p = { x: rint(45, 755), y: rint(45, 455) };
          if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= d)) pts.push(p);
        }
        if (pts.length === count) return pts;
      }
    }
    return Array.from({ length: count }, (_, i) => ({ x: 60 + (i % 8) * 90, y: 100 + Math.floor(i / 8) * 200 }));
  }

  function trailTask({ pairs, minD, prompt }) {
    return new Promise((resolve) => {
      const seq = [];
      for (let i = 1; i <= pairs; i++) { seq.push(String(i)); seq.push(String.fromCharCode(64 + i)); }
      const pts = layout(seq.length, minD);
      const svg = sv("svg", { viewBox: "0 0 800 500", class: "trail", "touch-action": "manipulation" });
      const lines = sv("g"); svg.append(lines);
      let next = 0, errors = 0, t0 = null;
      const done = (completed) => { resolve({ completed, errors, ms: t0 ? Date.now() - t0 : 0, reached: next, total: seq.length }); };
      const giveUp = btn("I can't continue");
      giveUp.addEventListener("click", () => done(false), { once: true });
      seq.forEach((lab, i) => {
        const g = sv("g", { class: "node" });
        g.append(sv("circle", { cx: pts[i].x, cy: pts[i].y, r: 27 }));
        const t = sv("text", { x: pts[i].x, y: pts[i].y }); t.textContent = lab; g.append(t);
        g.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          if (t0 == null) t0 = Date.now();
          if (i < next) return;
          if (i === next) {
            if (next > 0) lines.append(sv("line", { x1: pts[next - 1].x, y1: pts[next - 1].y, x2: pts[next].x, y2: pts[next].y, stroke: "#111", "stroke-width": 3, "stroke-linecap": "round" }));
            g.classList.add("ok"); next++;
            if (next === seq.length) done(true);
          } else {
            errors++; g.classList.add("bad"); setTimeout(() => g.classList.remove("bad"), 450);
          }
        });
        svg.append(g);
      });
      view.replaceChildren(instr(prompt), svg, h("div", { class: "inline-actions" }, giveUp));
    });
  }

  function drawPad(w, hgt) {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)); // crisp lines on Retina/iPad, bounded size
    const c = h("canvas", { width: Math.round(w * dpr), height: Math.round(hgt * dpr), class: "pad" });
    const ctx = c.getContext("2d");
    let strokes = [], cur = null;
    const base = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, hgt); ctx.strokeStyle = "#111"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; };
    const redraw = () => {
      base();
      for (const s of strokes) { ctx.beginPath(); s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y); ctx.stroke(); }
    };
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (w / r.width), y: (e.clientY - r.top) * (hgt / r.height) }; };
    base();
    c.addEventListener("pointerdown", (e) => { try { c.setPointerCapture(e.pointerId); } catch (_) { } cur = [pos(e)]; strokes.push(cur); e.preventDefault(); });
    c.addEventListener("pointermove", (e) => {
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];   // smoother Apple Pencil / finger strokes
      for (const ev of (evs.length ? evs : [e])) { const p = pos(ev), q = cur[cur.length - 1]; cur.push(p); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      e.preventDefault();
    });
    const up = () => { if (cur && cur.length === 1) redraw(); cur = null; };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up); c.addEventListener("pointerleave", up);
    // Older Safari: stop the page scrolling / zooming while drawing
    ["touchstart", "touchmove", "touchend"].forEach((n) => c.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    return {
      el: c, strokes: () => strokes.length, png: () => c.toDataURL("image/png"),
      undo: () => { strokes.pop(); redraw(); }, clear: () => { strokes = []; redraw(); }
    };
  }

  function cubeFigure() {
    const dirs = [[62, -48], [-62, -48], [58, 52], [-58, 52]];
    const [dx, dy] = pick(dirs);
    const sz = 110;
    const x0 = (300 - (sz + Math.abs(dx))) / 2 + (dx < 0 ? -dx : 0), y0 = (300 - (sz + Math.abs(dy))) / 2 + (dy < 0 ? -dy : 0);
    const f = [[x0, y0], [x0 + sz, y0], [x0 + sz, y0 + sz], [x0, y0 + sz]];
    const b = f.map(([x, y]) => [x + dx, y + dy]);
    const svg = sv("svg", { viewBox: "0 0 300 300", class: "fig" });
    const L = (p, q) => svg.append(sv("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: "#111", "stroke-width": 3, "stroke-linecap": "round" }));
    for (let i = 0; i < 4; i++) { L(f[i], f[(i + 1) % 4]); L(b[i], b[(i + 1) % 4]); L(f[i], b[i]); }
    return svg;
  }

  function clockPrompt() {
    const H = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
    let hr, mn;
    do { hr = rint(1, 12); mn = pick([10, 20, 25, 35, 40, 50, 10, 50]); } while ((hr === 11 && mn === 10));
    const cur = H[hr % 12], nextH = H[(hr + 1) % 12];
    const txt = { 10: "ten past " + cur, 20: "twenty past " + cur, 25: "twenty-five past " + cur, 35: "twenty-five to " + nextH, 40: "twenty to " + nextH, 50: "ten to " + nextH }[mn];
    return { hr, mn, txt };
  }

  async function digitSpan(n, backward, label) {
    const digs = [];
    while (digs.length < n) {
      const d = rnd(10);
      const l = digs.length;
      if (l && digs[l - 1] === d) continue;
      if (l >= 2 && Math.abs(digs[l - 1] - digs[l - 2]) === 1 && Math.abs(d - digs[l - 1]) === 1 && (d - digs[l - 1]) === (digs[l - 1] - digs[l - 2])) continue; // no easy runs
      digs.push(d);
    }
    const key = "digits-" + (backward ? "bwd" : "fwd") + n;
    const p = await presentList({
      key, items: digs, say: Speech.digitName, gap: 1000,
      intro: backward
        ? "Numbers will be read aloud (or shown) one at a time. Afterwards, type or say them in REVERSE order (last number first)."
        : "Numbers will be read aloud (or shown) one at a time. Afterwards, type or say them in the SAME order.",
      playLabel: "\u25B6 Play the numbers", visualLabel: "Start",
      visual: { fmt: String, onMs: 750, offMs: 250, cls: "num" }
    });
    const ans = digitsOf(await askText({ prompt: backward ? "Type or say the numbers in REVERSE order." : "Type or say the numbers in the SAME order.", numeric: true, mic: { convert: Speech.spokenDigits, append: false }, replay: p.replay }));
    const want = (backward ? digs.slice().reverse() : digs).join("");
    return { ok: ans === want, len: n, answered: ans, shown: digs.join(""), spoken: p.voice, replays: S.replays[key] || 0 };
  }

  async function serialSubtraction({ start, step, count, label }) {
    const answers = [];
    for (let i = 0; i < count; i++) {
      const v = await askText({
        prompt: i === 0 ? `Start at ${start} and subtract ${step}. Type or say your answer.` : `Subtract ${step} again from your last answer. Type or say the new answer.`,
        numeric: true, button: "Next", mic: { convert: numStr, single: true, append: false }
      });
      answers.push(v.trim() === "" ? null : parseInt(v.replace(/[^0-9\-]/g, ""), 10));
    }
    let correct = 0, prev = start;
    for (const a of answers) {
      if (a != null && !Number.isNaN(a) && a === prev - step) correct++;
      prev = a != null && !Number.isNaN(a) ? a : prev - step;
    }
    const score = correct >= 4 ? 3 : correct >= 2 ? 2 : correct === 1 ? 1 : 0;
    return { start, step, answers, correct, score };
  }

  // ---------- sections ----------
  function buildPlan() {
    const P = [];
    const add = (domain, title, run) => P.push({ domain, title, run });

    add("Visuospatial / Executive", "Connect in order", async () => {
      const r = await trailTask({ pairs: 5, minD: 120, prompt: "Tap (or click) the circles in ascending order, alternating between numbers and letters: start at 1, then go to the first letter, then to 2, and so on. An error counts if you press the wrong circle." });
      addItem({ domain: "Visuospatial / Executive", id: "trail", label: "Alternating trail", max: 1, auto: r.completed && r.errors === 0 ? 1 : 0, detail: `completed=${r.completed}, errors=${r.errors}, time=${(r.ms / 1000).toFixed(1)}s` });
    });

    add("Visuospatial / Executive", "Copy the figure", async () => {
      const pad = drawPad(700, 440); const fig = cubeFigure();
      const done = btn("Done", "primary");
      const u = btn("Undo stroke"); u.onclick = pad.undo; const c = btn("Clear"); c.onclick = pad.clear;
      view.replaceChildren(instr("Copy this drawing as accurately as you can in the box below (use a stylus, finger, or mouse). The model stays visible while you draw."), fig, h("div", { class: "toolbar" }, u, c), pad.el, h("div", { class: "actions" }, done));
      await click(done);
      S.drawings.cube = pad.png();
      addItem({ domain: "Visuospatial / Executive", id: "cube", label: "Cube copy (3-D, all edges, parallel, equal)", max: 1, manual: true, detail: `strokes=${pad.strokes()}` });
    });

    add("Visuospatial / Executive", "Draw a clock", async () => {
      const t = clockPrompt(); S.meta.clockTime = t.txt;
      const pad = drawPad(600, 600); const done = btn("Done", "primary");
      const u = btn("Undo stroke"); u.onclick = pad.undo; const c = btn("Clear"); c.onclick = pad.clear;
      view.replaceChildren(instr(`Draw a clock face. Put in all the numbers and set the hands to show ${t.txt}.`), h("div", { class: "toolbar" }, u, c), pad.el, h("div", { class: "actions" }, done));
      await click(done);
      S.drawings.clock = pad.png();
      addItem({ domain: "Visuospatial / Executive", id: "clockC", label: "Clock contour (round face)", max: 1, manual: true, detail: `strokes=${pad.strokes()}` });
      addItem({ domain: "Visuospatial / Executive", id: "clockN", label: "Clock numbers (all 12, correct order and position)", max: 1, manual: true });
      addItem({ domain: "Visuospatial / Executive", id: "clockH", label: `Clock hands (show ${t.txt}; hour hand shorter)`, max: 1, manual: true });
    });

    add("Naming", "Naming", async () => {
      const idx = sample(ANIMALS.map((_, i) => i), 3);
      const fields = idx.map(() => field(false));
      const go = btn("Continue", "primary");
      const grid = h("div", { class: "naming-grid" }, idx.map((ai, k) => h("figure", null, h("img", { src: window.MOCA_ART[ai], alt: "" }), withMic(fields[k], { single: true, append: false }))));
      view.replaceChildren(formOf(instr("Type or say the name of each animal."), grid, h("div", { class: "actions" }, go)));
      focusIt(fields[0]);
      await click(go); stopMic();
      const NFILL = new Set(["a", "an", "the", "it", "its", "is", "that", "this", "looks", "like", "i", "think", "thats", "s", "animal", "um", "uh", "picture", "of", "there", "here", "was"]);
      idx.forEach((ai, k) => {
        const ans = tokens(fields[k].value).filter((t) => !NFILL.has(t)).join(" ");
        const ok = ANIMALS[ai].ok.some((w) => ans === w || (w.length >= 6 && lev(ans, w) <= 1));
        addItem({ domain: "Naming", id: "name" + k, label: "Animal " + (k + 1), max: 1, auto: ok ? 1 : 0, detail: `typed: "${fields[k].value.trim()}"; expected: ${ANIMALS[ai].ok[0]}`, verify: !ok && ans.length > 0 });
      });
      wipe(view);
    });

    const memTrial = async (n) => {
      const key = "mem" + n;
      const p = await presentList({
        key, items: S.memory.core.map((m) => m.word), say: String, gap: 1000,
        intro: n === 1
          ? "Memory task. Words will be read aloud (or shown) one at a time. Try to remember them; you will say or type them right away and you will be asked for them again later. Order does not matter."
          : "Here are the same words again, one at a time. Try to remember them; you will be asked for them again later in the test.",
        playLabel: "\u25B6 Play the words", visualLabel: "Show the words",
        visual: { fmt: (w) => w.toUpperCase(), onMs: 1900, offMs: 300, cls: "word" }
      });
      const v = await askText({ prompt: "Type or say all the words you can remember, in any order.", multiline: true, mic: { append: true }, replay: p.replay });
      const toks = tokens(v);
      const hits = S.memory.core.filter((m) => wordHit(m.word, toks)).length;
      S.memory.trials.push({ trial: n, recalled: hits, readAloud: p.voice, replays: S.replays[key] || 0 });
      if (n === 2) S.memory.learnedAt = Date.now();
    };
    add("Memory", "Learning words: trial 1", () => memTrial(1));
    add("Memory", "Learning words: trial 2", () => memTrial(2));

    add("Attention", "Digits forward", async () => {
      const r = await digitSpan(5, false);
      addItem({ domain: "Attention", id: "dfwd", label: "Forward digit span (5)", max: 1, auto: r.ok ? 1 : 0, detail: `answer ${r.answered || "-"}${r.spoken ? "; read aloud" : ""}${repNote(r.replays)}`, verify: !!r.replays });
    });
    add("Attention", "Digits backward", async () => {
      const r = await digitSpan(3, true);
      addItem({ domain: "Attention", id: "dbwd", label: "Backward digit span (3)", max: 1, auto: r.ok ? 1 : 0, detail: `answer ${r.answered || "-"}${r.spoken ? "; read aloud" : ""}${repNote(r.replays)}`, verify: !!r.replays });
    });
    add("Attention", "Letter tapping", async () => {
      const targets = ["A", "E", "K", "L", "T", "M", "R", "D"];
      const N = 30, nT = 9, WINDOW = 1500, GAP = 1000;
      const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      let attempts = 0, res = null;
      for (;;) {
        attempts++;
        const target = pick(targets);
        const letters = abc.filter((x) => x !== target);
        let isT;
        for (;;) { // nT target positions, no run longer than 2
          const pos = new Set(); while (pos.size < nT) pos.add(rint(2, N - 1));
          isT = Array.from({ length: N }, (_, i) => pos.has(i));
          if (!isT.some((v, i) => v && isT[i + 1] && isT[i + 2])) break;
        }
        const seq = isT.map((t) => (t ? target : pick(letters)));
        let voice = voiceOn();
        const go = btn(voice ? "\u25B6 Start (letters are read aloud)" : "Start", "primary");
        view.replaceChildren(instr(`${voice ? "Letters will be read aloud" : "Letters will appear"}, one per second. Tap the big TAP button (or press the space bar) every time you ${voice ? "hear" : "see"} the letter ${target}. Do not tap for any other letter.`), h("div", { class: "actions" }, go));
        await click(go);                         // user gesture (iOS needs this before speech)
        const tap = btn("TAP", "tapbtn"); tap.className = "tapbtn";
        const box = h("div", { class: "stimulus" });
        const taps = []; let live = false;
        const onTap = () => { if (live) taps.push(performance.now()); };
        const onKey = (e) => { if (e.code === "Space") { e.preventDefault(); onTap(); } };
        tap.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(); });
        window.addEventListener("keydown", onKey);
        let starts = new Array(N);
        try {
          if (voice) {
            view.replaceChildren(listenScreen(`Listen for the letter ${target}. Tap whenever you hear it.`), tap);
            live = true;
            const r = await speakSequence(seq, { gap: GAP, lead: 700, say: Speech.letterSay, tail: 700 });
            starts = r.starts;
            if (r.failed) { voice = false; S.meta.ttsFailed = true; live = false; taps.length = 0; }
          }
          if (!voice) {
            view.replaceChildren(h("div", { class: "warn-box", style: S.meta.ttsFailed ? "" : "display:none" }, "The browser could not speak, so the letters are shown on screen."), box, tap);
            live = true;
            await sleep(800);
            for (let i = 0; i < N; i++) { starts[i] = performance.now(); box.textContent = seq[i]; await sleep(700); box.textContent = ""; await sleep(300); }
            await sleep(700);
          }
        } finally { live = false; window.removeEventListener("keydown", onKey); }
        const sc = Speech.scoreVigilance(starts, isT, taps, WINDOW * TS, 700 * TS);
        const t0 = starts[0];
        res = { target, voice, sc, attempts, data: { target, mode: voice ? "spoken" : "visual", onsetsMs: starts.map((x) => Math.round((x - t0) / TS)), tapsMs: taps.map((x) => Math.round((x - t0) / TS)), isTarget: isT.map((x) => (x ? 1 : 0)), windowMs: WINDOW } };
        // examiner may repeat the whole task (logged); the LAST attempt is what is scored
        const again = btn("\u21BB Repeat this task (examiner; logged; new random letters)"), next = btn("Continue", "primary");
        view.replaceChildren(instr("Letter task finished."), h("div", { class: "actions" }, next, again));
        const choice = await Promise.race([click(next).then(() => "next"), click(again).then(() => "again")]);
        if (choice === "next") break;
        S.replays["letters"] = (S.replays["letters"] || 0) + 1;
      }
      const sc = res.sc, rep = S.replays["letters"] || 0;
      addItem({ domain: "Attention", id: "letters", label: "Letter tapping (\u22641 error)", max: 1, auto: sc.point, verify: !!rep, data: res.data,
        detail: `target ${res.target} (${res.voice ? "read aloud" : "on screen"}); ${sc.targets} targets: ${sc.hits} hit, ${sc.misses} missed, ${sc.falseTaps} false taps${sc.duplicates ? ", " + sc.duplicates + " double-tap ignored" : ""}; tap window 1.5 s after each letter starts${repNote(rep)}${rep ? " (last attempt scored)" : ""}` });
    });
    add("Attention", "Serial subtraction", async () => {
      const r = await serialSubtraction({ start: rint(92, 129), step: 7, count: 5 });
      addItem({ domain: "Attention", id: "serial", label: "Serial 7s (4-5 correct=3, 2-3=2, 1=1)", max: 3, auto: r.score, detail: `start ${r.start}; answers ${r.answers.map((a) => (a == null ? "-" : a)).join(", ")}; ${r.correct}/5 correct` });
    });

    const sentenceSec = (k) => async () => {
      if (!S.meta.sent) S.meta.sent = sample(SENTENCES, 2);
      const s = S.meta.sent[k];
      const key = "sent" + k;
      let voice = voiceOn(), replay = null;
      const go = btn(voice ? "\u25B6 Play the sentence" : "Show sentence", "primary");
      view.replaceChildren(instr(`A sentence will be ${voice ? "read aloud" : "shown briefly"}${voice ? "" : " and then disappear"}. Afterwards, type or say it exactly as you remember it.`), h("div", { class: "actions" }, go));
      await click(go);                         // user gesture (iOS)
      if (voice) {
        view.replaceChildren(listenScreen());
        const r = await speakOne(s);
        if (r.failed) { voice = false; S.meta.ttsFailed = true; }
        else replay = async () => { const n = bumpReplay(key); await speakOne(s); return n; };
      }
      if (!voice) {
        const box = h("div", { class: "stimulus sentence" }, s);
        view.replaceChildren(box);
        await sleep(Math.max(4500, s.split(" ").length * 480));
        box.remove();
      }
      const v = await askText({ prompt: "Type or say the sentence exactly as you remember it.", multiline: true, mic: { append: false }, replay });
      const spoken = askText.lastSpoken;
      const wm = Speech.wordMatch(v, s);
      addItem({ domain: "Language", id: "sent" + k, label: "Sentence repetition " + (k + 1), max: 1, auto: wm.exact ? 1 : 0, detail: `${spoken ? "spoken" : "typed"}: "${v.trim()}"; word match ${wm.matched}/${wm.total}${wm.missing.length ? "; missing: " + wm.missing.join(" ") : ""}${wm.extra.length ? "; extra: " + wm.extra.join(" ") : ""}${voice ? "; read aloud" : ""}${repNote(S.replays[key])}`, verify: !wm.exact || spoken || !!S.replays[key] });
    };
    add("Language", "Sentence repetition 1", sentenceSec(0));
    add("Language", "Sentence repetition 2", sentenceSec(1));

    add("Language", "Verbal fluency", async () => {
      const L = pick(FLUENCY_LETTERS);
      const stt = speechStatus();
      const go = btn(stt.ok ? "Start (microphone and 60-second timer start together)" : "Start 60 seconds", "primary");
      view.replaceChildren(instr(`You will have 60 seconds to ${stt.ok ? "say" : "type"} as many words as you can that begin with the letter ${L}. Do not use names of people or places, numbers, or the same word with a different ending (e.g. run, runs, running).${stt.ok ? " Speak clearly; your words will appear on screen as you say them. The first time, the browser may ask for permission to use the microphone: click Allow before you start the timer (use the microphone check on the start page)." : " Separate words with commas, spaces or new lines."}`), h("div", { class: "actions" }, go));
      await click(go);
      const f = field(true); f.style.minHeight = "120px";
      const tf = field(true); tf.readOnly = true; tf.style.minHeight = "140px"; tf.setAttribute("aria-label", "Live transcript");
      const clock = h("div", { class: "bigclock" }, "1:00");
      const fin = btn("I'm finished", "primary");
      const live = h("span", { class: "mic-status small muted" });
      let micEnded = null, micOn = false;
      const endedP = new Promise((r) => { micEnded = r; });
      let rec = null;
      if (stt.ok) {
        stopMic();
        rec = makeRecognizer({
          keepAlive: true, single: false,
          onUpdate: (fin2, interim) => { tf.value = (fin2 ? fin2 : "") + (interim ? (fin2 ? "\n" : "") + interim : ""); viaMic.add(tf); },
          onState: (kind, info) => {
            if (kind === "start") { micOn = true; live.textContent = "\uD83C\uDFA4 listening\u2026"; showBanner(null); }
            else if (kind === "error") { micOn = false; live.textContent = "microphone problem: you can type instead"; showBanner(SPEECH_MSG[info] || "Microphone error: " + info + ". Typing still works."); }
            else if (kind === "end") { micOn = false; micEnded(); }
          }
        });
        activeRec = rec;
      } else micEnded();
      view.replaceChildren(formOf(instr(`Words that begin with ${L}`), clock,
        stt.ok ? h("div", { class: "field-row" }, h("label", null, "Live transcript (from the microphone)"), tf, live) : null,
        h("div", { class: "field-row" }, h("label", null, stt.ok ? "Or type words here (typing works too)" : "Type your words here"), f),
        h("div", { class: "actions" }, fin)));
      const t0 = Date.now(); let stopped = false;
      fin.addEventListener("click", () => { stopped = true; }, { once: true });
      if (rec) rec.start();
      if (!stt.ok) focusIt(f);
      const id = runId;
      await new Promise((res) => {
        const iv = setInterval(() => {
          if (id !== runId) { clearInterval(iv); return; }
          const left = 60 - (Date.now() - t0) / 1000 / TS;
          clock.textContent = fmt(Math.max(0, left) * 1000);
          if (left <= 0 || stopped) { clearInterval(iv); res(); }
        }, 100);
      });
      clock.textContent = "0:00";
      if (rec) { rec.stop(); await Promise.race([endedP, new Promise((r) => setTimeout(r, 1500))]); activeRec = null; }
      f.readOnly = true; live.textContent = "";
      const raw = [tf.value, f.value].filter((x) => x.trim()).join("\n");
      const usedMic = tf.value.trim() !== "", usedType = f.value.trim() !== "";
      wipe(view);
      S.meta.fluencyLetter = L;

      // Clinician review: struck chips are not counted
      const ex = Speech.extractFluency(raw, L);
      const chips = ex.chips;
      const list = h("div", { class: "chips" });
      const countEl = h("div", { class: "chipcount" });
      const render = () => {
        list.replaceChildren(...chips.map((c) => h("button", {
          type: "button", class: "chip" + (c.struck ? " struck" : "") + (c.flags.length ? " flagged" : ""),
          title: (c.flags.join("; ") || "valid") + " \u2013 click to " + (c.struck ? "restore" : "strike"),
          onclick: () => { c.struck = !c.struck; render(); }
        }, c.word, c.flags.length ? h("span", { class: "chipflag" }, " \u26A0") : null)));
        if (!chips.length) list.append(h("span", { class: "muted small" }, "No words beginning with " + L + " were detected."));
        const n = chips.filter((c) => !c.struck).length;
        countEl.textContent = `${n} valid word${n === 1 ? "" : "s"} (threshold 11): ${n >= 11 ? "meets the 1-point criterion" : "does not meet the criterion"}`;
        countEl.className = "chipcount " + (n >= 11 ? "ok" : "no");
      };
      const addF = field(false); const addB = btn("Add word");
      const addMsg = h("span", { class: "small muted" });
      addB.addEventListener("click", () => {
        const w = addF.value.toLowerCase().replace(/[^a-z]/g, "");
        if (w.length < 2 || w[0] !== L.toLowerCase()) { addMsg.textContent = `Must start with ${L}.`; return; }
        if (chips.some((c) => c.word === w)) { addMsg.textContent = "Already in the list."; return; }
        chips.push({ word: w, flags: ["added by clinician"], struck: false }); addF.value = ""; addMsg.textContent = ""; render();
      });
      addF.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addB.click(); } });
      const fluGo = btn("Continue", "primary");
      const transcript = h("details", null, h("summary", { class: "small muted" }, "Show raw transcript"), h("div", { class: "result-box small", style: "white-space:pre-wrap" }, raw || "(empty)"));
      view.replaceChildren(
        instr(`Time is up. Words beginning with ${L} are listed below. Click a word to strike it out (or restore it) before scoring: names, places, numbers, and the same word with a different ending do not count. \u26A0 marks a word to check; struck chips were struck automatically (filler words, known names/places, same-stem repeats).`),
        list, countEl,
        formOf(h("div", { class: "inline-actions" }, h("span", { class: "small muted" }, "Missed a word the microphone did not hear?"), addF, addB, addMsg)),
        transcript, h("div", { class: "actions" }, fluGo));
      render();
      await click(fluGo);
      wipe(view);
      const valid = chips.filter((c) => !c.struck).map((c) => c.word);
      const struck = chips.filter((c) => c.struck).map((c) => c.word + " [" + (c.flags[0] || "struck by clinician") + "]");
      addItem({ domain: "Language", id: "fluency", label: `Fluency: \u226511 valid ${L}-words in 60 s`, max: 1, auto: valid.length >= 11 ? 1 : 0, detail: `letter ${L}; ${valid.length} valid: ${valid.join(", ")}${struck.length ? "; struck: " + struck.join(", ") : ""}${ex.duplicates ? "; repeated words ignored: " + ex.duplicates : ""}${usedMic && usedType ? "; spoken + typed" : usedMic ? "; spoken" : "; typed"}`, verify: true });
    });

    add("Abstraction", "Similarities", async () => {
      const pairs = sample(ABSTRACT_CORE, 2);
      const fs = pairs.map(() => field(false));
      const go = btn("Continue", "primary");
      view.replaceChildren(formOf(instr("In what way are the two things alike? Type or say a short answer for each."),
        ...pairs.map((p, i) => h("div", { class: "field-row" }, h("label", null, `${p.a} and ${p.b}`), withMic(fs[i], { append: false }))), h("div", { class: "actions" }, go)));
      focusIt(fs[0]); await click(go); stopMic();
      pairs.forEach((p, i) => {
        const ans = fs[i].value.trim().toLowerCase();
        addItem({ domain: "Abstraction", id: "abs" + i, label: `Abstraction: ${p.a} / ${p.b}`, max: 1, auto: p.re.test(ans) ? 1 : 0, detail: `typed: "${fs[i].value.trim()}"`, verify: true });
      });
      wipe(view);
    });

    const recallSec = async (list, domain, idPrefix, maxLabel, learnedAt, extended) => {
      const v = await askText({ prompt: extended ? "Type or say the extra list of words shown earlier in the extended section (any order)." : "Type or say the words you were asked to remember earlier. Any order.", multiline: true, mic: { append: true } });
      const toks = tokens(v);
      const missed = [];
      let hits = 0;
      list.forEach((m) => { if (wordHit(m.word, toks)) hits++; else missed.push(m); });
      const delay = Date.now() - learnedAt;
      addItem({ domain, id: idPrefix, label: maxLabel, max: list.length, auto: hits, detail: `recalled ${hits}/${list.length} uncued; delay ~${fmt(delay)}; typed: "${v.trim()}"`, verify: true });
      return { missed, delay };
    };

    add("Delayed recall", "Delayed recall", async () => {
      const { missed, delay } = await recallSec(S.memory.core, "Delayed recall", "recall", "Uncued recall of 5 words", S.memory.learnedAt);
      S.memory.delayMs = delay;
      // Unscored cues (recorded for the clinician only)
      const cued = { category: 0, choice: 0, missed: missed.length };
      if (missed.length) {
        const fs = missed.map(() => field(false));
        const go = btn("Continue", "primary");
        view.replaceChildren(formOf(instr("Hint round (not scored). For each word you did not recall, a category hint is given. Type the word if it comes to mind, or leave blank."),
          ...missed.map((m, i) => h("div", { class: "cuebox" }, h("div", null, "Category: " + m.cue), withMic(fs[i], { single: true, append: false }))), h("div", { class: "actions" }, go)));
        focusIt(fs[0]); await click(go); stopMic();
        const still = [];
        missed.forEach((m, i) => { if (wordHit(m.word, tokens(fs[i].value))) cued.category++; else still.push(m); });
        wipe(view);
        if (still.length) {
          const picks = new Map();
          const go2 = btn("Continue", "primary");
          const blocks = still.map((m) => {
            const row = h("div", { class: "mcbtns" });
            m.options.forEach((o) => { const b = h("button", { type: "button", class: "option-btn" }, o); b.addEventListener("click", () => { picks.set(m, o); row.querySelectorAll(".option-btn").forEach((x) => x.classList.remove("active")); b.classList.add("active"); }); row.append(b); });
            return h("div", { class: "cuebox" }, h("div", null, "Which one was in the list? (" + m.cue + ")"), row);
          });
          view.replaceChildren(instr("Second hint round (not scored). Choose one word for each."), ...blocks, h("div", { class: "actions" }, go2));
          await click(go2);
          still.forEach((m) => { if (picks.get(m) === m.word) cued.choice++; });
        }
      }
      S.memory.cued = cued;
    });

    add("Orientation", "Orientation", async () => {
      const keys = ["day", "month", "year", "weekday", "place", "city"];
      const labels = { day: "What is today's date (the day of the month, as a number)?", month: "What month is it?", year: "What year is it?", weekday: "What day of the week is it?", place: "What is the name or type of this place (e.g. clinic, hospital, home)?", city: "What city or town are you in?" };
      const fs = {}; keys.forEach((k) => (fs[k] = field(false, { numeric: k === "day" || k === "year" })));
      const go = btn("Continue", "primary");
      const conv = { day: numStr, year: Speech.spokenYear, month: (t) => t.trim().replace(/[.,]$/, ""), weekday: (t) => t.trim().replace(/[.,]$/, ""), place: (t) => t.trim().replace(/[.,]$/, ""), city: (t) => t.trim().replace(/[.,]$/, "") };
      view.replaceChildren(formOf(...keys.map((k) => h("div", { class: "field-row" }, h("label", null, labels[k]), withMic(fs[k], { single: true, append: false, convert: conv[k] }))), h("div", { class: "actions" }, go)));
      focusIt(fs.day); await click(go); stopMic();
      const v = {}; keys.forEach((k) => (v[k] = fs[k].value.trim())); wipe(view);
      const now = new Date();
      const MN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const mv = v.month.toLowerCase();
      const okMonth = mv === MN[now.getMonth()] || mv === MN[now.getMonth()].slice(0, 3) || mv === String(now.getMonth() + 1);
      const wv = v.weekday.toLowerCase();
      const okWd = wv === WD[now.getDay()] || (wv.length >= 3 && WD[now.getDay()].startsWith(wv));
      const add1 = (id, label, ok, detail, verify) => addItem({ domain: "Orientation", id, label, max: 1, auto: ok ? 1 : 0, detail, verify: !!verify });
      add1("o_day", "Date (day of month)", parseInt(v.day, 10) === now.getDate(), `typed "${v.day}"; system date ${now.getDate()}`);
      add1("o_month", "Month", okMonth, `typed "${v.month}"`);
      add1("o_year", "Year", v.year === String(now.getFullYear()), `typed "${v.year}"`);
      add1("o_wd", "Day of week", okWd, `typed "${v.weekday}"`);
      add1("o_place", "Place", v.place.length >= 2, `typed "${v.place}" (clinician to verify)`, true);
      add1("o_city", "City", v.city.length >= 2, `typed "${v.city}" (clinician to verify)`, true);
    });

    // ----- Optional extended (harder) block: scored separately -----
    const EX = "Extended challenge";
    const extSec = (title, run) => add(EX, title, run);
    extSec("Extended: introduction", async () => {
      const go = btn("Begin extended items", "primary");
      view.replaceChildren(instr("These extra, harder items are optional and scored separately. They are not part of the 30-point total, and the usual cut-off does not apply to them."), h("div", { class: "actions" }, go));
      await click(go);
    });
    extSec("Extended: new word list", async () => {
      await presentList({
        key: "extmem", items: S.memory.ext.map((m) => m.word), say: String, gap: 1000,
        intro: "Seven new words will be read aloud (or shown) one at a time. Remember them: you will be asked for them after a few more tasks. There is no practice recall.",
        playLabel: "\u25B6 Play the words", visualLabel: "Show the words",
        visual: { fmt: (w) => w.toUpperCase(), onMs: 1700, offMs: 300, cls: "word" }
      });
      S.memory.extLearnedAt = Date.now();
    });
    extSec("Extended: digits forward (7)", async () => {
      const r = await digitSpan(7, false);
      addItem({ domain: EX, id: "x_dfwd", label: "Forward digit span (7)", max: 1, auto: r.ok ? 1 : 0, detail: `answer ${r.answered || "-"}${r.spoken ? "; read aloud" : ""}${repNote(r.replays)}`, verify: !!r.replays });
    });
    extSec("Extended: digits backward (5)", async () => {
      const r = await digitSpan(5, true);
      addItem({ domain: EX, id: "x_dbwd", label: "Backward digit span (5)", max: 1, auto: r.ok ? 1 : 0, detail: `answer ${r.answered || "-"}${r.spoken ? "; read aloud" : ""}${repNote(r.replays)}`, verify: !!r.replays });
    });
    extSec("Extended: serial 13s", async () => {
      const r = await serialSubtraction({ start: rint(150, 199), step: 13, count: 5 });
      addItem({ domain: EX, id: "x_serial", label: "Serial 13s (4-5 correct=3, 2-3=2, 1=1)", max: 3, auto: r.score, detail: `start ${r.start}; answers ${r.answers.map((a) => (a == null ? "-" : a)).join(", ")}; ${r.correct}/5 correct` });
    });
    extSec("Extended: longer trail", async () => {
      const r = await trailTask({ pairs: 8, minD: 95, prompt: "Tap (or click) the circles in ascending order, alternating between numbers and letters (1, A, 2, B ...). This is a longer version." });
      addItem({ domain: EX, id: "x_trail", label: "Long alternating trail (8 pairs, no errors)", max: 1, auto: r.completed && r.errors === 0 ? 1 : 0, detail: `completed=${r.completed}, errors=${r.errors}, time=${(r.ms / 1000).toFixed(1)}s` });
    });
    extSec("Extended: harder similarities", async () => {
      const pairs = sample(ABSTRACT_EXT, 2);
      const fs = pairs.map(() => field(false)); const go = btn("Continue", "primary");
      view.replaceChildren(formOf(instr("In what way are the two things alike? Type or say a short answer for each."),
        ...pairs.map((p, i) => h("div", { class: "field-row" }, h("label", null, `${p.a} and ${p.b}`), withMic(fs[i], { append: false }))), h("div", { class: "actions" }, go)));
      focusIt(fs[0]); await click(go); stopMic();
      pairs.forEach((p, i) => addItem({ domain: EX, id: "x_abs" + i, label: `Abstraction: ${p.a} / ${p.b}`, max: 1, auto: p.re.test(fs[i].value.trim().toLowerCase()) ? 1 : 0, detail: `typed: "${fs[i].value.trim()}"`, verify: true }));
      wipe(view);
    });
    extSec("Extended: delayed recall (7 words)", async () => {
      await recallSec(S.memory.ext, EX, "x_recall", "Uncued recall of the 7-word extended list", S.memory.extLearnedAt, true);
    });
    return P;
  }

  // ---------- review / scoring ----------
  const DOMAIN_ORDER = [["Visuospatial / Executive", 5], ["Naming", 3], ["Attention", 6], ["Language", 3], ["Abstraction", 2], ["Delayed recall", 5], ["Orientation", 6]];

  function itemScore(it) {
    const o = S.overrides[it.id];
    if (o !== undefined) return o;
    return it.auto == null ? 0 : it.auto;
  }
  function totals() {
    const dom = {}; let core = 0, ext = 0, extMax = 0, unscored = 0;
    for (const [d, max] of DOMAIN_ORDER) dom[d] = { score: 0, max };
    S.items.forEach((it) => {
      const sc = itemScore(it);
      if (it.auto == null && S.overrides[it.id] === undefined && it.manual) unscored++;
      if (dom[it.domain]) { dom[it.domain].score += sc; core += sc; }
      else { ext += sc; extMax += it.max; }
    });
    const edu = S.eduAdj != null ? S.eduAdj : (S.settings.eduYears != null && S.settings.eduYears <= 12);
    const adj = edu && core < 30 ? 1 : 0;
    return { dom, core, adj, final: Math.min(30, core + adj), ext, extMax, unscored, edu };
  }

  function showReview() {
    clearInterval(clockTimer); cancelTTS();
    $("testScreen").classList.add("hidden"); syncVoiceToggle();
    const rs = $("reviewScreen"); rs.classList.remove("hidden");
    renderSteps("", S.settings.extended, new Set(DOMAINS.concat(["Extended challenge"])));
    $("progressText").textContent = "Done";
    S.times.totalMs = Date.now() - S.startedAt;

    const body = h("div");
    const summary = h("div"); const tableHost = h("div");
    let refreshDom = () => {};
    const render = () => {
      refreshDom();
      const t = totals();
      const interp = t.final >= 26
        ? "26 or above: within the range commonly regarded as normal on the official MoCA."
        : "Below 26: below the cut-off commonly used with the official MoCA; consider a fuller clinical evaluation.";
      const eduBox = h("div", { class: "checkline" });
      const cb = h("input", { type: "checkbox", name: token(), autocomplete: "off" }); cb.checked = !!t.edu;
      cb.addEventListener("change", () => { S.eduAdj = cb.checked; render(); });
      eduBox.append(cb, h("span", null, `Education adjustment: +1 point if \u226412 years of formal education${S.settings.eduYears != null ? ` (entered: ${S.settings.eduYears} years)` : " (not entered)"}`));
      summary.replaceChildren(...[
        t.unscored ? h("div", { class: "warn-box" }, `${t.unscored} drawing item(s) still need your scoring below (cube and clock). They count as 0 until scored.`) : null,
        h("div", { class: "summary-grid" },
          h("div", { class: "score-chip" }, h("span", null, "Total (/30)"), h("strong", { class: "big-score" }, String(t.final))),
          h("div", { class: "score-chip" }, h("span", null, "Raw score"), h("strong", null, `${t.core}/30`)),
          h("div", { class: "score-chip" }, h("span", null, "Education adjustment"), h("strong", null, `+${t.adj}`)),
          S.settings.extended ? h("div", { class: "score-chip" }, h("span", null, "Extended (separate)"), h("strong", null, `${t.ext}/${t.extMax}`)) : null),
        eduBox,
        h("p", null, interp),
        h("p", { class: "small muted" }, "Informal screening inspired by the MoCA. This is not the official MoCA, has not been validated, and is not diagnostic. Interpret only within a full clinical assessment.")
      ].filter(Boolean));
    };
    render();

    const dTable = (domains) => {
      const rows = [];
      domains.forEach((d) => {
        const items = S.items.filter((i) => i.domain === d);
        if (!items.length) return;
        items.forEach((it, idx) => {
          const sel = h("select", { name: token(), autocomplete: "off" });
          if (it.auto == null) sel.append(h("option", { value: "" }, "not scored"));
          for (let v = 0; v <= it.max; v++) sel.append(h("option", { value: String(v) }, String(v)));
          const cur = S.overrides[it.id] !== undefined ? S.overrides[it.id] : it.auto;
          sel.value = cur == null ? "" : String(cur);
          sel.addEventListener("change", () => { if (sel.value === "") delete S.overrides[it.id]; else S.overrides[it.id] = Number(sel.value); render(); });
          rows.push(h("tr", null, h("td", null, idx === 0 ? d : ""), h("td", null, it.label, it.verify ? h("span", { class: "badge warn", style: "margin-left:6px" }, "verify") : null), h("td", null, sel, ` / ${it.max}`), h("td", { class: "det" }, it.detail)));
        });
      });
      return h("table", { class: "table" }, h("thead", null, h("tr", null, ...["Domain", "Item", "Score", "Detail"].map((x) => h("th", null, x)))), h("tbody", null, rows));
    };

    const thumbs = h("div", { class: "thumbs" },
      S.drawings.cube ? h("figure", null, h("img", { src: S.drawings.cube, alt: "cube drawing" }), h("figcaption", null, "Cube copy")) : null,
      S.drawings.clock ? h("figure", null, h("img", { src: S.drawings.clock, alt: "clock drawing" }), h("figcaption", null, `Clock (requested: ${S.meta.clockTime})`)) : null);

    const mem = S.memory;
    const memInfo = h("div", { class: "review-item" }, h("h4", null, "Memory (learning trials, no points)"),
      h("p", { class: "small" }, mem.trials.map((x) => `Trial ${x.trial}: ${x.recalled}/5 words${x.readAloud ? " (read aloud)" : ""}${x.replays ? " (replayed " + x.replays + "\u00d7)" : ""}`).join(" \u00b7 ") +
        (mem.delayMs != null ? ` \u00b7 Delayed recall asked about ${fmt(mem.delayMs)} after learning` : "") +
        (mem.cued ? ` \u00b7 Hints for ${mem.cued.missed} missed word(s): category cue helped ${mem.cued.category}, multiple choice helped ${mem.cued.choice}` : "")));

    const notes = field(true); notes.style.minHeight = "100px";
    notes.addEventListener("input", () => { S.notes = notes.value; });

    const dl = btn("Download results (JSON)"), pr = btn("Print"), again = btn("New session (new random content)", "primary");
    dl.onclick = () => {
      const t = totals();
      const out = {
        tool: "MoCA-inspired informal screening v3 (not the official MoCA; not diagnostic)",
        date: new Date().toISOString(), label: S.settings.label, educationYears: S.settings.eduYears,
        extendedMode: S.settings.extended, totalMs: S.times.totalMs,
        scores: { raw30: t.core, educationAdjustment: t.adj, total30: t.final, extended: S.settings.extended ? { score: t.ext, max: t.extMax } : null },
        domains: t.dom, memory: { trials: mem.trials, delayMs: mem.delayMs, cued: mem.cued },
        items: S.items.map((i) => ({ id: i.id, domain: i.domain, label: i.label, max: i.max, auto: i.auto, final: itemScore(i), detail: i.detail, data: i.data || null })),
        voiceSettings: { readAloud: S.settings.voiceOut, voice: S.settings.voiceName, rate: S.settings.rate, replays: S.replays },
        clockRequested: S.meta.clockTime, fluencyLetter: S.meta.fluencyLetter, drawings: S.drawings, clinicianNotes: S.notes
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "moca-inspired-v3-results.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
    };
    pr.onclick = () => window.print();
    again.onclick = () => restart();

    body.append(
      h("div", { class: "section-top" }, h("div", null, h("div", { class: "eyebrow" }, "Results"), h("h2", null, "Scoring summary"))),
      summary,
      h("div", { class: "review-item" }, h("h4", null, "Per-domain breakdown"),
        h("table", { class: "table" }, h("thead", null, h("tr", null, h("th", null, "Domain"), h("th", null, "Score"))), h("tbody", { id: "domBody" }))),
      memInfo,
      h("div", { class: "review-item" }, h("h4", null, "Drawings: score here"), thumbs, h("p", { class: "small muted" }, "Cube: all edges present, 3-D, lines roughly parallel and equal. Clock: round contour; all 12 numbers in the right order and place; two hands at the requested time, hour hand shorter.")),
      h("div", { class: "review-item" }, h("h4", null, "Item scores (adjust any score if you judge it differently)"), tableHost),
      h("div", { class: "review-item" }, h("h4", null, "Clinician notes"), formOf(notes)),
      h("div", { class: "inline-actions" }, dl, pr, again)
    );
    refreshDom = () => {
      const t = totals();
      const tb = body.querySelector("#domBody");
      tb.replaceChildren(...[...DOMAIN_ORDER.map(([d, m]) => h("tr", null, h("td", null, d), h("td", null, `${t.dom[d].score} / ${m}`))),
        h("tr", null, h("td", null, "Memory (learning trials)"), h("td", null, "not scored")),
        h("tr", null, h("td", null, h("strong", null, "Raw total")), h("td", null, h("strong", null, `${t.core} / 30`))),
        h("tr", null, h("td", null, "Education adjustment"), h("td", null, `+${t.adj}`)),
        h("tr", null, h("td", null, h("strong", null, "Final total")), h("td", null, h("strong", null, `${t.final} / 30`))),
        S.settings.extended ? h("tr", null, h("td", null, "Extended challenge (separate)"), h("td", null, `${t.ext} / ${t.extMax}`)) : null].filter(Boolean));
    };
    tableHost.replaceChildren(dTable(DOMAIN_ORDER.map((x) => x[0]).concat(["Extended challenge"])));
    rs.replaceChildren(body);
    render();
    if (DEBUG) DEBUG.totals = totals;
  }

  // ---------- setup & flow ----------
  function syncVoiceToggle() {
    const vt = $("voiceToggle"); if (!vt) return;
    if (!TTSOK || !S || !S.startedAt || $("testScreen").classList.contains("hidden")) { vt.classList.add("hidden"); return; }
    vt.classList.remove("hidden");
    vt.textContent = S.settings.voiceOut ? "\uD83D\uDD0A Voice: on" : "\uD83D\uDD07 Voice: off";
  }
  $("voiceToggle").addEventListener("click", () => { if (!S) return; S.settings.voiceOut = !S.settings.voiceOut; syncVoiceToggle(); });

  function showSetup() {
    const el = $("setupScreen");
    $("testScreen").classList.add("hidden"); $("reviewScreen").classList.add("hidden"); el.classList.remove("hidden");
    renderSteps("", false, new Set());
    $("elapsed").textContent = "0:00"; $("progressText").textContent = "\u2013";
    const label = field(false), edu = field(false, { numeric: true });
    const micTest = field(false);
    const stt = speechStatus();
    showBanner(stt.ok ? null : SPEECH_MSG[stt.why]);
    const ext = h("input", { type: "checkbox", name: token(), autocomplete: "off" });
    // --- read-aloud (speechSynthesis) settings ---
    const voiceCb = h("input", { type: "checkbox", name: token(), autocomplete: "off" }); voiceCb.checked = TTSOK; voiceCb.disabled = !TTSOK;
    const voiceSel = h("select", { name: token(), autocomplete: "off", "aria-label": "Voice" });
    const rate = h("input", { type: "range", min: "0.6", max: "1.2", step: "0.05", value: "0.9", name: token(), autocomplete: "off", "aria-label": "Speaking speed" });
    const rateOut = h("span", { class: "small muted" }, "0.90\u00d7");
    rate.addEventListener("input", () => { rateOut.textContent = parseFloat(rate.value).toFixed(2) + "\u00d7"; });
    const testBtn = btn("\u25B6 Test voice"); testBtn.disabled = !TTSOK;
    const fillVoices = () => {
      const en = tts.voices.filter((v) => /^en/i.test(v.lang)); const list = en.length ? en : tts.voices;
      voiceSel.replaceChildren(...list.map((v) => h("option", { value: v.voiceURI }, `${v.name} (${v.lang})`)));
      if (tts.voice) voiceSel.value = tts.voice.voiceURI;
      voiceSel.disabled = !list.length;
    };
    tts.listeners.length = 0; tts.listeners.push(fillVoices); fillVoices();
    const applyVoice = () => { tts.voice = tts.voices.find((v) => v.voiceURI === voiceSel.value) || tts.voice; tts.rate = parseFloat(rate.value) || 0.9; };
    testBtn.addEventListener("click", async () => { applyVoice(); try { await speakOne("Testing. One, two, three."); } catch (e) { if (e !== CANCEL) throw e; } });
    const go = btn("Begin", "primary");
    el.replaceChildren(
      h("h2", null, "Start screening"),
      h("p", { class: "muted" }, "About 15\u201320 minutes. All words, numbers, letters, sentences and drawings are randomized each session. Items disappear after they are shown and you cannot go back."),
      h("div", { class: "warn-box" }, "Informal screening inspired by the MoCA. It is not the official MoCA, has not been validated, and is not diagnostic. Best used with a clinician present: for example, a clinician can score spoken answers and judge the drawings."),
      formOf(
        h("div", { class: "field-row" }, h("label", null, "Participant label (optional, kept only in this browser tab)"), label),
        h("div", { class: "field-row" }, h("label", null, "Years of formal education (optional; \u226412 adds 1 point)"), edu),
        h("div", { class: "field-row" }, h("label", null, stt.ok ? "Microphone check (optional): press Speak, allow the microphone if asked, and say \u201ctesting one two three\u201d. Speech is sent to your browser's cloud speech service: do not use real patient identifiers while testing." : "Voice answers are unavailable in this window (see the notice above). All items can be typed."), withMic(micTest, { single: true, append: false })),
        h("label", { class: "checkline" }, ext, h("span", null, "Add the extended (harder) items, scored separately from the 30-point total")),
        h("div", { class: "review-item" },
          h("h4", null, "Read stimuli aloud"),
          h("label", { class: "checkline" }, voiceCb, h("span", null, "Read the memory words, digits, letters and sentences aloud (they are then not shown on screen)")),
          TTSOK ? h("div", { class: "field-row" }, h("label", null, "Voice (English US is chosen by default)"), voiceSel) : null,
          TTSOK ? h("div", { class: "field-row" }, h("label", null, "Speaking speed"), h("div", { class: "inline-actions" }, rate, rateOut, testBtn)) : null,
          h("p", { class: "small muted" }, TTSOK
            ? "Tap \u201cTest voice\u201d first. Replaying an item is logged in the results. " + (IS_IOS ? "On iPad: turn the volume up and make sure the side switch / Control Centre mute is off, or you will not hear the voice." : "")
            : "This browser cannot speak. Words, digits, letters and sentences will be shown on screen instead.")),
        h("div", { class: "actions" }, go)));
    go.addEventListener("click", () => {
      S = newState();
      S.settings.label = label.value.trim();
      const ey = parseInt(edu.value, 10); S.settings.eduYears = Number.isNaN(ey) ? null : ey;
      S.settings.extended = ext.checked;
      applyVoice(); S.settings.voiceOut = TTSOK && voiceCb.checked; S.settings.voiceName = tts.voice ? tts.voice.name : ""; S.settings.rate = tts.rate;
      stopMic(); cancelTTS(); wipe(el); el.replaceChildren(); el.classList.add("hidden");
      runSession();
    });
    if (!IS_IOS && !(navigator.maxTouchPoints > 0)) label.focus();
    syncVoiceToggle();
  }

  async function runSession() {
    const id = ++runId;
    S.startedAt = Date.now(); startClock();
    if (DEBUG) { DEBUG.state = S; DEBUG.runId = id; }
    $("testScreen").classList.remove("hidden"); syncVoiceToggle();
    let plan = buildPlan();
    if (!S.settings.extended) plan = plan.filter((p) => p.domain !== "Extended challenge");
    const doneDomains = new Set();
    try {
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        if (i > 0 && plan[i - 1].domain !== p.domain) doneDomains.add(plan[i - 1].domain);
        renderSteps(p.domain, S.settings.extended, doneDomains);
        $("sectionKicker").textContent = p.domain; $("sectionTitle").textContent = p.title;
        $("progressText").textContent = `${i + 1} / ${plan.length}`;
        view.replaceChildren();
        if (DEBUG) DEBUG.step = { index: i, title: p.title, domain: p.domain };
        await p.run();
        if (id !== runId) return;
        stopMic(); cancelTTS();
        view.replaceChildren();
      }
      showReview();
    } catch (e) {
      if (e === CANCEL) return;
      console.error(e);
      view.replaceChildren(h("div", { class: "warn-box" }, "Something went wrong: " + (e && e.message ? e.message : e)));
    }
  }

  function restart() {
    runId++; clearInterval(clockTimer); stopMic(); cancelTTS();
    document.querySelectorAll("input,textarea").forEach((i) => { i.value = ""; });
    view.replaceChildren(); $("reviewScreen").replaceChildren();
    S = null;
    showSetup();
  }

  window.addEventListener("beforeunload", (e) => { if (S && S.startedAt && $("reviewScreen").classList.contains("hidden")) { e.preventDefault(); e.returnValue = ""; } });

  showSetup();
})();
