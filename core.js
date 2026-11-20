/* Cognitive Exam: item banks, form model, validation, hashing, figure geometry and small scoring helpers.
 * Pure logic (no DOM). Works in the browser (window.CECore) and in Node (module.exports) for unit tests.
 * Unvalidated informal tool: not diagnostic. All content is original. */
(function (root) {
  "use strict";
  const VERSION = "4.0";
  const SCHEMA = "cognitive-exam-form";

  // ---------- random helpers (rnd is injectable for deterministic tests) ----------
  let RND = Math.random;
  const setRandom = (f) => { RND = f || Math.random; };
  const rnd = (n) => Math.floor(RND() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const rint = (lo, hi) => lo + rnd(hi - lo + 1);

  // ---------- banks (all original) ----------
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
  // index matches window.CE_ART (neutral keys on purpose); names are only used for scoring accepted answers
  const ANIMALS = [
    { name: "elephant", ok: ["elephant"] }, { name: "giraffe", ok: ["giraffe"] }, { name: "zebra", ok: ["zebra"] },
    { name: "owl", ok: ["owl"] }, { name: "kangaroo", ok: ["kangaroo"] },
    { name: "hippo", ok: ["hippo", "hippopotamus", "river horse"] }, { name: "tortoise", ok: ["tortoise", "turtle"] },
    { name: "flamingo", ok: ["flamingo"] }, { name: "gorilla", ok: ["gorilla"] }
  ];
  // Abstraction pairs: kw are stems matched anywhere in the (lower-cased) answer.
  const PAIRS = [
    { a: "violin", b: "drum", kw: ["instrument", "music"], level: "core" },
    { a: "bridge", b: "tunnel", kw: ["cross", "pass", "route", "path", "way", "connect", "travel", "transport", "get over", "get through", "get across", "structure", "road"], level: "core" },
    { a: "candle", b: "lamp", kw: ["light", "illuminat", "bright"], level: "core" },
    { a: "umbrella", b: "raincoat", kw: ["rain", "dry", "wet", "weather", "protect"], level: "core" },
    { a: "newspaper", b: "radio", kw: ["news", "media", "inform", "communicat", "broadcast", "report"], level: "core" },
    { a: "fence", b: "wall", kw: ["barrier", "divid", "enclos", "boundar", "separat", "protect", "block"], level: "core" },
    { a: "scale", b: "thermometer", kw: ["measur", "instrument", "gauge", "tool", "device"], level: "core" },
    { a: "map", b: "compass", kw: ["navigat", "direction", "find", "guid", "way", "orient"], level: "core" },
    { a: "calendar", b: "clock", kw: ["time", "schedul", "date"], level: "core" },
    { a: "poem", b: "painting", kw: ["art", "creat", "express", "imagin"], level: "core" },
    { a: "salt", b: "sugar", kw: ["season", "flavor", "flavour", "food", "ingredient", "cook", "taste", "kitchen", "crystal", "spice"], level: "core" },
    { a: "key", b: "password", kw: ["unlock", "access", "secur", "open", "lock", "enter"], level: "core" },
    { a: "ladder", b: "staircase", kw: ["climb", "step", "height", "reach", "up", "higher", "rung"], level: "core" },
    { a: "freedom", b: "justice", kw: ["right", "value", "ideal", "principle", "virtue", "moral", "concept", "democra", "abstract", "society"], level: "hard" },
    { a: "ripple", b: "echo", kw: ["wave", "spread", "reverb", "propagat", "travel", "vibrat", "bounce", "repeat"], level: "hard" },
    { a: "treaty", b: "handshake", kw: ["agree", "peace", "connect", "bond", "trust", "unite", "commit", "promise", "deal"], level: "hard" },
    { a: "compass", b: "conscience", kw: ["guid", "direction", "navigat", "steer"], level: "hard" },
    { a: "seed", b: "spark", kw: ["start", "begin", "origin", "source", "ignit", "grow", "cause"], level: "hard" },
    { a: "umpire", b: "judge", kw: ["decid", "rule", "referee", "fair", "authorit", "impartial", "officiat", "verdict", "arbitr"], level: "hard" }
  ];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pairRegex = (kw) => new RegExp((kw && kw.length ? kw : ["\u0000"]).map((k) => esc(String(k).toLowerCase().trim())).filter(Boolean).join("|") || "\u0000", "i");

  // ---------- alternating-trail patterns ----------
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const TRAIL_PATTERNS = [
    { id: "numlet", label: "Numbers and letters (1, A, 2, B ...)", max: 26 },
    { id: "plantanimal", label: "Plants and animals (plant, animal, plant ...)", max: 8 },
    { id: "numday", label: "Numbers and weekdays (1, Mon, 2, Tue ...)", max: 7 },
    { id: "nummonth", label: "Numbers and months (1, Jan, 2, Feb ...)", max: 12 }
  ];
  // simple original line icons, 40x40 viewBox (stroke only)
  const PLANT_ICONS = [
    { id: "tulip", d: '<path d="M20 36V21"/><path d="M13 8c0 8 3 13 7 13s7-5 7-13l-4 3-3-5-3 5z"/><path d="M20 31c-5 0-8-2-9-5 5 0 8 1 9 5z"/>' },
    { id: "pine", d: '<path d="M20 4 11 15h5L8 26h9v9h6v-9h9l-8-11h5z"/>' },
    { id: "leaf", d: '<path d="M8 32C6 16 18 6 33 7c1 15-8 27-25 25z"/><path d="M8 32 26 14"/>' },
    { id: "cactus", d: '<path d="M16 36V12a4 4 0 0 1 8 0v24z"/><path d="M16 25h-4a3 3 0 0 1-3-3v-6"/><path d="M24 21h4a3 3 0 0 0 3-3v-5"/>' },
    { id: "daisy", d: '<circle cx="20" cy="14" r="3"/><circle cx="20" cy="7" r="3.4"/><circle cx="26.5" cy="10.5" r="3.4"/><circle cx="26.5" cy="17.5" r="3.4"/><circle cx="20" cy="21" r="3.4"/><circle cx="13.5" cy="17.5" r="3.4"/><circle cx="13.5" cy="10.5" r="3.4"/><path d="M20 24v13"/>' },
    { id: "clover", d: '<circle cx="14" cy="13" r="6"/><circle cx="26" cy="13" r="6"/><circle cx="20" cy="22" r="6"/><path d="M20 27c0 5 1 7 3 10"/>' },
    { id: "sprout", d: '<path d="M20 36V21"/><path d="M20 24c-8 1-12-4-12-10 7 0 12 3 12 10z"/><path d="M20 20c0-6 4-10 11-10 0 7-4 10-11 10z"/>' },
    { id: "tree", d: '<circle cx="20" cy="15" r="10"/><path d="M20 25v11"/><path d="M20 31l-5-4M20 29l5-4"/>' }
  ];
  const ANIMAL_ICONS = [
    { id: "fish", d: '<path d="M5 20c6-9 17-9 24 0-7 9-18 9-24 0z"/><path d="M29 20l7-6v12z"/><circle cx="12" cy="18" r="1.3"/>' },
    { id: "bird", d: '<ellipse cx="17" cy="25" rx="11" ry="8"/><circle cx="27" cy="14" r="5"/><path d="M31 13l6 2-6 2"/><path d="M7 23l-4-4M7 27l-5 1"/><circle cx="28" cy="13" r="1"/>' },
    { id: "cat", d: '<path d="M8 15 8 4l7 5h10l7-5v11c3 8-3 19-12 19S5 23 8 15z"/><circle cx="15" cy="19" r="1.4"/><circle cx="25" cy="19" r="1.4"/><path d="M18 25l2 2 2-2"/><path d="M4 22l6 1M4 27l6-2M36 22l-6 1M36 27l-6-2"/>' },
    { id: "dog", d: '<path d="M12 9c-6-2-8 7-7 13 3 0 5-3 6-6"/><path d="M28 9c6-2 8 7 7 13-3 0-5-3-6-6"/><path d="M12 9h16c2 12 1 25-8 25s-10-13-8-25z"/><circle cx="16" cy="18" r="1.4"/><circle cx="24" cy="18" r="1.4"/><ellipse cx="20" cy="26" rx="3" ry="2"/>' },
    { id: "rabbit", d: '<ellipse cx="14" cy="9" rx="3" ry="8"/><ellipse cx="26" cy="9" rx="3" ry="8"/><circle cx="20" cy="26" r="10"/><circle cx="16.5" cy="24" r="1.3"/><circle cx="23.5" cy="24" r="1.3"/><path d="M18.5 29h3"/>' },
    { id: "snail", d: '<path d="M4 34h30c2 0 3-2 3-5"/><circle cx="22" cy="21" r="9"/><circle cx="22" cy="21" r="4"/><path d="M4 34c0-6 2-9 5-9h4"/><path d="M7 25v-7M11 25v-6"/>' },
    { id: "butterfly", d: '<path d="M20 12v22"/><path d="M20 20C12 6 4 10 6 18c1 5 9 5 14 2z"/><path d="M20 23c-8 13-14 8-12 3 1-3 8-4 12-3z"/><path d="M20 20c8-14 16-10 14-2-1 5-9 5-14 2z"/><path d="M20 23c8 13 14 8 12 3-1-3-8-4-12-3z"/><path d="M20 12l-4-6M20 12l4-6"/>' },
    { id: "turtle", d: '<path d="M7 28c0-10 6-16 13-16s13 6 13 16z"/><path d="M7 28h26M14 28c0-6 2-12 6-16 4 4 6 10 6 16"/><circle cx="35" cy="23" r="3"/><path d="M11 28v4M29 28v4"/>' }
  ];
  function trailMax(pattern) { return (TRAIL_PATTERNS.find((p) => p.id === pattern) || TRAIL_PATTERNS[0]).max; }
  // returns [{ key, kind: "text"|"plant"|"animal", text?, icon?, rank?, label }] in the order they must be tapped
  function trailSequence(pattern, pairs) {
    const n = Math.min(pairs, trailMax(pattern)), seq = [];
    if (pattern === "plantanimal") {
      const pl = shuffle(PLANT_ICONS).slice(0, n), an = shuffle(ANIMAL_ICONS).slice(0, n);
      for (let i = 0; i < n; i++) {
        seq.push({ key: "P" + (i + 1), kind: "plant", icon: pl[i].id, d: pl[i].d, rank: i + 1, label: "plant " + (i + 1) });
        seq.push({ key: "A" + (i + 1), kind: "animal", icon: an[i].id, d: an[i].d, rank: i + 1, label: "animal " + (i + 1) });
      }
      return seq;
    }
    for (let i = 1; i <= n; i++) {
      const second = pattern === "numday" ? WEEKDAYS[i - 1] : pattern === "nummonth" ? MONTHS[i - 1] : String.fromCharCode(64 + i);
      seq.push({ key: String(i), kind: "text", text: String(i), label: String(i) });
      seq.push({ key: second, kind: "text", text: second, label: second });
    }
    return seq;
  }

  // ---------- 3-D wire-frame figures (all edges drawn, no hidden-line removal) ----------
  const SHAPES = [
    { id: "cube", label: "Cube", criteria: "Cube copy (3-D, all 12 edges, parallel, equal)", crit2: "Cube: all 12 edges present, 3-D, lines roughly parallel and equal.", edges: 12 },
    { id: "prism3", label: "Triangular prism", criteria: "Triangular prism copy (3-D, 9 edges: two triangles joined by 3 parallel edges)", crit2: "Triangular prism: two triangles of the same size joined by three parallel edges (9 edges), 3-D.", edges: 9 },
    { id: "pyramid", label: "Square pyramid", criteria: "Square pyramid copy (square base, apex joined to all 4 corners, 8 edges)", crit2: "Square pyramid: a four-sided base with the apex joined to all four corners (8 edges), 3-D.", edges: 8 },
    { id: "prism6", label: "Hexagonal prism", criteria: "Hexagonal prism copy (3-D, 18 edges: two hexagons joined by 6 parallel edges)", crit2: "Hexagonal prism: two hexagons of the same size joined by six parallel edges (18 edges), 3-D.", edges: 18 }
  ];
  function rot(v, yaw, pitch) {
    const [x, y, z] = v;
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    return [x1, y2];
  }
  function figure(shape) {
    const W = 300;
    let pts, edges;
    if (shape === "cube") {
      const dirs = [[62, -48], [-62, -48], [58, 52], [-58, 52]];
      const [dx, dy] = pick(dirs), sz = 110;
      const x0 = (W - (sz + Math.abs(dx))) / 2 + (dx < 0 ? -dx : 0), y0 = (W - (sz + Math.abs(dy))) / 2 + (dy < 0 ? -dy : 0);
      const f = [[x0, y0], [x0 + sz, y0], [x0 + sz, y0 + sz], [x0, y0 + sz]];
      pts = f.concat(f.map(([x, y]) => [x + dx, y + dy]));
      edges = [];
      for (let i = 0; i < 4; i++) edges.push([i, (i + 1) % 4], [4 + i, 4 + (i + 1) % 4], [i, 4 + i]);
      return { w: W, h: W, pts, edges, shape };
    }
    let v3;
    if (shape === "prism3") {
      const tri = [[-1, -0.8], [1, -0.8], [0, 0.9]];
      v3 = tri.map(([x, z]) => [x, -0.8, z]).concat(tri.map(([x, z]) => [x, 0.8, z]));
      edges = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]];
    } else if (shape === "pyramid") {
      v3 = [[-1, 0.8, -1], [1, 0.8, -1], [1, 0.8, 1], [-1, 0.8, 1], [0, -1.1, 0]];
      edges = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]];
    } else if (shape === "prism6") {
      const hex = Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
      v3 = hex.map(([x, z]) => [x, -0.8, z]).concat(hex.map(([x, z]) => [x, 0.8, z]));
      edges = [];
      for (let i = 0; i < 6; i++) edges.push([i, (i + 1) % 6], [6 + i, 6 + (i + 1) % 6], [i, 6 + i]);
    } else throw new Error("unknown shape " + shape);
    const yaw = (pick([-1, 1])) * (rint(25, 60) * Math.PI / 180), pitch = (pick([-1, 1])) * (rint(18, 38) * Math.PI / 180);
    const p = v3.map((v) => rot(v, yaw, pitch));
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const sc = 210 / Math.max(maxx - minx, maxy - miny);
    pts = p.map(([x, y]) => [W / 2 + (x - (minx + maxx) / 2) * sc, W / 2 + (y - (miny + maxy) / 2) * sc]);
    return { w: W, h: W, pts, edges, shape };
  }
  const shapeInfo = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];

  // ---------- optional-section helpers ----------
  const STROOP_COLORS = [{ id: "red", label: "RED", hex: "#d62828" }, { id: "blue", label: "BLUE", hex: "#1d4ed8" }, { id: "green", label: "GREEN", hex: "#15803d" }, { id: "yellow", label: "YELLOW", hex: "#b7791f" }];
  // incongruent trials only (word never matches its ink), no immediate repeat of the same ink
  function stroopTrials(n) {
    const out = [];
    while (out.length < n) {
      const ink = pick(STROOP_COLORS), word = pick(STROOP_COLORS.filter((c) => c.id !== ink.id));
      if (out.length && out[out.length - 1].ink === ink.id) continue;
      out.push({ word: word.id, ink: ink.id });
    }
    return out;
  }
  function median(a) {
    const b = a.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((x, y) => x - y);
    if (!b.length) return null;
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
  function stroopStats(trials) { // [{ correct, rt }]
    const okRt = trials.filter((t) => t.correct).map((t) => t.rt);
    const c = trials.filter((t) => t.correct).length;
    return { n: trials.length, correct: c, accuracyPct: trials.length ? Math.round(1000 * c / trials.length) / 10 : null, meanRtCorrectMs: okRt.length ? Math.round(mean(okRt)) : null, meanRtAllMs: trials.length ? Math.round(mean(trials.map((t) => t.rt))) : null, medianRtCorrectMs: okRt.length ? Math.round(median(okRt)) : null };
  }
  function reactionStats(rts, falseStarts) {
    const r = rts.slice();
    return { n: r.length, medianMs: r.length ? Math.round(median(r)) : null, meanMs: r.length ? Math.round(mean(r)) : null, minMs: r.length ? Math.round(Math.min(...r)) : null, maxMs: r.length ? Math.round(Math.max(...r)) : null, falseStarts: falseStarts || 0 };
  }
  const CMD_SHAPES = ["circle", "square", "triangle", "star"];
  const CMD_COLORS = [{ id: "red", hex: "#d62828" }, { id: "blue", hex: "#1d4ed8" }, { id: "green", hex: "#15803d" }, { id: "yellow", hex: "#e0a800" }];
  const stepKey = (s) => s.color + " " + s.shape;
  function randomCommand() {
    const all = []; CMD_COLORS.forEach((c) => CMD_SHAPES.forEach((s) => all.push({ color: c.id, shape: s })));
    return sample(all, 3);
  }
  function commandText(steps) { return "Tap the " + steps.map(stepKey).join(", then the ") + "."; }
  // 6 tap targets: the 3 command items plus 3 other distinct colour/shape combinations, shuffled
  function commandTargets(steps) {
    const have = new Set(steps.map(stepKey)); const all = [];
    CMD_COLORS.forEach((c) => CMD_SHAPES.forEach((s) => { if (!have.has(c.id + " " + s)) all.push({ color: c.id, shape: s }); }));
    return shuffle(steps.map((s) => ({ color: s.color, shape: s.shape })).concat(sample(all, 3)));
  }
  function scoreCommand(taps, steps) { // taps: [{color, shape}] in order; one point per step done in the right order
    let score = 0; const per = [];
    steps.forEach((s, i) => { const t = taps[i]; const ok = !!t && t.color === s.color && t.shape === s.shape; per.push(ok); if (ok) score++; });
    return { score, per };
  }
  function scoreSpelling(answer, word) { // letters in the right position of the reversed word
    const want = String(word).toUpperCase().split("").reverse().join(""), got = String(answer || "").toUpperCase().replace(/[^A-Z]/g, "");
    let hit = 0; for (let i = 0; i < want.length; i++) if (got[i] === want[i]) hit++;
    return { want, got, hit, max: want.length, exact: got === want };
  }
  const reverseOf = (w) => String(w).toUpperCase().split("").reverse().join("");

  // ---------- digits ----------
  function randomDigits(n) {
    const d = [];
    while (d.length < n) {
      const x = rnd(10), l = d.length;
      if (l && d[l - 1] === x) continue;
      if (l >= 2 && Math.abs(d[l - 1] - d[l - 2]) === 1 && Math.abs(x - d[l - 1]) === 1 && (x - d[l - 1]) === (d[l - 1] - d[l - 2])) continue;
      d.push(x);
    }
    return d.join("");
  }

  // ---------- the form ----------
  function memItem(cat, word) {
    const w = word || pick(cat.words);
    return { word: w, cue: cat.cue, distractors: sample(cat.words.filter((x) => x !== w), 2) };
  }
  function randomMemory(nCore, nExt) {
    const cats = shuffle(WORD_CATS);
    return { core: cats.slice(0, nCore).map((c) => memItem(c)), ext: cats.slice(nCore, nCore + nExt).map((c) => memItem(c)) };
  }
  const randomNaming = () => sample(ANIMALS.map((_, i) => i), 3).map((i) => ({ art: i, accept: ANIMALS[i].ok.slice() }));
  const randomAbstraction = (level) => sample(PAIRS.filter((p) => p.level === level), 2).map((p) => ({ a: p.a, b: p.b, kw: p.kw.slice() }));
  function randomCommandSteps() { return randomCommand(); }
  function defaultForm(name) {
    const m = randomMemory(5, 7);
    return {
      name: name || "Form A",
      trail: { pattern: "numlet" },
      shape: "cube",
      extendedOn: false,
      naming: randomNaming(),
      memory: m.core,
      digitsFwd: randomDigits(5), digitsBwd: randomDigits(3),
      serialStart: rint(80, 100),
      sentences: sample(SENTENCES, 2),
      fluencyLetter: pick(FLUENCY_LETTERS),
      abstraction: randomAbstraction("core"),
      ext: { memory: m.ext, digitsFwd: randomDigits(7), digitsBwd: randomDigits(5), serialStart: rint(150, 199), abstraction: randomAbstraction("hard") },
      extra: {
        catFluency: { on: false, threshold: null },
        stroop: { on: false, trials: 20 },
        command: { on: false, steps: randomCommand() },
        spelling: { on: false, word: "WORLD" },
        reaction: { on: false, trials: 10 }
      }
    };
  }
  function nextFormName(name) {
    const m = /^(.*?)([A-Z])$/.exec(String(name || "").trim());
    if (m && m[2] !== "Z") return m[1] + String.fromCharCode(m[2].charCodeAt(0) + 1);
    const n = /^(.*?)(\d+)$/.exec(String(name || "").trim());
    return n ? n[1] + (parseInt(n[2], 10) + 1) : (String(name || "Form").trim() || "Form") + " 2";
  }

  // ---------- validation ----------
  const wordRe = /^[A-Za-z][A-Za-z'\- ]{0,29}$/;
  const wc = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
  function validateForm(f) {
    const E = []; const err = (path, msg) => E.push({ path, msg });
    const memCheck = (arr, n, base, label) => {
      if (!Array.isArray(arr) || arr.length !== n) { err(base, `${label}: exactly ${n} words are needed.`); return; }
      arr.forEach((m, i) => {
        if (!m || !wordRe.test(String(m.word || "").trim())) err(`${base}.${i}.word`, `${label} word ${i + 1}: enter a single word (letters only).`);
        else if (String(m.word).trim().includes(" ")) err(`${base}.${i}.word`, `${label} word ${i + 1}: use a single word (no spaces).`);
        (m.distractors || []).forEach((d, k) => { if (String(d).trim() && !wordRe.test(String(d).trim())) err(`${base}.${i}.distractors.${k}`, `${label} word ${i + 1}: distractor ${k + 1} must be a word.`); if (String(d).trim().toLowerCase() === String(m.word).trim().toLowerCase()) err(`${base}.${i}.distractors.${k}`, `${label} word ${i + 1}: a distractor equals the word itself.`); });
      });
      const ws = arr.map((m) => String((m && m.word) || "").trim().toLowerCase()).filter(Boolean);
      if (new Set(ws).size !== ws.length) err(base, `${label}: words must all be different.`);
    };
    if (!f || typeof f !== "object") return [{ path: "", msg: "Not a form." }];
    if (!String(f.name || "").trim()) err("name", "Give the form a name (for example Form A).");
    if (!TRAIL_PATTERNS.some((p) => p.id === (f.trail || {}).pattern)) err("trail.pattern", "Choose a trail pattern.");
    if (!SHAPES.some((s) => s.id === f.shape)) err("shape", "Choose a figure to copy.");
    if (!Array.isArray(f.naming) || f.naming.length !== 3) err("naming", "Choose exactly 3 animals.");
    else {
      f.naming.forEach((n, i) => { if (!Number.isInteger(n.art) || n.art < 0 || n.art >= ANIMALS.length) err(`naming.${i}`, `Animal ${i + 1}: pick a picture.`); if (!Array.isArray(n.accept) || !n.accept.some((x) => String(x).trim())) err(`naming.${i}.accept`, `Animal ${i + 1}: at least one accepted answer is needed.`); });
      if (new Set(f.naming.map((n) => n.art)).size !== 3) err("naming", "Choose 3 different animals.");
    }
    memCheck(f.memory, 5, "memory", "Memory");
    const digs = (v, n, path, label) => { if (!/^\d+$/.test(String(v || "")) || String(v).length !== n) err(path, `${label}: type exactly ${n} digits (0-9 only).`); };
    digs(f.digitsFwd, 5, "digitsFwd", "Digits forward"); digs(f.digitsBwd, 3, "digitsBwd", "Digits backward");
    if (!Number.isInteger(f.serialStart) || f.serialStart < 20 || f.serialStart > 200) err("serialStart", "Serial 7s starting number must be a whole number from 20 to 200.");
    if (!Array.isArray(f.sentences) || f.sentences.length !== 2) err("sentences", "Two sentences are needed.");
    else {
      f.sentences.forEach((s, i) => { const n = wc(s || ""); if (n < 3 || n > 25) err(`sentences.${i}`, `Sentence ${i + 1}: use between 3 and 25 words.`); });
      if (String(f.sentences[0]).trim().toLowerCase() === String(f.sentences[1]).trim().toLowerCase()) err("sentences", "The two sentences must be different.");
    }
    if (!/^[A-Za-z]$/.test(String(f.fluencyLetter || ""))) err("fluencyLetter", "Pick one letter (A-Z) for letter fluency.");
    const absCheck = (arr, base, label) => {
      if (!Array.isArray(arr) || arr.length !== 2) { err(base, `${label}: two pairs are needed.`); return; }
      arr.forEach((p, i) => { if (!String(p.a || "").trim() || !String(p.b || "").trim()) err(`${base}.${i}`, `${label} pair ${i + 1}: both items are needed.`); if (!Array.isArray(p.kw) || !p.kw.some((k) => String(k).trim())) err(`${base}.${i}.kw`, `${label} pair ${i + 1}: list at least one accepted keyword.`); });
      if (arr[0] && arr[1] && String(arr[0].a).toLowerCase() === String(arr[1].a).toLowerCase() && String(arr[0].b).toLowerCase() === String(arr[1].b).toLowerCase()) err(base, `${label}: the two pairs must be different.`);
    };
    absCheck(f.abstraction, "abstraction", "Abstraction");
    const x = f.ext || {};
    memCheck(x.memory, 7, "ext.memory", "Extended memory");
    if (Array.isArray(x.memory) && Array.isArray(f.memory)) { const a = new Set(f.memory.map((m) => String(m.word).trim().toLowerCase())); x.memory.forEach((m, i) => { if (a.has(String(m.word).trim().toLowerCase())) err(`ext.memory.${i}.word`, `Extended word ${i + 1} repeats a core word.`); }); }
    digs(x.digitsFwd, 7, "ext.digitsFwd", "Extended digits forward"); digs(x.digitsBwd, 5, "ext.digitsBwd", "Extended digits backward");
    if (!Number.isInteger(x.serialStart) || x.serialStart < 30 || x.serialStart > 300) err("ext.serialStart", "Extended serial 13s starting number must be a whole number from 30 to 300.");
    absCheck(x.abstraction, "ext.abstraction", "Extended abstraction");
    const e = f.extra || {};
    if (e.catFluency && e.catFluency.on && e.catFluency.threshold != null && (!Number.isInteger(e.catFluency.threshold) || e.catFluency.threshold < 1 || e.catFluency.threshold > 60)) err("extra.catFluency.threshold", "Category fluency threshold: a whole number from 1 to 60, or leave blank for none.");
    if (e.stroop && e.stroop.on && (!Number.isInteger(e.stroop.trials) || e.stroop.trials < 10 || e.stroop.trials > 40)) err("extra.stroop.trials", "Stroop trials: 10 to 40.");
    if (e.reaction && e.reaction.on && (!Number.isInteger(e.reaction.trials) || e.reaction.trials < 5 || e.reaction.trials > 20)) err("extra.reaction.trials", "Reaction time trials: 5 to 20.");
    if (e.spelling && e.spelling.on && !/^[A-Za-z]{5}$/.test(String(e.spelling.word || ""))) err("extra.spelling.word", "Reverse spelling: type a word with exactly 5 letters.");
    if (e.command && e.command.on) {
      const st = e.command.steps;
      if (!Array.isArray(st) || st.length !== 3 || st.some((s) => !CMD_SHAPES.includes(s.shape) || !CMD_COLORS.some((c) => c.id === s.color))) err("extra.command.steps", "Command following: choose a shape and colour for each of the 3 steps.");
      else if (new Set(st.map(stepKey)).size !== 3) err("extra.command.steps", "Command following: the 3 steps must be different.");
    }
    return E;
  }

  // ---------- SHA-256 (sync, pure JS) and form hash ----------
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(str) {
    const bytes = new TextEncoder().encode(str), l = bytes.length;
    const total = (((l + 9 + 63) >> 6) << 6), buf = new Uint8Array(total);
    buf.set(bytes); buf[l] = 0x80;
    const dv = new DataView(buf.buffer); dv.setUint32(total - 8, Math.floor(l * 8 / 4294967296)); dv.setUint32(total - 4, (l * 8) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
    const R = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = R(w[i - 15], 7) ^ R(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = R(w[i - 2], 17) ^ R(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = R(e, 6) ^ R(e, 11) ^ R(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = R(a, 2) ^ R(a, 13) ^ R(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, "0")).join("");
  }
  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  // normalised copy: trims text, the form NAME is excluded from the hash (the name is only a label)
  function normalizeForm(f) {
    const c = JSON.parse(JSON.stringify(f)); delete c.name;
    const t = (s) => String(s == null ? "" : s).trim();
    c.memory.forEach((m) => { m.word = t(m.word).toLowerCase(); m.cue = t(m.cue); m.distractors = (m.distractors || []).map(t).filter(Boolean).map((x) => x.toLowerCase()); });
    c.ext.memory.forEach((m) => { m.word = t(m.word).toLowerCase(); m.cue = t(m.cue); m.distractors = (m.distractors || []).map(t).filter(Boolean).map((x) => x.toLowerCase()); });
    c.sentences = c.sentences.map(t);
    c.fluencyLetter = t(c.fluencyLetter).toUpperCase();
    c.naming.forEach((n) => { n.accept = n.accept.map((x) => t(x).toLowerCase()).filter(Boolean); });
    [c.abstraction, c.ext.abstraction].forEach((arr) => arr.forEach((p) => { p.a = t(p.a).toLowerCase(); p.b = t(p.b).toLowerCase(); p.kw = p.kw.map((x) => t(x).toLowerCase()).filter(Boolean); }));
    if (c.extra.spelling) c.extra.spelling.word = t(c.extra.spelling.word).toUpperCase();
    return c;
  }
  const formHash = (f) => sha256(canonical(normalizeForm(f)));
  function exportForm(f) { return { schema: SCHEMA, schemaVersion: 1, appVersion: VERSION, name: f.name, formHash: formHash(f), items: normalizeForm(f) }; }
  // returns { form } or { error }
  function importForm(text) {
    let o; try { o = typeof text === "string" ? JSON.parse(text) : text; } catch (_) { return { error: "That file is not valid JSON." }; }
    if (!o || o.schema !== SCHEMA || !o.items) return { error: "That file is not a Cognitive Exam form." };
    const f = Object.assign({}, o.items, { name: String(o.name || "Imported form") });
    const base = defaultForm(f.name); // fill in anything a newer/older file lacks
    const merged = Object.assign({}, base, f, { ext: Object.assign({}, base.ext, f.ext || {}), extra: Object.assign({}, base.extra, f.extra || {}) });
    const errs = validateForm(merged);
    if (errs.length) return { error: "The form has problems: " + errs.map((e) => e.msg).join(" ") };
    if (o.formHash && o.formHash !== formHash(merged)) return { error: "The form file was changed after export (hash mismatch)." };
    return { form: merged };
  }

  // ---------- distractors for the multiple-choice hint round ----------
  function mcOptions(item) {
    const typed = (item.distractors || []).map((x) => String(x).trim()).filter(Boolean);
    const w = String(item.word).trim();
    const lw = w.toLowerCase();
    const cat = WORD_CATS.find((c) => c.words.includes(lw)) || WORD_CATS.find((c) => c.cue === item.cue);
    const pool = (cat ? cat.words : WORD_CATS.flatMap((c) => c.words)).filter((x) => x !== lw && !typed.map((t) => t.toLowerCase()).includes(x));
    const d = typed.slice(0, 2); const fill = shuffle(pool);
    while (d.length < 2 && fill.length) d.push(fill.pop());
    return shuffle([w].concat(d));
  }

  // ---------- CSV ----------
  function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  function sessionId() { const a = new Uint8Array(6); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = rnd(256))); return "S" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Array.from(a, (x) => x.toString(16).padStart(2, "0")).join(""); }
  const looksLikeName = (s) => { const t = String(s || "").trim(); return /\s/.test(t) && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(t) || /^[A-Z][a-z]+,\s*[A-Z]/.test(t) || /@|\d{3}[-.\s]\d{3,4}|\b\d{2}\/\d{2}\/\d{2,4}\b/.test(t); };

  const api = {
    VERSION, SCHEMA, setRandom, rnd, pick, shuffle, sample, rint,
    WORD_CATS, SENTENCES, FLUENCY_LETTERS, ANIMALS, PAIRS, pairRegex, TRAIL_PATTERNS, PLANT_ICONS, ANIMAL_ICONS, WEEKDAYS, MONTHS, trailMax, trailSequence,
    SHAPES, shapeInfo, figure, STROOP_COLORS, stroopTrials, stroopStats, reactionStats, median, mean, CMD_SHAPES, CMD_COLORS, stepKey, randomCommand, commandText, commandTargets, scoreCommand, scoreSpelling, reverseOf,
    randomDigits, randomMemory, randomNaming, randomAbstraction, memItem, defaultForm, nextFormName, validateForm, sha256, canonical, normalizeForm, formHash, exportForm, importForm, mcOptions, toCSV, sessionId, looksLikeName
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CECore = api;
})(typeof window !== "undefined" ? window : globalThis);
