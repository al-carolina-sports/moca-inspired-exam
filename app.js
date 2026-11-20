/* Cognitive Exam v4.0 - shared core app for BOTH entry pages (/ipad/ and /windows/).
 * The entry page only sets <html data-platform="ipad|windows">; items, scoring, banks, forms and exports
 * are identical so results stay comparable. Self-contained, runs from file://.
 * Nothing about the current session's answers is exposed on window or written into input values.
 * Unvalidated informal tool. Not diagnostic. */
(function () {
  "use strict";

  // Test hooks (only active if a test harness sets them BEFORE load; absent in normal use).
  const TS = Number(window.__CE_TIMESCALE) || 1;          // time scale for automated tests
  const DEBUG = window.__CE_DEBUG || null;
  const C = window.CECore, U = window.CEUI;
  const { h, sv, btn, field, formOf, wipe, token, focusIt } = U;
  const PLATFORM = document.documentElement.getAttribute("data-platform") === "ipad" ? "ipad" : "windows";
  const APP_VERSION = C.VERSION;

  const CANCEL = { cancelled: true };
  let runId = 0;
  let S = null;            // session state
  let clockTimer = null;

  const $ = (id) => document.getElementById(id);
  const { rnd, pick, shuffle, sample, rint } = C;
  function sleep(ms) {
    const id = runId;
    return new Promise((res, rej) => setTimeout(() => (id === runId ? res() : rej(CANCEL)), ms * TS));
  }
  function click(b) { return new Promise((res) => b.addEventListener("click", () => res(), { once: true })); }

  // ---------- speech input (Web Speech API; typed fallback always kept) ----------
  const Speech = window.CESpeech;
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

  // ---------- session state ----------
  const EX = "Extended challenge", XT = "Additional measures";
  function newState(form, sess) {
    const F = Object.assign({ name: String(form.name).trim() }, C.normalizeForm(form));
    const mk = (m) => ({ word: m.word, cue: m.cue || "", options: C.mcOptions(m) });
    return {
      startedAt: null,
      form: F, formHash: C.formHash(form),
      sess,
      settings: { extended: !!F.extendedOn, eduYears: null, voiceOut: false, voiceName: "", rate: 0.9 },
      items: [],
      times: {},
      drawings: {},
      memory: { core: F.memory.map(mk), ext: F.ext.memory.map(mk), trials: [], learnedAt: null, delayMs: null, cued: null, extLearnedAt: null },
      meta: {},
      overrides: {},
      replays: {},
      eduAdj: null,
      notes: ""
    };
  }
  function addItem(it) { S.items.push(Object.assign({ auto: null, detail: "", verify: false, manual: false, metric: false, valueText: "", metrics: null }, it)); }
  const extraOn = (F) => { const e = F.extra || {}; return !!((e.catFluency && e.catFluency.on) || (e.stroop && e.stroop.on) || (e.command && e.command.on) || (e.spelling && e.spelling.on) || (e.reaction && e.reaction.on)); };

  // ---------- chrome (header, sidebar, progress) ----------
  const DOMAINS = ["Visuospatial / Executive", "Naming", "Memory", "Attention", "Language", "Abstraction", "Delayed recall", "Orientation"];
  const domainList = () => DOMAINS.concat(S && S.form.extendedOn ? [EX] : [], S && extraOn(S.form) ? [XT] : []);
  const view = $("content");
  function renderSteps(current, doneSet) {
    $("sectionList").replaceChildren(...domainList().map((d) => h("li", { class: (d === current ? "active " : "") + (doneSet.has(d) ? "done" : "") }, d)));
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

  // ---------- alternating trail (numbers/letters, plants/animals, numbers/weekdays, numbers/months) ----------
  const TRAIL_PROMPT = {
    numlet: "Tap (or click) the circles in ascending order, alternating between numbers and letters: start at 1, then go to the first letter (A), then to 2, then B, and so on. An error counts if you press the wrong circle.",
    plantanimal: "Tap (or click) the circles in order, alternating between plants and animals: start with plant 1, then animal 1, then plant 2, then animal 2, and so on. Each circle has a small number: use it to know the order within the plants and within the animals. An error counts if you press the wrong circle.",
    numday: "Tap (or click) the circles in order, alternating between numbers and days of the week: 1, Monday, 2, Tuesday, 3, Wednesday, and so on. An error counts if you press the wrong circle.",
    nummonth: "Tap (or click) the circles in order, alternating between numbers and months: 1, January, 2, February, 3, March, and so on. An error counts if you press the wrong circle."
  };
  const TRAIL_SHORT = { numlet: "numbers and letters", plantanimal: "plants and animals", numday: "numbers and weekdays", nummonth: "numbers and months" };
  const svgIcon = (d) => {
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + d + "</svg>", "image/svg+xml");
    return [...doc.documentElement.childNodes].map((n) => document.importNode(n, true));
  };

  function trailTask({ pattern, pairs, minD, prompt }) {
    return new Promise((resolve) => {
      const seq = C.trailSequence(pattern, pairs);
      const isIcon = pattern === "plantanimal", R = isIcon ? 32 : 27;
      const pts = layout(seq.length, Math.max(minD, isIcon ? 105 : 0));
      const svg = sv("svg", { viewBox: "0 0 800 500", class: "trail", "touch-action": "manipulation" });
      const lines = sv("g"); svg.append(lines);
      let next = 0, errors = 0, t0 = null;
      if (DEBUG) DEBUG.trailOrder = seq.map((s) => s.key);
      const done = (completed) => { resolve({ completed, errors, ms: t0 ? Date.now() - t0 : 0, reached: next, total: seq.length, pattern }); };
      const giveUp = btn("I can't continue");
      giveUp.addEventListener("click", () => done(false), { once: true });
      seq.forEach((s, i) => {
        const g = sv("g", { class: "node", "data-key": s.key, role: "button", "aria-label": s.label });
        g.append(sv("circle", { cx: pts[i].x, cy: pts[i].y, r: R }));
        if (s.kind === "text") {
          const t = sv("text", { x: pts[i].x, y: pts[i].y }); t.textContent = s.text; if (s.text.length > 2) t.setAttribute("style", "font-size:17px"); g.append(t);
        } else {
          const ic = sv("g", { transform: `translate(${pts[i].x - 20 * 0.95},${pts[i].y - 20 * 0.95}) scale(0.95)`, fill: "none", stroke: "#111", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none", class: "icon" });
          svgIcon(s.d).forEach((n) => ic.append(n)); g.append(ic);
          g.append(sv("circle", { cx: pts[i].x + R * 0.78, cy: pts[i].y - R * 0.78, r: 11, class: "badge-c" }));
          const bt = sv("text", { x: pts[i].x + R * 0.78, y: pts[i].y - R * 0.78, class: "badge-t" }); bt.textContent = String(s.rank); g.append(bt);
        }
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
    const base = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, hgt); ctx.strokeStyle = "#111"; ctx.lineWidth = PLATFORM === "ipad" ? 4 : 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; };
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
    // Windows / keyboard: Ctrl+Z undoes the last stroke while this pad is on screen
    const kd = (e) => { if (!c.isConnected) { document.removeEventListener("keydown", kd); return; } if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); strokes.pop(); redraw(); } };
    document.addEventListener("keydown", kd);
    return {
      el: c, strokes: () => strokes.length, png: () => c.toDataURL("image/png"),
      undo: () => { strokes.pop(); redraw(); }, clear: () => { strokes = []; redraw(); }
    };
  }
  function clockPrompt() {
    const H = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
    let hr, mn;
    do { hr = rint(1, 12); mn = pick([10, 20, 25, 35, 40, 50, 10, 50]); } while ((hr === 11 && mn === 10));
    const cur = H[hr % 12], nextH = H[(hr + 1) % 12];
    const txt = { 10: "ten past " + cur, 20: "twenty past " + cur, 25: "twenty-five past " + cur, 35: "twenty-five to " + nextH, 40: "twenty to " + nextH, 50: "ten to " + nextH }[mn];
    return { hr, mn, txt };
  }

  // ---------- digit span: HEARD ONLY. Digits are never drawn on the examinee's screen ----------
  // If speech output is unavailable (or switched off) the examiner reads them aloud from an examiner-only
  // panel that is hidden by default and must be hidden again before the device goes back to the examinee.
  async function digitSpan(seqStr, backward) {
    const digs = seqStr.split("").map(Number), n = digs.length;
    const key = "digits-" + (backward ? "bwd" : "fwd") + n;
    const how = backward ? "Afterwards, type or say them in REVERSE order (last number first)." : "Afterwards, type or say them in the SAME order.";
    let mode = voiceOn() ? "voice" : "examiner", replay = null;
    if (mode === "voice") {
      const go = btn("\u25B6 Play the numbers", "primary");
      view.replaceChildren(instr("Numbers will be read aloud, one at a time. Listen carefully: nothing will be shown on the screen. " + how), h("div", { class: "actions" }, go));
      await click(go);                     // user gesture: required by iOS/Safari for speech
      view.replaceChildren(listenScreen());
      const r = await speakSequence(digs, { gap: 1000, say: window.CESpeech.digitName });
      if (r.failed) { mode = "examiner"; S.meta.ttsFailed = true; view.replaceChildren(h("div", { class: "warn-box" }, "The browser could not speak. The examiner will read the numbers aloud instead.")); await sleep(1200); }
      else replay = async () => { const k = bumpReplay(key); await speakSequence(digs, { gap: 1000, say: window.CESpeech.digitName }); return k; };
    }
    if (mode === "examiner") {
      S.meta.digitsExaminerRead = true;
      let shows = 0;
      const mask = h("div", { class: "ex-digits", "data-k": "ex-digits" }, "\u2022 ".repeat(n).trim());
      const show = btn("Show the digits (examiner only)"), cont = btn("Digits hidden: continue", "primary");
      cont.disabled = true;
      const examiner = h("div", { class: "examiner-panel", "data-k": "examiner-panel" },
        h("div", { class: "ex-title" }, "EXAMINER READS ALOUD"),
        h("p", { class: "small" }, `Speech output is ${TTSOK ? "switched off" : "not available in this browser"}, so the numbers are not played. Digits are never shown to the examinee: they appear here only while you press \u201cShow\u201d. Read the ${n} digits aloud at one per second, then hide them again BEFORE the device is handed back. Every later \u201cShow\u201d is logged as a repeat.`),
        mask, h("div", { class: "inline-actions" }, show, cont));
      let revealed = false;
      const maskTxt = "\u2022 ".repeat(n).trim();
      show.addEventListener("click", () => {
        if (!revealed) { revealed = true; shows++; if (shows > 1) bumpReplay(key); mask.textContent = digs.join(" "); mask.classList.add("revealed"); show.textContent = "Hide the digits"; cont.disabled = true; }
        else { revealed = false; mask.textContent = maskTxt; mask.classList.remove("revealed"); show.textContent = "Show the digits again (logged)"; cont.disabled = false; }
      });
      view.replaceChildren(instr("Examiner-read digits. " + how), examiner);
      await click(cont);
    }
    const ans = digitsOf(await askText({ prompt: backward ? "Type or say the numbers in REVERSE order." : "Type or say the numbers in the SAME order.", numeric: true, mic: { convert: Speech.spokenDigits, append: false }, replay }));
    const want = (backward ? digs.slice().reverse() : digs).join("");
    return { ok: ans === want, len: n, answered: ans, mode, replays: S.replays[key] || 0 };
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

  // ---------- generic 60-second fluency task (letter fluency and category fluency) ----------
  // spec: { intro, heading, extract(raw), addCheck(word) -> error|null, threshold|null, noun }
  async function fluencyTask(spec) {
    const stt = speechStatus();
    const go = btn(stt.ok ? "Start (microphone and 60-second timer start together)" : "Start 60 seconds", "primary");
    view.replaceChildren(instr(spec.intro + (stt.ok ? " Speak clearly; your words will appear on screen as you say them. The first time, the browser may ask for permission to use the microphone: click Allow before you start the timer (use the microphone check on the setup page)." : " Separate words with commas, spaces or new lines.")), h("div", { class: "actions" }, go));
    await click(go);
    const f = field(true); f.style.minHeight = "120px";
    const tf = field(true); tf.readOnly = true; tf.style.minHeight = "140px"; tf.setAttribute("aria-label", "Live transcript");
    const clock = h("div", { class: "bigclock" }, "1:00");
    const fin = btn("I'm finished", "primary");
    const live = h("span", { class: "mic-status small muted" });
    let micEnded = null;
    const endedP = new Promise((r) => { micEnded = r; });
    let rec = null;
    if (stt.ok) {
      stopMic();
      rec = makeRecognizer({
        keepAlive: true, single: false,
        onUpdate: (fin2, interim) => { tf.value = (fin2 ? fin2 : "") + (interim ? (fin2 ? "\n" : "") + interim : ""); viaMic.add(tf); },
        onState: (kind, info) => {
          if (kind === "start") { live.textContent = "\uD83C\uDFA4 listening\u2026"; showBanner(null); }
          else if (kind === "error") { live.textContent = "microphone problem: you can type instead"; showBanner(SPEECH_MSG[info] || "Microphone error: " + info + ". Typing still works."); }
          else if (kind === "end") { micEnded(); }
        }
      });
      activeRec = rec;
    } else micEnded();
    view.replaceChildren(formOf(instr(spec.heading), clock,
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

    const ex = spec.extract(raw);
    const chips = ex.chips;
    const list = h("div", { class: "chips" });
    const countEl = h("div", { class: "chipcount" });
    const render = () => {
      list.replaceChildren(...chips.map((c) => h("button", {
        type: "button", class: "chip" + (c.struck ? " struck" : "") + (c.flags.length ? " flagged" : ""),
        title: (c.flags.join("; ") || "valid") + " \u2013 click to " + (c.struck ? "restore" : "strike"),
        onclick: () => { c.struck = !c.struck; render(); }
      }, c.word, c.flags.length ? h("span", { class: "chipflag" }, " \u26A0") : null)));
      if (!chips.length) list.append(h("span", { class: "muted small" }, spec.noneText));
      const n = chips.filter((c) => !c.struck).length;
      const met = spec.threshold != null ? n >= spec.threshold : null;
      countEl.textContent = `${n} valid ${spec.noun}${n === 1 ? "" : "s"}` + (spec.threshold != null ? ` (threshold ${spec.threshold}): ${met ? "meets the 1-point criterion" : "does not meet the criterion"}` : " (counted, not scored)");
      countEl.className = "chipcount " + (met == null ? "" : met ? "ok" : "no");
    };
    const addF = field(false); const addB = btn("Add word");
    const addMsg = h("span", { class: "small muted" });
    addB.addEventListener("click", () => {
      const w = addF.value.toLowerCase().replace(/[^a-z ]/g, "").trim();
      const e = w.length < 2 ? "Type a word first." : spec.addCheck(w);
      if (e) { addMsg.textContent = e; return; }
      if (chips.some((c) => c.word === w)) { addMsg.textContent = "Already in the list."; return; }
      chips.push({ word: w, flags: ["added by clinician"], struck: false }); addF.value = ""; addMsg.textContent = ""; render();
    });
    addF.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addB.click(); } });
    const fluGo = btn("Continue", "primary");
    const transcript = h("details", null, h("summary", { class: "small muted" }, "Show raw transcript"), h("div", { class: "result-box small", style: "white-space:pre-wrap" }, raw || "(empty)"));
    view.replaceChildren(
      instr(spec.reviewIntro),
      list, countEl,
      formOf(h("div", { class: "inline-actions" }, h("span", { class: "small muted" }, "Missed a word the microphone did not hear?"), addF, addB, addMsg)),
      transcript, h("div", { class: "actions" }, fluGo));
    render();
    await click(fluGo);
    wipe(view);
    const valid = chips.filter((c) => !c.struck).map((c) => c.word);
    const struck = chips.filter((c) => c.struck).map((c) => c.word + " [" + (c.flags[0] || "struck by clinician") + "]");
    return { valid, struck, duplicates: ex.duplicates, usedMic, usedType };
  }
  const inputMode = (r) => (r.usedMic && r.usedType ? "; spoken + typed" : r.usedMic ? "; spoken" : "; typed");

  // ---------- Stroop colour-word ----------
  async function stroopTask(nTrials) {
    const colors = C.STROOP_COLORS, hex = Object.fromEntries(colors.map((c) => [c.id, c.hex]));
    const go = btn("Start practice", "primary");
    view.replaceChildren(instr("Words will appear one at a time, printed in coloured ink. Tap the button for the INK COLOUR the word is printed in. Ignore what the word says. Work quickly but accurately. There are 3 practice words first." + (PLATFORM === "windows" ? " (Keyboard: R, B, G, Y.)" : "")), h("div", { class: "actions" }, go));
    await click(go);
    const run = async (trials, practice) => {
      const out = [];
      for (const t of trials) {
        const word = h("div", { class: "stroop-word", "data-ink": t.ink, style: `color:${hex[t.ink]}` }, colors.find((c) => c.id === t.word).label);
        const fb = h("div", { class: "small muted stroop-fb", role: "status" }, "\u00a0");
        const bs = colors.map((c) => { const b = btn(c.id.charAt(0).toUpperCase() + c.id.slice(1), "stroop-btn"); b.setAttribute("data-color", c.id); return b; });
        const row = h("div", { class: "stroop-row" }, bs);
        view.replaceChildren(h("div", { class: "section-top" }, h("div", { class: "eyebrow" }, practice ? "Practice" : "Tap the ink colour")), word, row, fb);
        const t0 = performance.now();
        const resp = await new Promise((res) => {
          const kd = (e) => { const m = { r: "red", b: "blue", g: "green", y: "yellow" }[String(e.key).toLowerCase()]; if (m) { window.removeEventListener("keydown", kd); res(m); } };
          window.addEventListener("keydown", kd);
          bs.forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); window.removeEventListener("keydown", kd); res(b.getAttribute("data-color")); }, { once: true }));
        });
        const rt = performance.now() - t0, correct = resp === t.ink;
        if (practice) { fb.textContent = correct ? "Correct" : "Not quite: tap the ink colour"; await sleep(700); }
        else { view.replaceChildren(h("div", { class: "stroop-blank" })); await sleep(350); }
        out.push({ word: t.word, ink: t.ink, resp, correct, rt: Math.round(rt) });
      }
      return out;
    };
    await run(C.stroopTrials(3), true);
    const go2 = btn("Start", "primary");
    view.replaceChildren(instr("Practice finished. Now the real trials: tap the INK COLOUR as quickly and accurately as you can."), h("div", { class: "actions" }, go2));
    await click(go2);
    const trials = await run(C.stroopTrials(nTrials), false);
    return { trials, stats: C.stroopStats(trials) };
  }

  // ---------- simple reaction time ----------
  async function reactionTask(n) {
    const go = btn("Start", "primary");
    view.replaceChildren(instr("A grey box will turn GREEN after a random wait. Tap it (or press the space bar) as fast as you can the moment it turns green. Do not tap early." ), h("div", { class: "actions" }, go));
    await click(go);
    const rts = []; let falseStarts = 0;
    for (let i = 0; i < n; i++) {
      for (;;) {
        const pad = h("button", { type: "button", class: "rt-pad wait", "data-k": "rt-pad" }, "Wait\u2026");
        const info = h("div", { class: "small muted" }, `Trial ${i + 1} of ${n}`);
        view.replaceChildren(info, pad);
        let state = "wait", onset = 0;
        const result = await new Promise((res) => {
          const id = runId;
          const timer = setTimeout(() => { if (id !== runId) return; state = "go"; pad.className = "rt-pad go"; pad.textContent = "TAP!"; onset = performance.now(); }, rint(1200, 3500) * TS);
          const hit = (e) => { if (e && e.preventDefault) e.preventDefault(); window.removeEventListener("keydown", kd); clearTimeout(timer); res(state === "go" ? { rt: performance.now() - onset } : { early: true }); };
          const kd = (e) => { if (e.code === "Space") { e.preventDefault(); hit(); } };
          window.addEventListener("keydown", kd);
          pad.addEventListener("pointerdown", hit, { once: true });
        });
        if (result.early) { falseStarts++; view.replaceChildren(h("div", { class: "warn-box" }, "Too soon: wait for green. Trying again.")); await sleep(1000); continue; }
        rts.push(Math.round(result.rt)); break;
      }
      view.replaceChildren(h("div", { class: "stroop-blank" })); await sleep(400);
    }
    return { rts, falseStarts, stats: C.reactionStats(rts, falseStarts) };
  }

  // ---------- 3-step command following with tap targets ----------
  const STAR = (cx, cy, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; return (cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1); }).join(" ");
  function shapeEl(shape, cx, cy, r, fill) {
    if (shape === "circle") return sv("circle", { cx, cy, r, fill });
    if (shape === "square") return sv("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, fill });
    if (shape === "triangle") return sv("polygon", { points: `${cx},${cy - r} ${cx + r * 1.1},${cy + r * 0.85} ${cx - r * 1.1},${cy + r * 0.85}`, fill });
    return sv("polygon", { points: STAR(cx, cy, r * 1.15), fill });
  }
  async function commandTask(steps) {
    const text = C.commandText(steps);
    let voice = voiceOn(), replay = null;
    const go = btn(voice ? "\u25B6 Play the instruction" : "Show the instruction", "primary");
    view.replaceChildren(instr(`You will ${voice ? "hear" : "see, briefly,"} an instruction with three steps. Afterwards, do the steps in order by tapping the shapes.`), h("div", { class: "actions" }, go));
    await click(go);
    if (voice) {
      view.replaceChildren(listenScreen());
      const r = await speakOne(text);
      if (r.failed) { voice = false; S.meta.ttsFailed = true; } else replay = async () => { const n = bumpReplay("command"); await speakOne(text); return n; };
    }
    if (!voice) { const box = h("div", { class: "stimulus sentence" }, text); view.replaceChildren(box); await sleep(Math.max(5000, text.split(" ").length * 600)); box.remove(); }
    const targets = C.commandTargets(steps), hex = Object.fromEntries(C.CMD_COLORS.map((c) => [c.id, c.hex]));
    return await new Promise((resolve) => {
      const svg = sv("svg", { viewBox: "0 0 600 320", class: "cmd-board" });
      const taps = [];
      const finish = () => resolve({ taps });
      targets.forEach((t, i) => {
        const cx = 100 + (i % 3) * 200, cy = 90 + Math.floor(i / 3) * 150;
        const g = sv("g", { class: "cmd-target", "data-color": t.color, "data-shape": t.shape, role: "button", "aria-label": t.color + " " + t.shape });
        g.append(sv("rect", { x: cx - 70, y: cy - 62, width: 140, height: 124, rx: 14, class: "cmd-cell" }), shapeEl(t.shape, cx, cy, 44, hex[t.color]));
        g.addEventListener("pointerdown", (e) => {
          e.preventDefault(); if (taps.length >= 3) return;
          taps.push({ color: t.color, shape: t.shape }); g.classList.add("tapped");
          if (taps.length === 3) setTimeout(finish, 350 * TS);
        });
        svg.append(g);
      });
      const done = btn("I'm done");
      done.addEventListener("click", finish, { once: true });
      let replayRow = null;
      if (replay) {
        const rb = btn("\u21BB Replay (examiner; logged)"); const rs = h("span", { class: "small muted" });
        rb.addEventListener("click", async () => { rb.disabled = true; rs.textContent = "playing\u2026"; try { const n = await replay(); rs.textContent = `replayed ${n}\u00d7 (recorded in the results)`; } catch (e) { if (e !== CANCEL) throw e; } finally { rb.disabled = false; } });
        replayRow = h("div", { class: "inline-actions" }, rb, rs);
      }
      view.replaceChildren(instr("Now do the three steps, in order. Tap a shape for each step."), svg, replayRow, h("div", { class: "inline-actions" }, done));
    });
  }


  // ---------- sections ----------
  const FIGURE_HELP = (id) => C.shapeInfo(id).crit2;
  function buildPlan() {
    const P = [], F = S.form;
    const add = (domain, title, run) => P.push({ domain, title, run });
    const VE = "Visuospatial / Executive";

    add(VE, "Connect in order", async () => {
      const r = await trailTask({ pattern: F.trail.pattern, pairs: 5, minD: 120, prompt: TRAIL_PROMPT[F.trail.pattern] });
      addItem({ domain: VE, id: "trail", label: "Alternating trail (" + TRAIL_SHORT[F.trail.pattern] + ")", max: 1, auto: r.completed && r.errors === 0 ? 1 : 0, detail: `pattern=${F.trail.pattern}; completed=${r.completed}, errors=${r.errors}, time=${(r.ms / 1000).toFixed(1)}s` });
    });

    add(VE, "Copy the figure", async () => {
      const info = C.shapeInfo(F.shape);
      const pad = drawPad(700, 440); const fig = U.figSvg(C.figure(F.shape));
      const done = btn("Done", "primary");
      const u = btn("Undo stroke"); u.onclick = pad.undo; const c = btn("Clear"); c.onclick = pad.clear;
      view.replaceChildren(instr("Copy this drawing as accurately as you can in the box below (use a stylus, finger, or mouse). The model stays visible while you draw."), fig, h("div", { class: "toolbar" }, u, c), pad.el, h("div", { class: "actions" }, done));
      await click(done);
      S.drawings.figure = pad.png();
      addItem({ domain: VE, id: "figure", label: info.criteria, max: 1, manual: true, detail: `figure=${F.shape}; strokes=${pad.strokes()}` });
    });

    add(VE, "Draw a clock", async () => {
      const t = clockPrompt(); S.meta.clockTime = t.txt;
      const pad = drawPad(600, 600); const done = btn("Done", "primary");
      const u = btn("Undo stroke"); u.onclick = pad.undo; const c = btn("Clear"); c.onclick = pad.clear;
      view.replaceChildren(instr(`Draw a clock face. Put in all the numbers and set the hands to show ${t.txt}.`), h("div", { class: "toolbar" }, u, c), pad.el, h("div", { class: "actions" }, done));
      await click(done);
      S.drawings.clock = pad.png();
      addItem({ domain: VE, id: "clockC", label: "Clock contour (round face)", max: 1, manual: true, detail: `strokes=${pad.strokes()}` });
      addItem({ domain: VE, id: "clockN", label: "Clock numbers (all 12, correct order and position)", max: 1, manual: true });
      addItem({ domain: VE, id: "clockH", label: `Clock hands (show ${t.txt}; hour hand shorter)`, max: 1, manual: true });
    });

    add("Naming", "Naming", async () => {
      const sel = F.naming;
      const fields = sel.map(() => field(false));
      const go = btn("Continue", "primary");
      const grid = h("div", { class: "naming-grid" }, sel.map((n, k) => h("figure", null, h("img", { src: window.CE_ART[n.art], alt: "" }), withMic(fields[k], { single: true, append: false }))));
      view.replaceChildren(formOf(instr("Type or say the name of each animal."), grid, h("div", { class: "actions" }, go)));
      focusIt(fields[0]);
      await click(go); stopMic();
      const NFILL = new Set(["a", "an", "the", "it", "its", "is", "that", "this", "looks", "like", "i", "think", "thats", "s", "animal", "um", "uh", "picture", "of", "there", "here", "was"]);
      sel.forEach((n, k) => {
        const ans = tokens(fields[k].value).filter((t) => !NFILL.has(t)).join(" ");
        const ok = n.accept.some((w) => ans === w || (w.length >= 6 && lev(ans, w) <= 1));
        addItem({ domain: "Naming", id: "name" + k, label: "Animal " + (k + 1), max: 1, auto: ok ? 1 : 0, detail: `typed: "${fields[k].value.trim()}"; accepted: ${n.accept.join(" / ")}`, verify: !ok && ans.length > 0 });
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

    const dsDetail = (r) => `answer ${r.answered || "-"}; digits ${r.mode === "voice" ? "read aloud by the device (never shown)" : "read aloud by the examiner (never shown to the examinee)"}${repNote(r.replays)}`;
    add("Attention", "Digits forward", async () => {
      const r = await digitSpan(F.digitsFwd, false);
      addItem({ domain: "Attention", id: "dfwd", label: "Forward digit span (5)", max: 1, auto: r.ok ? 1 : 0, detail: dsDetail(r), verify: !!r.replays || r.mode !== "voice" });
    });
    add("Attention", "Digits backward", async () => {
      const r = await digitSpan(F.digitsBwd, true);
      addItem({ domain: "Attention", id: "dbwd", label: "Backward digit span (3)", max: 1, auto: r.ok ? 1 : 0, detail: dsDetail(r), verify: !!r.replays || r.mode !== "voice" });
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
      const r = await serialSubtraction({ start: F.serialStart, step: 7, count: 5 });
      addItem({ domain: "Attention", id: "serial", label: "Serial 7s (4-5 correct=3, 2-3=2, 1=1)", max: 3, auto: r.score, detail: `start ${r.start}; answers ${r.answers.map((a) => (a == null ? "-" : a)).join(", ")}; ${r.correct}/5 correct` });
    });

    const sentenceSec = (k) => async () => {
      const s = F.sentences[k];
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
      const L = F.fluencyLetter.toUpperCase();
      S.meta.fluencyLetter = L;
      const r = await fluencyTask({
        intro: `You will have 60 seconds to say or type as many words as you can that begin with the letter ${L}. Do not use names of people or places, numbers, or the same word with a different ending (e.g. run, runs, running).`,
        heading: `Words that begin with ${L}`,
        extract: (raw) => Speech.extractFluency(raw, L), threshold: 11, noun: "word", noneText: "No words beginning with " + L + " were detected.",
        addCheck: (w) => (w[0] !== L.toLowerCase() ? `Must start with ${L}.` : null),
        reviewIntro: `Time is up. Words beginning with ${L} are listed below. Click a word to strike it out (or restore it) before scoring: names, places, numbers, and the same word with a different ending do not count. \u26A0 marks a word to check; struck chips were struck automatically (filler words, known names/places, same-stem repeats).`
      });
      addItem({ domain: "Language", id: "fluency", label: `Fluency: \u226511 valid ${L}-words in 60 s`, max: 1, auto: r.valid.length >= 11 ? 1 : 0, detail: `letter ${L}; ${r.valid.length} valid: ${r.valid.join(", ")}${r.struck.length ? "; struck: " + r.struck.join(", ") : ""}${r.duplicates ? "; repeated words ignored: " + r.duplicates : ""}${inputMode(r)}`, verify: true });
    });

    const absSec = (pairsArr, domain, idp) => async () => {
      const pairs = pairsArr;
      const fs = pairs.map(() => field(false));
      const go = btn("Continue", "primary");
      view.replaceChildren(formOf(instr("In what way are the two things alike? Type or say a short answer for each."),
        ...pairs.map((p, i) => h("div", { class: "field-row" }, h("label", null, `${p.a} and ${p.b}`), withMic(fs[i], { append: false }))), h("div", { class: "actions" }, go)));
      focusIt(fs[0]); await click(go); stopMic();
      pairs.forEach((p, i) => {
        const ans = fs[i].value.trim().toLowerCase();
        addItem({ domain, id: idp + i, label: `Abstraction: ${p.a} / ${p.b}`, max: 1, auto: C.pairRegex(p.kw).test(ans) ? 1 : 0, detail: `typed: "${fs[i].value.trim()}"`, verify: true });
      });
      wipe(view);
    };
    add("Abstraction", "Similarities", absSec(F.abstraction, "Abstraction", "abs"));

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
        const withCue = missed.filter((m) => m.cue);
        let still = missed.slice();
        if (withCue.length) {
          const fs = withCue.map(() => field(false));
          const go = btn("Continue", "primary");
          view.replaceChildren(formOf(instr("Hint round (not scored). For each word you did not recall, a category hint is given. Type the word if it comes to mind, or leave blank."),
            ...withCue.map((m, i) => h("div", { class: "cuebox" }, h("div", null, "Category: " + m.cue), withMic(fs[i], { single: true, append: false }))), h("div", { class: "actions" }, go)));
          focusIt(fs[0]); await click(go); stopMic();
          withCue.forEach((m, i) => { if (wordHit(m.word, tokens(fs[i].value))) { cued.category++; still = still.filter((x) => x !== m); } });
          wipe(view);
        }
        if (still.length) {
          const picks = new Map();
          const go2 = btn("Continue", "primary");
          const blocks = still.map((m) => {
            const row = h("div", { class: "mcbtns" });
            m.options.forEach((o) => { const b = h("button", { type: "button", class: "option-btn" }, o); b.addEventListener("click", () => { picks.set(m, o); row.querySelectorAll(".option-btn").forEach((x) => x.classList.remove("active")); b.classList.add("active"); }); row.append(b); });
            return h("div", { class: "cuebox" }, h("div", null, "Which one was in the list?" + (m.cue ? " (" + m.cue + ")" : "")), row);
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
    if (F.extendedOn) {
      const extSec = (title, run) => add(EX, title, run);
      extSec("Extended: introduction", async () => {
        const go = btn("Begin extended items", "primary");
        view.replaceChildren(instr("These extra, harder items are optional and scored separately. They are not part of the 30-point total."), h("div", { class: "actions" }, go));
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
        const r = await digitSpan(F.ext.digitsFwd, false);
        addItem({ domain: EX, id: "x_dfwd", label: "Forward digit span (7)", max: 1, auto: r.ok ? 1 : 0, detail: dsDetail(r), verify: !!r.replays || r.mode !== "voice" });
      });
      extSec("Extended: digits backward (5)", async () => {
        const r = await digitSpan(F.ext.digitsBwd, true);
        addItem({ domain: EX, id: "x_dbwd", label: "Backward digit span (5)", max: 1, auto: r.ok ? 1 : 0, detail: dsDetail(r), verify: !!r.replays || r.mode !== "voice" });
      });
      extSec("Extended: serial 13s", async () => {
        const r = await serialSubtraction({ start: F.ext.serialStart, step: 13, count: 5 });
        addItem({ domain: EX, id: "x_serial", label: "Serial 13s (4-5 correct=3, 2-3=2, 1=1)", max: 3, auto: r.score, detail: `start ${r.start}; answers ${r.answers.map((a) => (a == null ? "-" : a)).join(", ")}; ${r.correct}/5 correct` });
      });
      extSec("Extended: longer trail", async () => {
        const pairs = Math.min(8, C.trailMax(F.trail.pattern));
        const r = await trailTask({ pattern: F.trail.pattern, pairs, minD: 95, prompt: "This is a longer version. " + TRAIL_PROMPT[F.trail.pattern] });
        addItem({ domain: EX, id: "x_trail", label: `Long alternating trail (${pairs} pairs, no errors)`, max: 1, auto: r.completed && r.errors === 0 ? 1 : 0, detail: `pattern=${F.trail.pattern}; completed=${r.completed}, errors=${r.errors}, time=${(r.ms / 1000).toFixed(1)}s` });
      });
      extSec("Extended: harder similarities", absSec(F.ext.abstraction, EX, "x_abs"));
      extSec("Extended: delayed recall (7 words)", async () => {
        await recallSec(S.memory.ext, EX, "x_recall", "Uncued recall of the 7-word extended list", S.memory.extLearnedAt, true);
      });
    }

    // ----- Additional measures: each optional, scored separately and outside the 30 points -----
    const E = F.extra || {};
    const xtSec = (title, run) => add(XT, title, run);
    if (extraOn(F)) xtSec("Additional measures: introduction", async () => {
      const go = btn("Begin additional measures", "primary");
      view.replaceChildren(instr("These additional measures are optional. Each is reported separately and none is part of the 30-point total."), h("div", { class: "actions" }, go));
      await click(go);
    });
    if (E.catFluency && E.catFluency.on) xtSec("Category fluency (animals)", async () => {
      const thr = E.catFluency.threshold;
      const r = await fluencyTask({
        intro: "You will have 60 seconds to say or type as many different animals as you can. Do not repeat an animal and do not use the same animal with a different ending (dog, dogs).",
        heading: "Name as many animals as you can",
        extract: (raw) => Speech.extractCategory(raw), threshold: thr == null ? null : thr, noun: "animal", noneText: "No animals were detected.",
        addCheck: () => null,
        reviewIntro: "Time is up. The words below were heard or typed. Click a word to strike it out (or restore it) if it is not an animal or is a repeat; then continue. The count of valid animals is reported."
      });
      const n = r.valid.length;
      addItem({ domain: XT, id: "catfluency", label: thr == null ? "Category fluency: animals in 60 s (count only)" : `Category fluency: \u2265${thr} animals in 60 s`, max: thr == null ? 0 : 1, auto: thr == null ? null : (n >= thr ? 1 : 0), metric: true, valueText: String(n) + " animals", metrics: [{ name: "category_fluency_animals_count", value: n, unit: "words" }],
        detail: `${n} valid: ${r.valid.join(", ")}${r.struck.length ? "; struck: " + r.struck.join(", ") : ""}${r.duplicates ? "; repeats ignored: " + r.duplicates : ""}${inputMode(r)}`, verify: true });
    });
    if (E.stroop && E.stroop.on) xtSec("Stroop colour-word", async () => {
      const r = await stroopTask(E.stroop.trials);
      const st = r.stats;
      addItem({ domain: XT, id: "stroop", label: `Stroop colour-word (${st.n} incongruent trials)`, max: 0, metric: true, valueText: `${st.accuracyPct}% correct, mean ${st.meanRtCorrectMs == null ? "-" : st.meanRtCorrectMs} ms`,
        metrics: [{ name: "stroop_accuracy_pct", value: st.accuracyPct, unit: "%" }, { name: "stroop_mean_rt_correct_ms", value: st.meanRtCorrectMs, unit: "ms" }, { name: "stroop_mean_rt_all_ms", value: st.meanRtAllMs, unit: "ms" }],
        detail: `${st.correct}/${st.n} correct; mean RT of correct trials ${st.meanRtCorrectMs} ms (median ${st.medianRtCorrectMs} ms); 3 practice trials not counted. Response time is measured on this device's screen and touch/mouse input, so compare only between sessions on the same device.`, data: { trials: r.trials, stats: st }, verify: false });
    });
    if (E.command && E.command.on) xtSec("Command following (3 steps)", async () => {
      const r = await commandTask(E.command.steps);
      const sc = C.scoreCommand(r.taps, E.command.steps);
      addItem({ domain: XT, id: "command", label: "Command following (3 steps in order)", max: 3, auto: sc.score, detail: `command: ${C.commandText(E.command.steps)} taps: ${r.taps.map(C.stepKey).join(", ") || "none"}; steps correct: ${sc.per.map((x) => (x ? "yes" : "no")).join("/")}${repNote(S.replays.command)}`, verify: !!S.replays.command });
    });
    if (E.spelling && E.spelling.on) xtSec("Reverse spelling", async () => {
      const word = E.spelling.word.toUpperCase();
      let voice = voiceOn(), replay = null;
      const go = btn(voice ? "\u25B6 Play the word" : "Show the word", "primary");
      view.replaceChildren(instr(`A 5-letter word will be ${voice ? "read aloud" : "shown"}. Afterwards, spell it BACKWARDS: type or say the letters from the last to the first.`), h("div", { class: "actions" }, go));
      await click(go);
      if (voice) {
        view.replaceChildren(listenScreen());
        const r = await speakOne(word.toLowerCase());
        if (r.failed) { voice = false; S.meta.ttsFailed = true; } else replay = async () => { const n = bumpReplay("spelling"); await speakOne(word.toLowerCase()); return n; };
      }
      if (!voice) { const box = h("div", { class: "stimulus word" }, word); view.replaceChildren(box); await sleep(2500); box.remove(); }
      const v = await askText({ prompt: "Spell the word backwards: type or say the letters in reverse order.", mic: { convert: Speech.spokenLetters, append: false }, replay });
      const letters = /[\s,.-]/.test(v.trim()) ? Speech.spokenLetters(v) : v.toUpperCase().replace(/[^A-Z]/g, "");
      const sc = C.scoreSpelling(letters, word);
      addItem({ domain: XT, id: "spelling", label: "Reverse spelling (" + word.length + " letters, letters in the right place)", max: sc.max, auto: sc.hit, detail: `word ${word} (${voice ? "read aloud" : "shown"}); expected ${sc.want}; answer ${sc.got || "-"}; ${sc.hit}/${sc.max} letters in place${sc.exact ? " (exact)" : ""}${repNote(S.replays.spelling)}`, verify: true });
    });
    if (E.reaction && E.reaction.on) xtSec("Simple reaction time", async () => {
      const r = await reactionTask(E.reaction.trials);
      const st = r.stats;
      addItem({ domain: XT, id: "reaction", label: `Simple reaction time (${st.n} trials)`, max: 0, metric: true, valueText: `median ${st.medianMs} ms`,
        metrics: [{ name: "reaction_median_ms", value: st.medianMs, unit: "ms" }, { name: "reaction_mean_ms", value: st.meanMs, unit: "ms" }, { name: "reaction_false_starts", value: st.falseStarts, unit: "count" }],
        detail: `median ${st.medianMs} ms, mean ${st.meanMs} ms, range ${st.minMs}-${st.maxMs} ms, false starts ${st.falseStarts}. Timing is limited by this device's screen and input latency, so compare only on the same device.`, data: { rts: r.rts, stats: st } });
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
    const dom = {}; let core = 0, ext = 0, extMax = 0, xt = 0, xtMax = 0, unscored = 0;
    for (const [d, max] of DOMAIN_ORDER) dom[d] = { score: 0, max };
    S.items.forEach((it) => {
      const sc = itemScore(it);
      if (it.auto == null && S.overrides[it.id] === undefined && it.manual) unscored++;
      if (dom[it.domain]) { dom[it.domain].score += sc; core += sc; }
      else if (it.domain === EX) { ext += sc; extMax += it.max; }
      else if (it.domain === XT && it.max > 0) { xt += sc; xtMax += it.max; }
    });
    const edu = S.eduAdj != null ? S.eduAdj : (S.settings.eduYears != null && S.settings.eduYears <= 12);
    const adj = edu && core < 30 ? 1 : 0;
    return { dom, core, adj, final: Math.min(30, core + adj), ext, extMax, xt, xtMax, unscored, edu };
  }

  function exportObject() {
    const t = totals(), mem = S.memory;
    return {
      tool: "Cognitive Exam v" + APP_VERSION + " (unvalidated; not diagnostic)",
      appVersion: APP_VERSION, platform: PLATFORM,
      sessionId: S.sess.id, participantId: S.sess.participantId || "",
      formName: S.form.name, formHash: S.formHash,
      formContents: C.exportForm(S.form),
      date: new Date().toISOString(), educationYears: S.settings.eduYears,
      extendedMode: S.settings.extended, totalMs: S.times.totalMs,
      scores: { raw30: t.core, educationAdjustment: t.adj, total30: t.final, extended: S.settings.extended ? { score: t.ext, max: t.extMax } : null, additionalMeasures: extraOn(S.form) ? { score: t.xt, max: t.xtMax } : null },
      domains: t.dom, memory: { trials: mem.trials, delayMs: mem.delayMs, cued: mem.cued },
      items: S.items.map((i) => ({ id: i.id, domain: i.domain, label: i.label, max: i.max, auto: i.auto, final: i.max > 0 ? itemScore(i) : null, metric: i.metric ? i.valueText : null, metrics: i.metrics, detail: i.detail, data: i.data || null })),
      voiceSettings: { readAloud: S.settings.voiceOut, voice: S.settings.voiceName, rate: S.settings.rate, replays: S.replays },
      clockRequested: S.meta.clockTime, fluencyLetter: S.meta.fluencyLetter, figure: S.form.shape, trailPattern: S.form.trail.pattern,
      digitsReadBy: S.meta.digitsExaminerRead ? "examiner (device speech unavailable or off)" : "device speech",
      drawings: S.drawings, examinerNotes: S.notes
    };
  }
  function csvText() {
    const o = exportObject();
    const head = ["session_id", "participant_id", "form_name", "form_hash", "app_version", "platform", "date", "domain", "item_id", "label", "max", "score", "metric_name", "metric_value", "metric_unit", "detail"];
    const base = [o.sessionId, o.participantId, o.formName, o.formHash, o.appVersion, o.platform, o.date];
    const rows = [head];
    o.items.forEach((i) => {
      rows.push(base.concat([i.domain, i.id, i.label, i.max > 0 ? i.max : "", i.max > 0 ? i.final : "", "", "", "", i.detail]));
      (i.metrics || []).forEach((m) => rows.push(base.concat([i.domain, i.id + ":" + m.name, i.label, "", "", m.name, m.value, m.unit, ""])));
    });
    const t = o.scores;
    rows.push(base.concat(["Totals", "total30", "Total /30 (with education adjustment)", 30, t.total30, "", "", "", `raw ${t.raw30}; education adjustment ${t.educationAdjustment}`]));
    if (t.extended) rows.push(base.concat(["Totals", "extended", "Extended section (separate)", t.extended.max, t.extended.score, "", "", "", ""]));
    if (t.additionalMeasures) rows.push(base.concat(["Totals", "additional", "Additional measures with a score (separate)", t.additionalMeasures.max, t.additionalMeasures.score, "", "", "", ""]));
    return C.toCSV(rows);
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function showReview() {
    clearInterval(clockTimer); cancelTTS();
    $("testScreen").classList.add("hidden"); syncVoiceToggle();
    const rs = $("reviewScreen"); rs.classList.remove("hidden");
    renderSteps("", new Set(domainList()));
    $("progressText").textContent = "Done";
    S.times.totalMs = Date.now() - S.startedAt;

    const body = h("div");
    const summary = h("div"); const tableHost = h("div");
    let refreshDom = () => {};
    const render = () => {
      refreshDom();
      const t = totals();
      const eduBox = h("div", { class: "checkline" });
      const cb = h("input", { type: "checkbox", name: token(), autocomplete: "off" }); cb.checked = !!t.edu;
      cb.addEventListener("change", () => { S.eduAdj = cb.checked; render(); });
      eduBox.append(cb, h("span", null, `Education adjustment: +1 point if \u226412 years of formal education${S.settings.eduYears != null ? ` (entered: ${S.settings.eduYears} years)` : " (not entered)"}`));
      summary.replaceChildren(...[
        t.unscored ? h("div", { class: "warn-box" }, `${t.unscored} drawing item(s) still need your scoring below (figure and clock). They count as 0 until scored.`) : null,
        h("div", { class: "summary-grid" },
          h("div", { class: "score-chip" }, h("span", null, "Total (/30)"), h("strong", { class: "big-score" }, String(t.final))),
          h("div", { class: "score-chip" }, h("span", null, "Raw score"), h("strong", null, `${t.core}/30`)),
          h("div", { class: "score-chip" }, h("span", null, "Education adjustment"), h("strong", null, `+${t.adj}`)),
          S.settings.extended ? h("div", { class: "score-chip" }, h("span", null, "Extended (separate)"), h("strong", null, `${t.ext}/${t.extMax}`)) : null,
          extraOn(S.form) && t.xtMax ? h("div", { class: "score-chip" }, h("span", null, "Additional measures (separate)"), h("strong", null, `${t.xt}/${t.xtMax}`)) : null),
        eduBox,
        h("p", null, "This exam is unvalidated: no cut-off score has been established for it, so the number above is not a diagnosis or a pass/fail result. Interpret only within a full clinical assessment."),
        h("p", { class: "small muted" }, "Informal cognitive exam. It has not been validated and is not diagnostic.")
      ].filter(Boolean));
    };
    render();

    const dTable = (domains) => {
      const rows = [];
      domains.forEach((d) => {
        const items = S.items.filter((i) => i.domain === d);
        if (!items.length) return;
        items.forEach((it, idx) => {
          let scoreCell;
          if (it.max > 0) {
            const sel = h("select", { name: token(), autocomplete: "off" });
            if (it.auto == null) sel.append(h("option", { value: "" }, "not scored"));
            for (let v = 0; v <= it.max; v++) sel.append(h("option", { value: String(v) }, String(v)));
            const cur = S.overrides[it.id] !== undefined ? S.overrides[it.id] : it.auto;
            sel.value = cur == null ? "" : String(cur);
            sel.addEventListener("change", () => { if (sel.value === "") delete S.overrides[it.id]; else S.overrides[it.id] = Number(sel.value); render(); });
            scoreCell = h("td", null, sel, ` / ${it.max}`, it.metric ? h("div", { class: "small muted" }, it.valueText) : null);
          } else scoreCell = h("td", null, h("strong", null, it.valueText || "-"), h("div", { class: "small muted" }, "reported, not scored"));
          rows.push(h("tr", null, h("td", null, idx === 0 ? d : ""), h("td", null, it.label, it.verify ? h("span", { class: "badge warn", style: "margin-left:6px" }, "verify") : null), scoreCell, h("td", { class: "det" }, it.detail)));
        });
      });
      return h("table", { class: "table" }, h("thead", null, h("tr", null, ...["Domain", "Item", "Score", "Detail"].map((x) => h("th", null, x)))), h("tbody", null, rows));
    };

    const fi = C.shapeInfo(S.form.shape);
    const thumbs = h("div", { class: "thumbs" },
      S.drawings.figure ? h("figure", null, h("img", { src: S.drawings.figure, alt: fi.label + " drawing" }), h("figcaption", null, fi.label + " copy")) : null,
      S.drawings.clock ? h("figure", null, h("img", { src: S.drawings.clock, alt: "clock drawing" }), h("figcaption", null, `Clock (requested: ${S.meta.clockTime})`)) : null);

    const mem = S.memory;
    const memInfo = h("div", { class: "review-item" }, h("h4", null, "Memory (learning trials, no points)"),
      h("p", { class: "small" }, mem.trials.map((x) => `Trial ${x.trial}: ${x.recalled}/5 words${x.readAloud ? " (read aloud)" : ""}${x.replays ? " (replayed " + x.replays + "\u00d7)" : ""}`).join(" \u00b7 ") +
        (mem.delayMs != null ? ` \u00b7 Delayed recall asked about ${fmt(mem.delayMs)} after learning` : "") +
        (mem.cued ? ` \u00b7 Hints for ${mem.cued.missed} missed word(s): category cue helped ${mem.cued.category}, multiple choice helped ${mem.cued.choice}` : "")));

    const notes = field(true, { label: "Examiner notes" }); notes.style.minHeight = "100px";
    notes.addEventListener("input", () => { S.notes = notes.value; });

    const dl = btn("Download results (JSON)"), dc = btn("Download item scores (CSV)"), pr = btn("Print"), again = btn("New session (next form)", "primary");
    dl.setAttribute("data-k", "dl-json"); dc.setAttribute("data-k", "dl-csv");
    dl.onclick = () => download("cognitive-exam-" + S.sess.id + "-results.json", JSON.stringify(exportObject(), null, 2), "application/json");
    dc.onclick = () => download("cognitive-exam-" + S.sess.id + "-scores.csv", csvText(), "text/csv");
    pr.onclick = () => window.print();
    again.onclick = () => restart();
    if (DEBUG) { DEBUG.exportObject = exportObject; DEBUG.csvText = csvText; }

    body.append(
      h("div", { class: "section-top" }, h("div", null, h("div", { class: "eyebrow" }, "Results"), h("h2", null, "Scoring summary"))),
      h("div", { class: "session-line small muted", "data-k": "session-line" }, `Form: ${S.form.name} \u00b7 hash ${S.formHash.slice(0, 12)} \u00b7 session ${S.sess.id} \u00b7 version ${APP_VERSION} \u00b7 platform ${PLATFORM === "ipad" ? "iPad" : "Windows"}${S.sess.participantId ? " \u00b7 participant " + S.sess.participantId : ""}`),
      summary,
      h("div", { class: "review-item" }, h("h4", null, "Per-domain breakdown"),
        h("table", { class: "table" }, h("thead", null, h("tr", null, h("th", null, "Domain"), h("th", null, "Score"))), h("tbody", { id: "domBody" }))),
      memInfo,
      h("div", { class: "review-item" }, h("h4", null, "Drawings: score here"), thumbs, h("p", { class: "small muted" }, fi.crit2 + " Clock: round contour; all 12 numbers in the right order and place; two hands at the requested time, hour hand shorter.")),
      h("div", { class: "review-item" }, h("h4", null, "Item scores (adjust any score if you judge it differently)"), tableHost),
      h("div", { class: "review-item" }, h("h4", null, "Examiner notes"), formOf(notes)),
      h("div", { class: "inline-actions" }, dl, dc, pr, again)
    );
    refreshDom = () => {
      const t = totals();
      const tb = body.querySelector("#domBody");
      tb.replaceChildren(...[...DOMAIN_ORDER.map(([d, m]) => h("tr", null, h("td", null, d), h("td", null, `${t.dom[d].score} / ${m}`))),
        h("tr", null, h("td", null, "Memory (learning trials)"), h("td", null, "not scored")),
        h("tr", null, h("td", null, h("strong", null, "Raw total")), h("td", null, h("strong", null, `${t.core} / 30`))),
        h("tr", null, h("td", null, "Education adjustment"), h("td", null, `+${t.adj}`)),
        h("tr", null, h("td", null, h("strong", null, "Final total")), h("td", null, h("strong", null, `${t.final} / 30`))),
        S.settings.extended ? h("tr", null, h("td", null, "Extended challenge (separate)"), h("td", null, `${t.ext} / ${t.extMax}`)) : null,
        extraOn(S.form) ? h("tr", null, h("td", null, "Additional measures (separate)"), h("td", null, t.xtMax ? `${t.xt} / ${t.xtMax} (plus reported measures)` : "reported measures only")) : null].filter(Boolean));
    };
    tableHost.replaceChildren(dTable(DOMAIN_ORDER.map((x) => x[0])));
    if (S.settings.extended) tableHost.append(h("h4", { style: "margin-top:16px" }, "Extended challenge (scored separately)"), dTable([EX]));
    if (extraOn(S.form)) tableHost.append(h("h4", { class: "addl-h", style: "margin-top:16px" }, "Additional measures (scored separately, outside the 30 points)"), dTable([XT]));
    rs.replaceChildren(body);
    render();
    if (DEBUG) DEBUG.totals = totals;
  }

  // ---------- setup, hand-over & flow ----------
  function syncVoiceToggle() {
    const vt = $("voiceToggle"); if (!vt) return;
    if (!TTSOK || !S || !S.startedAt || $("testScreen").classList.contains("hidden")) { vt.classList.add("hidden"); return; }
    vt.classList.remove("hidden");
    vt.textContent = S.settings.voiceOut ? "\uD83D\uDD0A Voice: on" : "\uD83D\uDD07 Voice: off";
  }
  $("voiceToggle").addEventListener("click", () => { if (!S) return; S.settings.voiceOut = !S.settings.voiceOut; syncVoiceToggle(); });

  let editor = null, setupNodes = [], pending = null, lastFormName = null;
  const OTHER = PLATFORM === "ipad" ? { href: "../windows/index.html", label: "Windows version" } : { href: "../ipad/index.html", label: "iPad version" };
  function platformHints() {
    const common = "Both versions use the same items, scoring and saved forms, so results stay comparable. Forms are stored per browser: export a form file to use it on the other device.";
    if (PLATFORM === "ipad") return h("div", { class: "hint-box", "data-k": "platform-hint" },
      h("strong", null, "iPad (Safari) tips"),
      h("ul", null,
        h("li", null, "Voice answers use Safari's Dictation: turn on Settings > General > Keyboard > Enable Dictation, and tap Allow when Safari asks for the microphone."),
        h("li", null, "Turn the volume up and make sure the side switch or Control Centre mute is off, or the read-aloud voice will be silent."),
        h("li", null, "Draw with a finger or Apple Pencil. The page does not scroll while you draw."),
        h("li", null, "Install: Share > Add to Home Screen, then open it from the icon (full screen)."),
        h("li", null, "Before handing the iPad over, start Guided Access (Settings > Accessibility > Guided Access, then triple-click the top button) so the examinee cannot leave this page.")),
      h("p", { class: "small muted" }, common + " "), h("a", { href: OTHER.href, class: "small" }, "Open the " + OTHER.label));
    return h("div", { class: "hint-box", "data-k": "platform-hint" },
      h("strong", null, "Windows (Chrome or Edge) tips"),
      h("ul", null,
        h("li", null, "Voice answers use the browser's Web Speech service (Chrome or Edge). Click Allow when asked for the microphone; an internet connection is needed for speech recognition."),
        h("li", null, "Open this page from its https:// address or start-exam.bat (http://localhost). A page opened as a file cannot use the microphone."),
        h("li", null, "Mouse and keyboard: Enter submits a one-line answer, Space is the TAP key, Ctrl+Z undoes the last drawing stroke, R B G Y answer the colour task."),
        h("li", null, "Press F11 (full screen) before handing the device over.")),
      h("p", { class: "small muted" }, common + " "), h("a", { href: OTHER.href, class: "small" }, "Open the " + OTHER.label));
  }

  function showSetup(initial) {
    const el = $("setupScreen");
    $("testScreen").classList.add("hidden"); $("reviewScreen").classList.add("hidden"); el.classList.remove("hidden");
    renderSteps("", new Set());
    $("elapsed").textContent = "0:00"; $("progressText").textContent = "\u2013";
    const names = (window.CESetup.store.names());
    const form = initial || C.defaultForm(names.length ? C.nextFormName(names[names.length - 1]) : "Form A");
    editor = window.CESetup.editor(form);
    if (DEBUG) { DEBUG.editor = editor; }
    const partId = field(false, { k: "participant", label: "Participant ID" });
    const partWarn = h("div", { class: "small warn-text", "data-k": "participant-warn" });
    partId.addEventListener("input", () => { partWarn.textContent = C.looksLikeName(partId.value) ? "This looks like a name or personal detail. Use a code instead (for example P-014)." : ""; });
    const edu = field(false, { numeric: true, k: "edu", label: "Years of formal education" });
    const micTest = field(false, { label: "Microphone check" });
    const stt = speechStatus();
    showBanner(stt.ok ? null : SPEECH_MSG[stt.why]);
    // --- read-aloud (speechSynthesis) settings ---
    const voiceCb = h("input", { type: "checkbox", name: token(), autocomplete: "off", "data-k": "voice-on" }); voiceCb.checked = TTSOK; voiceCb.disabled = !TTSOK;
    const voiceSel = h("select", { name: token(), autocomplete: "off", "aria-label": "Voice", "data-k": "voice-select" });
    const rate = h("input", { type: "range", min: "0.6", max: "1.2", step: "0.05", value: "0.9", name: token(), autocomplete: "off", "aria-label": "Speaking speed", "data-k": "voice-rate" });
    const rateOut = h("span", { class: "small muted" }, "0.90\u00d7");
    rate.addEventListener("input", () => { rateOut.textContent = parseFloat(rate.value).toFixed(2) + "\u00d7"; });
    const testBtn = btn("\u25B6 Test voice"); testBtn.disabled = !TTSOK; testBtn.setAttribute("data-k", "voice-test");
    const fillVoices = () => {
      const en = tts.voices.filter((v) => /^en/i.test(v.lang)); const list = en.length ? en : tts.voices;
      voiceSel.replaceChildren(...list.map((v) => h("option", { value: v.voiceURI }, `${v.name} (${v.lang})`)));
      if (tts.voice) voiceSel.value = tts.voice.voiceURI;
      voiceSel.disabled = !list.length;
    };
    tts.listeners.length = 0; tts.listeners.push(fillVoices); fillVoices();
    const applyVoice = () => { tts.voice = tts.voices.find((v) => v.voiceURI === voiceSel.value) || tts.voice; tts.rate = parseFloat(rate.value) || 0.9; };
    testBtn.addEventListener("click", async () => { applyVoice(); try { await speakOne("Testing. One, two, three."); } catch (e) { if (e !== CANCEL) throw e; } });
    const go = btn("Continue to the hand-over screen", "primary"); go.setAttribute("data-k", "continue");
    const summary = h("div", { class: "warn-box hidden", "data-k": "err-summary", role: "alert" });

    setupNodes = [
      h("h2", null, "Cognitive Exam: examiner setup"),
      h("p", { class: "muted" }, "About 15\u201320 minutes. You choose the items below (or press Randomize). When you press Continue the setup is hidden, so the examinee never sees the words, digits or sentences. Items disappear after they are shown and the examinee cannot go back."),
      h("div", { class: "warn-box" }, "Informal cognitive exam. It has not been validated and is not diagnostic. Best used with a clinician present: for example, a clinician can score spoken answers and judge the drawings."),
      platformHints(),
      h("div", { class: "review-item" }, h("h4", null, "Session"),
        formOf(
          h("div", { class: "field-row" }, h("label", null, "Participant ID (optional). Use a code. Do NOT type a name, date of birth or other identifying details."), partId, partWarn),
          h("div", { class: "field-row" }, h("label", null, "Years of formal education (optional; \u226412 adds 1 point)"), edu),
          h("div", { class: "field-row" }, h("label", null, stt.ok ? "Microphone check (optional): press Speak, allow the microphone if asked, and say \u201ctesting one two three\u201d. Speech is sent to your browser's cloud speech service: do not use real patient identifiers while testing." : "Voice answers are unavailable in this window (see the notice above). All items can be typed."), withMic(micTest, { single: true, append: false })))),
      editor.el,
      h("div", { class: "review-item" },
        h("h4", null, "Read stimuli aloud"),
        formOf(h("label", { class: "checkline" }, voiceCb, h("span", null, "Read the memory words, digits, letters, sentences and commands aloud (they are then not shown on screen)")),
          TTSOK ? h("div", { class: "field-row" }, h("label", null, "Voice (English US is chosen by default)"), voiceSel) : null,
          TTSOK ? h("div", { class: "field-row" }, h("label", null, "Speaking speed"), h("div", { class: "inline-actions" }, rate, rateOut, testBtn)) : null),
        h("p", { class: "small muted" }, TTSOK
          ? "Press \u201cTest voice\u201d first. Replaying an item is logged in the results. Digits are never shown on screen: if reading aloud is switched off, you read them aloud from an examiner-only panel."
          : "This browser cannot speak. Words, letters and sentences will be shown on screen; for digits you will read them aloud yourself from an examiner-only panel (they are never shown to the examinee).")),
      summary, h("div", { class: "actions" }, go)
    ];
    el.replaceChildren(...setupNodes);
    go.addEventListener("click", () => {
      const E = editor.validate();
      if (E.length) {
        summary.classList.remove("hidden");
        summary.replaceChildren(h("strong", null, "Please fix these before continuing:"), h("ul", null, E.slice(0, 8).map((e) => h("li", null, e.msg))));
        editor.focusPath(E[0].path); summary.scrollIntoView({ block: "center" });
        return;
      }
      applyVoice(); stopMic(); cancelTTS();
      const ey = parseInt(edu.value, 10);
      pending = { form: JSON.parse(JSON.stringify(editor.get())), participantId: partId.value.trim(), eduYears: Number.isNaN(ey) ? null : ey,
        voiceOut: TTSOK && voiceCb.checked, voiceName: tts.voice ? tts.voice.name : "", rate: tts.rate };
      showHandoff();
    });
    if (!IS_IOS && !(navigator.maxTouchPoints > 0)) partId.focus();
    syncVoiceToggle();
  }

  function showHandoff() {
    const el = $("setupScreen");
    const f = pending.form;
    const begin = btn("I am the examinee: begin the exam", "primary"); begin.setAttribute("data-k", "begin");
    const back = btn("Examiner: back to setup"); back.setAttribute("data-k", "back-to-setup");
    const guided = PLATFORM === "ipad" ? "On the iPad: start Guided Access now (triple-click the top button) so the exam cannot be left." : "On Windows: press F11 for full screen if you like.";
    el.replaceChildren(h("div", { class: "handoff", "data-k": "handoff" },
      h("div", { class: "handoff-icon" }, "\uD83E\uDD1D"),
      h("h2", null, "Hand the device to the examinee"),
      h("p", { class: "muted" }, "Setup is complete and now hidden: the words, digits and sentences you chose are not on this screen or anywhere on the exam pages."),
      h("ul", { class: "small" },
        h("li", null, guided),
        h("li", null, TTSOK && pending.voiceOut ? "The device will read the memory words, digits, letters and sentences aloud. Check the volume." : "Reading aloud is off: the words, sentences and letters will be shown on screen, and you will read the digits aloud yourself when asked."),
        h("li", null, `Form \u201c${f.name}\u201d \u00b7 platform ${PLATFORM === "ipad" ? "iPad" : "Windows"}.`)),
      h("p", null, "The examinee presses the big button below to start."),
      h("div", { class: "actions center" }, begin),
      h("div", { class: "actions center" }, back)));
    back.addEventListener("click", () => { el.replaceChildren(...setupNodes); });
    begin.addEventListener("click", () => {
      S = newState(pending.form, { id: C.sessionId(), participantId: pending.participantId, platform: PLATFORM });
      S.settings.eduYears = pending.eduYears; S.settings.voiceOut = pending.voiceOut; S.settings.voiceName = pending.voiceName; S.settings.rate = pending.rate;
      lastFormName = S.form.name;
      pending = null; editor = null; if (DEBUG) { DEBUG.editor = null; }
      setupNodes = []; wipe(el); el.replaceChildren(); el.classList.add("hidden");
      runSession();
    });
  }

  async function runSession() {
    const id = ++runId;
    S.startedAt = Date.now(); startClock();
    if (DEBUG) { DEBUG.state = S; DEBUG.runId = id; }
    $("testScreen").classList.remove("hidden"); syncVoiceToggle();
    const plan = buildPlan();
    const doneDomains = new Set();
    try {
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        if (i > 0 && plan[i - 1].domain !== p.domain) doneDomains.add(plan[i - 1].domain);
        renderSteps(p.domain, doneDomains);
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
    document.querySelectorAll("input,textarea").forEach((i) => { if (i.type !== "checkbox") i.value = ""; });
    view.replaceChildren(); $("reviewScreen").replaceChildren();
    const prev = S ? S.form.name : lastFormName;
    S = null;
    showSetup(C.defaultForm(prev ? C.nextFormName(prev) : "Form A"));
  }

  window.addEventListener("beforeunload", (e) => { if (S && S.startedAt && $("reviewScreen").classList.contains("hidden")) { e.preventDefault(); e.returnValue = ""; } });

  showSetup();
})();
