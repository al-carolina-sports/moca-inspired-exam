/* Pure speech-transcript helpers for the Cognitive Exam (no DOM, no answers).
 * Works in the browser (window.CESpeech) and in Node (module.exports) for unit tests. */
(function (root) {
  "use strict";

  const DIGIT_WORDS = { zero: 0, oh: 0, o: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, fore: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9 };
  const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const ORDINALS = { first: "one", second: "two", third: "three", fourth: "four", fifth: "five", sixth: "six", seventh: "seven", eighth: "eight", ninth: "nine", tenth: "ten", eleventh: "eleven", twelfth: "twelve", thirteenth: "thirteen", fourteenth: "fourteen", fifteenth: "fifteen", sixteenth: "sixteen", seventeenth: "seventeen", eighteenth: "eighteen", nineteenth: "nineteen", twentieth: "twenty", thirtieth: "thirty" };

  function norm(text) {
    return String(text || "").toLowerCase().replace(/[-\u2010-\u2015]/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map((t) => ORDINALS[t] || t);
  }

  // "seven two eight one" / "7 2 8 1" / "7281" / "seven to eight won" -> "7281"
  function spokenDigits(text) {
    let out = "";
    String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((tok) => {
      if (/^\d+$/.test(tok)) out += tok;
      else if (Object.prototype.hasOwnProperty.call(DIGIT_WORDS, tok)) out += String(DIGIT_WORDS[tok]);
    });
    return out;
  }

  function parseWords(tokens) { // tokens -> number or null (first number found)
    let total = 0, cur = 0, found = false;
    for (const t of tokens) {
      if (/^\d+$/.test(t)) { if (found) break; return parseInt(t, 10); }
      if (Object.prototype.hasOwnProperty.call(UNITS, t)) { if (found && cur % 10 !== 0 && cur > 0 && cur < 100 && !(cur >= 20 && UNITS[t] < 10 && cur % 10 === 0)) break; cur += UNITS[t]; found = true; }
      else if (Object.prototype.hasOwnProperty.call(TENS, t)) { if (found && cur % 100 !== 0 && cur !== 0 && cur < 100) break; cur += TENS[t]; found = true; }
      else if (t === "hundred") { cur = (cur || 1) * 100; found = true; }
      else if (t === "thousand") { total += (cur || 1) * 1000; cur = 0; found = true; }
      else if (t === "and" && found) { continue; }
      else if (found) break;
    }
    return found ? total + cur : null;
  }

  // "ninety three" / "ninety-three" / "one hundred and two" / "93" / "nineteenth" / "19th" -> number or null
  function spokenNumber(text) {
    const m = String(text || "").match(/\d+/);
    if (m) return parseInt(m[0], 10);
    return parseWords(norm(text));
  }

  // "twenty twenty six" / "two thousand twenty six" / "2026" / "nineteen ninety nine" -> 4-digit year string or ""
  function spokenYear(text) {
    const m = String(text || "").match(/\b(1[89]\d\d|2\d\d\d)\b/);
    if (m) return m[1];
    const t = norm(text).filter((x) => x !== "and");
    if (t.includes("thousand")) { const n = parseWords(t); return n ? String(n) : ""; }
    for (let k = 1; k < t.length; k++) {
      const a = parseWords(t.slice(0, k));
      if (a == null || a < 19 || a > 20) continue;
      let rest = t.slice(k);
      let b;
      if ((rest[0] === "oh" || rest[0] === "zero" || rest[0] === "o") && rest.length > 1) b = parseWords(rest.slice(1));
      else b = parseWords(rest);
      if (b != null && b >= 0 && b <= 99) return String(a * 100 + b);
    }
    const n = parseWords(t);
    return n != null ? String(n) : "";
  }

  // ---- verbal fluency word extraction ----
  const FILLERS = new Set(["the", "that", "this", "there", "then", "they", "them", "their", "these", "those", "to", "too", "so", "she", "his", "her", "he", "hers", "what", "was", "with", "would", "will", "for", "from", "but", "by", "be", "been", "do", "did", "does", "dont", "have", "had", "has", "how", "me", "my", "um", "uh", "hmm", "hm", "okay", "ok", "oh", "like", "its", "it", "is", "in", "if", "i", "im", "ill", "ive", "we", "well", "when", "where", "why", "who", "which", "wait", "wow", "you", "your", "can", "cant", "could", "got", "get", "go", "going", "let", "lets", "one", "of", "on", "or", "at", "am", "an", "and", "are", "as", "just", "yeah", "yes", "no", "not", "now", "right", "really", "see", "some", "such", "than", "think", "thing", "things", "word", "words", "letter", "start", "starts", "starting", "begin", "begins"]);
  // common given names / places likely to be said during a letter-fluency task (flagged and struck)
  const NAMES = new Set(("bob bobby barbara bill billy betty brian ben brad bruce boston brazil britain berlin baltimore brooklyn bronx " +
    "charlie charles chris carol carl carolyn catherine chicago china canada california cleveland colorado columbus charlotte cincinnati " +
    "david dan daniel donald dennis diane debbie dallas denver detroit dublin delaware " +
    "frank fred frances florida france fiji finland florence " +
    "george gary greg gloria georgia germany greece greenland " +
    "henry harry helen harold howard hawaii houston haiti holland " +
    "linda larry lisa laura lucy louis louise london lisbon la louisiana lexington " +
    "mary michael mike mark matt martin margaret maria michelle monica miami minnesota mexico moscow madrid maine montana memphis massachusetts " +
    "paul peter patricia pat paula philip phil peggy paris portland philadelphia phoenix pittsburgh poland portugal peru pennsylvania " +
    "robert richard rick ron ronald rachel rebecca ruth rome russia reno richmond " +
    "sam samuel sarah susan steve stephen scott sandra sally seattle spain sweden scotland switzerland texas sydney " +
    "tom thomas tim tony ted teresa theresa tina tokyo toronto tennessee tampa tulsa thailand turkey " +
    "william walter wendy wayne washington wisconsin wyoming wales warsaw").split(/\s+/));

  function stemOf(w) {
    let s = w;
    const strip = [["iest", "y"], ["ier", "y"], ["ings", ""], ["ing", ""], ["ers", ""], ["er", ""], ["est", ""], ["ed", ""], ["es", ""], ["ly", ""], ["s", ""]];
    for (const [suf, rep] of strip) {
      if (s.length - suf.length >= 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length) + rep; break; }
    }
    s = s.replace(/([b-df-hj-np-tv-z])\1$/, "$1").replace(/e$/, "");
    return s;
  }

  // text: transcript with segments separated by newlines. Returns { chips, duplicates, rawCount }
  function extractFluency(text, letter) {
    const L = String(letter || "").toLowerCase();
    const seen = new Set(), chips = [];
    let duplicates = 0;
    String(text || "").split(/\n+/).forEach((line) => {
      line.split(/[\s,;]+/).filter(Boolean).forEach((raw, idx) => {
        const clean = raw.replace(/[^A-Za-z]/g, "");
        if (clean.length < 2) return;
        const w = clean.toLowerCase();
        if (w[0] !== L) return;
        if (seen.has(w)) { duplicates++; return; }
        seen.add(w);
        const flags = []; let struck = false;
        if (FILLERS.has(w)) { flags.push("filler / not a target word"); struck = true; }
        if (NAMES.has(w)) { flags.push("likely name or place (not allowed)"); struck = true; }
        else if (idx > 0 && /^[A-Z][a-z]+$/.test(clean)) flags.push("capitalized mid-sentence: possible proper noun");
        if (!struck) {
          const st = stemOf(w);
          const prior = chips.find((c) => !c.struck && stemOf(c.word) === st);
          if (prior) { flags.push("same word stem as \u201c" + prior.word + "\u201d"); struck = true; }
        }
        chips.push({ word: w, flags, struck });
      });
    });
    return { chips, duplicates };
  }


  // ---- category fluency (e.g. animals): no starting letter; two-word names are joined ----
  const TWO_WORD = ["polar bear", "guinea pig", "sea lion", "killer whale", "blue whale", "grizzly bear", "brown bear", "black bear", "panda bear", "hermit crab", "horse shoe crab", "fruit bat", "mountain lion", "snow leopard", "sea horse", "great white", "bald eagle", "golden retriever", "german shepherd", "gold fish", "komodo dragon", "arctic fox", "red fox", "water buffalo", "wild boar", "prairie dog", "sea otter", "sea turtle", "tree frog", "bull frog", "monkey wrench"];
  const CAT_FILLERS = new Set(["the", "a", "an", "and", "or", "um", "uh", "hmm", "hm", "okay", "ok", "oh", "like", "its", "it", "is", "i", "im", "ill", "ive", "so", "well", "let", "lets", "me", "think", "of", "more", "also", "then", "another", "animal", "animals", "yeah", "yes", "no", "not", "now", "start", "starts", "done", "finished", "that", "this", "was", "wait", "what", "next", "one", "two", "have", "got", "can", "cant", "dont", "know", "there", "they", "you", "and", "to", "for", "in", "on", "at", "as", "be", "do", "go", "my", "by", "with"]);
  function extractCategory(text) {
    const seen = new Set(), chips = []; let duplicates = 0;
    String(text || "").split(/\n+/).forEach((line) => {
      line.split(/[,;]+/).forEach((seg) => {
        let toks = seg.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
        const out = [];
        for (let i = 0; i < toks.length; i++) {
          const two = toks[i] + " " + toks[i + 1];
          if (i + 1 < toks.length && TWO_WORD.includes(two)) { out.push(two); i++; } else out.push(toks[i]);
        }
        out.forEach((w) => {
          if (w.length < 2) return;
          if (CAT_FILLERS.has(w)) return;
          const st = w.split(" ").map(stemOf).join(" ");
          if (seen.has(st)) { duplicates++; return; }
          seen.add(st);
          chips.push({ word: w, flags: [], struck: false });
        });
      });
    });
    return { chips, duplicates };
  }

  // ---- spelling aloud: letters or letter names -> string of letters ----
  const LETTER_NAMES = { ay: "a", eh: "a", bee: "b", be: "b", see: "c", sea: "c", cee: "c", dee: "d", ee: "e", eff: "f", ef: "f", gee: "g", aitch: "h", eye: "i", jay: "j", kay: "k", okay: "k", el: "l", elle: "l", em: "m", en: "n", oh: "o", o: "o", pee: "p", pea: "p", cue: "q", queue: "q", ar: "r", are: "r", ess: "s", es: "s", tee: "t", tea: "t", you: "u", yu: "u", vee: "v", ex: "x", why: "y", wye: "y", zee: "z", zed: "z", "double": "", dub: "" };
  function spokenLetters(text) {
    const toks = String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    let out = "";
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === "double" && /^(you|u|yu|dub|ew)$/.test(toks[i + 1] || "")) { out += "w"; i++; continue; }
      if (t.length === 1) { out += t; continue; }
      if (LETTER_NAMES[t] !== undefined) { out += LETTER_NAMES[t]; continue; }
      if (/^[a-z]+$/.test(t) && toks.length === 1) { out += t; continue; } // one typed word like "dlrow"
    }
    return out.toUpperCase();
  }

  // ---- word-level comparison for sentence repetition ----
  function words(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/'/g, "").split(/\s+/).filter(Boolean); }
  function wordMatch(typed, target) {
    const a = words(typed), b = words(target);
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const inA = new Set(), inB = new Set();
    let i = a.length, j = b.length;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { inA.add(i - 1); inB.add(j - 1); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    return {
      exact: a.length === b.length && a.every((w, k) => w === b[k]),
      matched: dp[a.length][b.length], total: b.length,
      missing: b.filter((_, k) => !inB.has(k)), extra: a.filter((_, k) => !inA.has(k))
    };
  }

  // ---- spoken-stimulus helpers (pure) ----
  const DIGIT_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  // Respelled so every TTS voice says the LETTER NAME (a bare "A" is often read as the word "a")
  const LETTER_SAY = { A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "gee", H: "aitch", I: "eye", J: "jay", K: "kay", L: "el", M: "em", N: "en", O: "oh", P: "pee", Q: "cue", R: "ar", S: "ess", T: "tee", U: "you", V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee" };
  const digitName = (d) => DIGIT_NAMES[d];
  const letterSay = (l) => LETTER_SAY[String(l).toUpperCase()] || String(l);
  // planned onset times (ms from t0): item i is spoken at t0 + lead + i*gap
  function planSchedule(n, gapMs, leadMs) { return Array.from({ length: n }, (_, i) => (leadMs || 0) + i * gapMs); }

  // Score letter-tapping against the ONSET time of each spoken (or displayed) letter.
  // A tap counts for a target if it falls in [onset, onset + windowMs]. Earliest unmatched target
  // is used (this maximises hits). A repeat tap within debounceMs of a hit is ignored (accidental double
  // tap). Any other tap is a false tap. Errors = missed targets + false taps. <= 1 error earns the point.
  function scoreVigilance(starts, isTarget, taps, windowMs, debounceMs) {
    windowMs = windowMs == null ? 1500 : windowMs; debounceMs = debounceMs == null ? 700 : debounceMs;
    const targets = []; isTarget.forEach((t, i) => { if (t) targets.push(i); });
    const matched = new Set(); let hits = 0, falseTaps = 0, duplicates = 0, lastHit = -Infinity;
    const matches = [];
    taps.slice().sort((a, b) => a - b).forEach((t) => {
      const c = targets.find((i) => !matched.has(i) && starts[i] <= t && t <= starts[i] + windowMs);
      if (c !== undefined) { matched.add(c); hits++; lastHit = t; matches.push({ target: c, rtMs: Math.round(t - starts[c]) }); }
      else if (t - lastHit <= debounceMs && t >= lastHit) duplicates++;
      else falseTaps++;
    });
    const misses = targets.length - hits;
    return { hits, misses, falseTaps, duplicates, errors: misses + falseTaps, targets: targets.length, point: misses + falseTaps <= 1 ? 1 : 0, matches };
  }

  const api = { extractCategory, spokenLetters, spokenDigits, spokenNumber, spokenYear, extractFluency, stemOf, wordMatch, digitName, letterSay, planSchedule, scoreVigilance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CESpeech = api;
})(typeof window !== "undefined" ? window : globalThis);
