/* Examiner setup: the form editor (window.CESetup). The examiner customises every item here;
 * every field has a default and a Randomize button that draws from the built-in banks.
 * Nothing here is shown to the examinee: app.js removes this screen at hand-over. */
(function () {
  "use strict";
  const C = window.CECore, U = window.CEUI, { h, btn, field } = U;
  const LS_KEY = "cognitiveExam.forms.v1";

  // ---------- saved forms (localStorage; may be unavailable) ----------
  const store = {
    ok() { try { localStorage.setItem("ce.t", "1"); localStorage.removeItem("ce.t"); return true; } catch (_) { return false; } },
    all() { try { const o = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (_) { return {}; } },
    save(f) { const o = store.all(); o[f.name] = C.exportForm(f); o[f.name].savedAt = new Date().toISOString(); localStorage.setItem(LS_KEY, JSON.stringify(o)); },
    load(name) { const e = store.all()[name]; return e ? C.importForm(e) : { error: "No such saved form." }; },
    remove(name) { const o = store.all(); delete o[name]; localStorage.setItem(LS_KEY, JSON.stringify(o)); },
    names() { const o = store.all(); return Object.keys(o).sort((a, b) => String(o[a].savedAt || "").localeCompare(String(o[b].savedAt || ""))); }
  };

  const num = (v) => { const t = String(v).trim(); return /^-?\d+$/.test(t) ? parseInt(t, 10) : (t === "" ? null : NaN); };
  const csv = (s) => String(s).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

  function editor(initial) {
    let F = JSON.parse(JSON.stringify(initial));
    const root = h("div", { class: "editor" });
    const secs = {};
    const status = h("div", { class: "small muted", role: "status", "data-k": "form-status" });

    // ----- inline validation messages -----
    const err = (path) => h("div", { class: "err small", "data-path": path });
    function refreshErrors() {
      const E = C.validateForm(F);
      root.querySelectorAll(".err").forEach((s) => {
        const p = s.getAttribute("data-path");
        const m = E.filter((e) => e.path === p || (p.endsWith("*") && e.path.startsWith(p.slice(0, -1))));
        s.textContent = m.map((e) => e.msg).join(" ");
      });
      const hs = (root.parentNode || root).querySelector("[data-k=form-hash]"); if (hs) { try { hs.textContent = E.length ? "(fix the problems to see the form hash)" : C.formHash(F).slice(0, 12); } catch (_) { } }
      return E;
    }
    const touch = () => refreshErrors();
    const inp = (k, get, set, opts) => {
      opts = opts || {};
      const f = field(!!opts.multiline, { k, numeric: opts.numeric, label: opts.label });
      f.value = String(get() == null ? "" : get());
      f.addEventListener("input", () => { set(f.value); touch(); });
      if (opts.max) f.maxLength = opts.max;
      if (opts.cls) f.classList.add(opts.cls);
      return f;
    };
    const sel = (k, options, value, onchange, label) => {
      const s = h("select", { "data-k": k, name: U.token(), autocomplete: "off", "aria-label": label || k });
      options.forEach((o) => s.append(h("option", { value: o.value }, o.label)));
      s.value = value; s.addEventListener("change", () => onchange(s.value)); return s;
    };
    const check = (k, label, get, set) => {
      const cb = h("input", { type: "checkbox", "data-k": k, name: U.token(), autocomplete: "off" }); cb.checked = !!get();
      cb.addEventListener("change", () => { set(cb.checked); touch(); });
      return h("label", { class: "checkline" }, cb, h("span", null, label));
    };
    const rbtn = (k, label, fn) => { const b = btn(label || "\u21BA Randomize"); b.setAttribute("data-k", k); b.addEventListener("click", () => { fn(); touch(); }); return b; };
    const row = (label, ...kids) => h("div", { class: "field-row" }, h("label", null, label), ...kids);

    function section(key, title, build, open, hint) {
      const body = h("div", { class: "sec-body" });
      const d = h("details", { class: "sec", "data-sec": key }, h("summary", null, title, hint ? h("span", { class: "sec-hint small muted" }, hint) : null), body);
      if (open) d.setAttribute("open", "");
      const rebuild = () => { body.replaceChildren(build()); refreshErrors(); };
      secs[key] = { el: d, rebuild };
      rebuild();
      return d;
    }

    // ----- memory rows (core 5 / extended 7) -----
    function memRows(arr, n, prefix, label, rebuild, base) {
      const wrap = h("div");
      const bankSel = (i) => {
        const s = h("select", { "data-k": prefix + "-pick-" + i, name: U.token(), autocomplete: "off", "aria-label": label + " word " + (i + 1) + " from the bank" });
        s.append(h("option", { value: "" }, "pick from bank\u2026"));
        C.WORD_CATS.forEach((c, ci) => { const g = h("optgroup", { label: c.cue }); c.words.forEach((w, wi) => g.append(h("option", { value: ci + ":" + wi }, w))); s.append(g); });
        s.addEventListener("change", () => { if (!s.value) return; const [ci, wi] = s.value.split(":").map(Number); const c = C.WORD_CATS[ci]; arr[i] = C.memItem(c, c.words[wi]); rebuild(); });
        return s;
      };
      arr.forEach((m, i) => {
        wrap.append(h("div", { class: "memrow" },
          h("div", { class: "memnum" }, String(i + 1)),
          h("div", { class: "memcol" }, h("label", { class: "small muted" }, "Word"), inp(prefix + "-word-" + i, () => m.word, (v) => { m.word = v; }, { label: label + " word " + (i + 1) }), err(base + "." + i + ".word")),
          h("div", { class: "memcol" }, h("label", { class: "small muted" }, "Category cue (optional)"), inp(prefix + "-cue-" + i, () => m.cue, (v) => { m.cue = v; }, { label: "Cue " + (i + 1) })),
          h("div", { class: "memcol" }, h("label", { class: "small muted" }, "Multiple-choice distractors (optional, 2)"), inp(prefix + "-dis-" + i, () => (m.distractors || []).join(", "), (v) => { m.distractors = csv(v).slice(0, 2); }, { label: "Distractors " + (i + 1) }), err(base + "." + i + ".distractors*")),
          h("div", { class: "memcol" }, h("label", { class: "small muted" }, "Bank"), bankSel(i))));
      });
      wrap.append(err(base));
      return wrap;
    }

    // ----- abstraction slots -----
    function absSlots(arr, prefix, level, base) {
      const wrap = h("div");
      const sameAsBank = (p) => C.PAIRS.findIndex((b) => b.a === String(p.a).trim().toLowerCase() && b.b === String(p.b).trim().toLowerCase() && JSON.stringify(b.kw) === JSON.stringify(p.kw.map((x) => x.trim().toLowerCase())));
      arr.forEach((p, i) => {
        const pick = h("select", { "data-k": prefix + "-pick-" + i, name: U.token(), autocomplete: "off", "aria-label": "Pair " + (i + 1) + " from the list" });
        const ogs = { core: h("optgroup", { label: "Everyday pairs" }), hard: h("optgroup", { label: "Harder (abstract) pairs" }) };
        C.PAIRS.forEach((b, bi) => ogs[b.level].append(h("option", { value: String(bi) }, b.a + " \u2013 " + b.b)));
        pick.append(h("option", { value: "custom" }, "Custom pair\u2026"), ogs.core, ogs.hard);
        const idx = sameAsBank(p); pick.value = idx >= 0 ? String(idx) : "custom";
        const fa = inp(prefix + "-a-" + i, () => p.a, (v) => { p.a = v; pick.value = "custom"; }, { label: "Pair " + (i + 1) + " first item" });
        const fb = inp(prefix + "-b-" + i, () => p.b, (v) => { p.b = v; pick.value = "custom"; }, { label: "Pair " + (i + 1) + " second item" });
        const fk = inp(prefix + "-kw-" + i, () => p.kw.join(", "), (v) => { p.kw = csv(v); pick.value = "custom"; }, { label: "Pair " + (i + 1) + " accepted keywords" });
        pick.addEventListener("change", () => { if (pick.value === "custom") return; const b = C.PAIRS[+pick.value]; Object.assign(p, { a: b.a, b: b.b, kw: b.kw.slice() }); fa.value = p.a; fb.value = p.b; fk.value = p.kw.join(", "); touch(); });
        wrap.append(h("div", { class: "abs-slot" },
          h("div", { class: "small muted" }, "Pair " + (i + 1)), pick,
          h("div", { class: "abs-grid" }, h("div", null, h("label", { class: "small muted" }, "First item"), fa), h("div", null, h("label", { class: "small muted" }, "Second item"), fb), h("div", { class: "abs-kw" }, h("label", { class: "small muted" }, "Accepted answer keywords (comma separated; a word stem anywhere in the answer scores)"), fk)),
          err(base + "." + i + "*")));
      });
      wrap.append(err(base));
      return wrap;
    }

    // ================= sections =================
    function build() {
      root.replaceChildren(
        // 1 trail
        section("trail", "1. Alternating trail", () => h("div", null,
          row("Pattern (5 pairs; scored: completed with 0 errors)", sel("trail", C.TRAIL_PATTERNS.map((p) => ({ value: p.id, label: p.label })), F.trail.pattern, (v) => { F.trail.pattern = v; touch(); }, "Trail pattern")),
          h("p", { class: "small muted" }, "Plants and animals: each circle shows a picture and a small number; tap plant 1, animal 1, plant 2, animal 2 \u2026"),
          h("div", { class: "inline-actions" }, rbtn("rand-trail", null, () => { F.trail.pattern = C.pick(C.TRAIL_PATTERNS).id; secs.trail.rebuild(); })))),
        // 2 figure
        section("shape", "2. Copy the figure (1 point, scored by hand)", () => {
          const prev = h("div", { class: "fig-prev" });
          const showPrev = () => { const sv = U.figSvg(C.figure(F.shape)); prev.replaceChildren(sv); };
          showPrev();
          return h("div", null,
            row("Figure (orientation is randomized each session)", sel("shape", C.SHAPES.map((s) => ({ value: s.id, label: s.label })), F.shape, (v) => { F.shape = v; showPrev(); touch(); }, "Figure")),
            prev, h("div", { class: "inline-actions" }, rbtn("rand-shape", null, () => { F.shape = C.pick(C.SHAPES).id; secs.shape.rebuild(); })));
        }),
        // 3 clock
        section("clock", "3. Draw a clock (3 points)", () => h("p", { class: "small muted" }, "Unchanged: a random time is asked each session.")),
        // 4 naming
        section("naming", "4. Naming (3 animals)", () => {
          const grid = h("div", { class: "thumb-grid" }), accepts = h("div");
          const draw = () => {
            grid.replaceChildren(...window.CE_ART.map((src, i) => {
              const at = F.naming.findIndex((n) => n.art === i);
              const b = h("button", { type: "button", class: "thumb" + (at >= 0 ? " on" : ""), "data-k": "animal-" + i, "aria-pressed": at >= 0 ? "true" : "false", "aria-label": C.ANIMALS[i].name + (at >= 0 ? " (selected " + (at + 1) + ")" : "") },
                h("img", { src, alt: C.ANIMALS[i].name }), h("span", { class: "thumb-name small" }, C.ANIMALS[i].name), at >= 0 ? h("span", { class: "thumb-badge" }, String(at + 1)) : null);
              b.addEventListener("click", () => {
                const j = F.naming.findIndex((n) => n.art === i);
                if (j >= 0) F.naming.splice(j, 1);
                else if (F.naming.length < 3) F.naming.push({ art: i, accept: C.ANIMALS[i].ok.slice() });
                else { msg.textContent = "Three are chosen: tap one to deselect it first."; return; }
                msg.textContent = ""; draw(); touch();
              });
              return b;
            }));
            accepts.replaceChildren(...F.naming.map((n, k) => row(`Animal ${k + 1}: accepted answers (comma separated)`, inp("accept-" + k, () => n.accept.join(", "), (v) => { n.accept = csv(v); }, { label: "Accepted answers " + (k + 1) }), err("naming." + k + "*"))));
          };
          const msg = h("div", { class: "small muted" });
          draw();
          return h("div", null, h("p", { class: "small muted" }, "Tap pictures to choose 3 (the numbers show the order). Edit the accepted answers if needed."), grid, msg, accepts, err("naming"),
            h("div", { class: "inline-actions" }, rbtn("rand-naming", null, () => { F.naming = C.randomNaming(); draw(); })));
        }),
        // 5 memory
        section("memory", "5. Memory (5 words; also used for delayed recall)", () => {
          const wrap = h("div"); const re = () => secs.memory.rebuild();
          wrap.append(memRows(F.memory, 5, "mem", "Memory", re, "memory"), h("p", { class: "small muted" }, "A category cue is used in the hint round after delayed recall. Distractors for the multiple-choice hint come from the built-in category bank unless you type them."),
            h("div", { class: "inline-actions" }, rbtn("rand-memory", null, () => { const ex = new Set(F.ext.memory.map((m) => String(m.word).toLowerCase())); let m; for (let t = 0; t < 30; t++) { m = C.randomMemory(5, 0).core; if (!m.some((x) => ex.has(x.word))) break; } F.memory = m; re(); })));
          return wrap;
        }, true),
        // 6 digits
        section("digits", "6. Digit span (heard only; digits are never shown to the examinee)", () => h("div", null,
          row("Forward: 5 digits", inp("digits-fwd", () => F.digitsFwd, (v) => { F.digitsFwd = v; }, { numeric: true, max: 5, label: "Forward digits" }), err("digitsFwd")),
          row("Backward: 3 digits (examinee says them in reverse)", inp("digits-bwd", () => F.digitsBwd, (v) => { F.digitsBwd = v; }, { numeric: true, max: 3, label: "Backward digits" }), err("digitsBwd")),
          h("div", { class: "inline-actions" }, rbtn("rand-digits", null, () => { F.digitsFwd = C.randomDigits(5); F.digitsBwd = C.randomDigits(3); secs.digits.rebuild(); })))),
        // 7 letters
        section("letters", "7. Letter tapping (target letter is random each session)", () => h("p", { class: "small muted" }, "Unchanged.")),
        // 8 serial
        section("serial", "8. Serial 7s", () => h("div", null,
          row("Starting number (20\u2013200; default is random 80\u2013100)", inp("serial", () => F.serialStart, (v) => { F.serialStart = num(v); }, { numeric: true, max: 3, label: "Serial 7s start" }), err("serialStart")),
          h("div", { class: "inline-actions" }, rbtn("rand-serial", null, () => { F.serialStart = C.rint(80, 100); secs.serial.rebuild(); })))),
        // 9 sentences
        section("sentences", "9. Sentence repetition (2 sentences)", () => {
          const wrap = h("div");
          F.sentences.forEach((s, i) => {
            const t = inp("sent-" + i, () => F.sentences[i], (v) => { F.sentences[i] = v; }, { multiline: true, label: "Sentence " + (i + 1) }); t.classList.add("sent-ta");
            const p = h("select", { "data-k": "sent-pick-" + i, name: U.token(), autocomplete: "off", "aria-label": "Sentence " + (i + 1) + " from the bank" });
            p.append(h("option", { value: "" }, "pick from the bank of 16\u2026"), ...C.SENTENCES.map((x, xi) => h("option", { value: String(xi) }, x)));
            p.addEventListener("change", () => { if (p.value === "") return; F.sentences[i] = C.SENTENCES[+p.value]; t.value = F.sentences[i]; touch(); });
            wrap.append(row("Sentence " + (i + 1), t, p, err("sentences." + i)));
          });
          wrap.append(err("sentences"), h("div", { class: "inline-actions" }, rbtn("rand-sentences", null, () => { F.sentences = C.sample(C.SENTENCES, 2); secs.sentences.rebuild(); })));
          return wrap;
        }),
        // 10 fluency letter
        section("fluency", "10. Letter fluency (60 seconds)", () => h("div", null,
          row("Letter", inp("letter", () => F.fluencyLetter, (v) => { F.fluencyLetter = v.trim().toUpperCase(); }, { max: 1, cls: "short", label: "Fluency letter" }), err("fluencyLetter")),
          h("div", { class: "inline-actions" }, rbtn("rand-letter", null, () => { F.fluencyLetter = C.pick(C.FLUENCY_LETTERS); secs.fluency.rebuild(); })))),
        // 11 abstraction
        section("abstraction", "11. Abstraction (2 pairs)", () => h("div", null, absSlots(F.abstraction, "abs", "core", "abstraction"),
          h("div", { class: "inline-actions" }, rbtn("rand-abs", null, () => { F.abstraction = C.randomAbstraction("core"); secs.abstraction.rebuild(); })))),
        // 12/13
        section("recall", "12. Delayed recall and 13. Orientation", () => h("p", { class: "small muted" }, "Delayed recall asks for your 5 memory words. Orientation is unchanged.")),
        // extended
        section("ext", "Extended section (optional, scored separately out of 15)", () => {
          const re = () => secs.ext.rebuild();
          return h("div", null,
            check("ext-on", "Include the extended section in this form", () => F.extendedOn, (v) => { F.extendedOn = v; }),
            h("h4", null, "Extended memory (7 words)"), memRows(F.ext.memory, 7, "xmem", "Extended", re, "ext.memory"),
            row("Digits forward: 7 digits", inp("x-digits-fwd", () => F.ext.digitsFwd, (v) => { F.ext.digitsFwd = v; }, { numeric: true, max: 7, label: "Extended forward digits" }), err("ext.digitsFwd")),
            row("Digits backward: 5 digits", inp("x-digits-bwd", () => F.ext.digitsBwd, (v) => { F.ext.digitsBwd = v; }, { numeric: true, max: 5, label: "Extended backward digits" }), err("ext.digitsBwd")),
            row("Serial 13s starting number (30\u2013300)", inp("x-serial", () => F.ext.serialStart, (v) => { F.ext.serialStart = num(v); }, { numeric: true, max: 3, label: "Extended serial start" }), err("ext.serialStart")),
            h("h4", null, "Extended abstraction (2 pairs)"), absSlots(F.ext.abstraction, "xabs", "hard", "ext.abstraction"),
            h("div", { class: "inline-actions" }, rbtn("rand-ext", "\u21BA Randomize the extended section", () => { const co = new Set(F.memory.map((m) => String(m.word).toLowerCase())); let m; for (let t = 0; t < 30; t++) { m = C.randomMemory(0, 7).ext; if (!m.some((x) => co.has(x.word))) break; } F.ext = { memory: m, digitsFwd: C.randomDigits(7), digitsBwd: C.randomDigits(5), serialStart: C.rint(150, 199), abstraction: C.randomAbstraction("hard") }; re(); })));
        }),
        // additional measures
        section("extra", "Additional measures (optional, each scored separately, outside the 30 points)", () => {
          const E = F.extra; const re = () => secs.extra.rebuild();
          const cmdRow = (i) => h("div", { class: "cmd-row" }, h("span", { class: "small muted" }, "Step " + (i + 1)),
            sel("cmd-color-" + i, C.CMD_COLORS.map((c) => ({ value: c.id, label: c.id })), E.command.steps[i].color, (v) => { E.command.steps[i].color = v; cmdText.textContent = C.commandText(E.command.steps); touch(); }, "Step " + (i + 1) + " colour"),
            sel("cmd-shape-" + i, C.CMD_SHAPES.map((c) => ({ value: c, label: c })), E.command.steps[i].shape, (v) => { E.command.steps[i].shape = v; cmdText.textContent = C.commandText(E.command.steps); touch(); }, "Step " + (i + 1) + " shape"));
          const cmdText = h("div", { class: "small", "data-k": "cmd-text" }, C.commandText(E.command.steps));
          return h("div", null,
            h("div", { class: "review-item" }, check("cf-on", "Category fluency: animals, 60 seconds (microphone or typing)", () => E.catFluency.on, (v) => { E.catFluency.on = v; }),
              row("Optional threshold for 1 point (blank = just report the count)", inp("cf-thr", () => E.catFluency.threshold, (v) => { const n = num(v); E.catFluency.threshold = n; }, { numeric: true, max: 2, cls: "short", label: "Category fluency threshold" }), err("extra.catFluency.threshold"))),
            h("div", { class: "review-item" }, check("stroop-on", "Stroop colour-word: tap the ink colour (records accuracy and mean response time)", () => E.stroop.on, (v) => { E.stroop.on = v; }),
              row("Number of trials (10\u201340, default 20)", inp("stroop-n", () => E.stroop.trials, (v) => { E.stroop.trials = num(v); }, { numeric: true, max: 2, cls: "short", label: "Stroop trials" }), err("extra.stroop.trials"))),
            h("div", { class: "review-item" }, check("cmd-on", "3-step command following with tap targets (shapes and colours; 3 points)", () => E.command.on, (v) => { E.command.on = v; }),
              cmdRow(0), cmdRow(1), cmdRow(2), cmdText, err("extra.command.steps"),
              h("div", { class: "inline-actions" }, rbtn("rand-cmd", null, () => { E.command.steps = C.randomCommand(); re(); }))),
            h("div", { class: "review-item" }, check("spell-on", "Reverse spelling of a 5-letter word", () => E.spelling.on, (v) => { E.spelling.on = v; }),
              row("Word (exactly 5 letters)", inp("spell-word", () => E.spelling.word, (v) => { E.spelling.word = v.trim().toUpperCase(); }, { max: 5, cls: "short", label: "Spelling word" }), err("extra.spelling.word"))),
            h("div", { class: "review-item" }, check("rt-on", "Simple reaction time (reports the median in ms)", () => E.reaction.on, (v) => { E.reaction.on = v; }),
              row("Number of trials (5\u201320, default 10)", inp("rt-n", () => E.reaction.trials, (v) => { E.reaction.trials = num(v); }, { numeric: true, max: 2, cls: "short", label: "Reaction trials" }), err("extra.reaction.trials"))));
        })
      );
      refreshErrors();
    }

    // ----- forms card (name, save/load, export/import) -----
    function formsCard() {
      const nameF = inp("form-name", () => F.name, (v) => { F.name = v; }, { label: "Form name" });
      const sav = h("select", { "data-k": "form-select", name: U.token(), autocomplete: "off", "aria-label": "Saved forms" });
      const hashEl = h("span", { class: "mono", "data-k": "form-hash" }, "");
      const fillSaved = () => { const n = store.names(); sav.replaceChildren(h("option", { value: "" }, n.length ? "Saved forms (" + n.length + ")\u2026" : "(no saved forms yet)"), ...n.map((x) => h("option", { value: x }, x))); };
      fillSaved();
      const say = (t, bad) => { status.textContent = t; status.className = "small " + (bad ? "bad-text" : "muted"); };
      const bSave = btn("Save form"), bLoad = btn("Load"), bDel = btn("Delete"), bNew = btn("New form (next name, randomized)"), bAll = btn("\u21BA Randomize everything"), bExp = btn("Export form (JSON)");
      bSave.setAttribute("data-k", "form-save"); bLoad.setAttribute("data-k", "form-load"); bDel.setAttribute("data-k", "form-delete"); bNew.setAttribute("data-k", "form-new"); bAll.setAttribute("data-k", "form-randomall"); bExp.setAttribute("data-k", "form-export");
      const setForm = (f) => { F = JSON.parse(JSON.stringify(f)); nameF.value = F.name; build(); refreshErrors(); };
      bSave.addEventListener("click", () => {
        const E = C.validateForm(F); if (E.length) { say("Fix the problems first: " + E[0].msg, true); return; }
        if (!store.ok()) { say("This browser will not store forms (private mode?). Use Export instead.", true); return; }
        store.save(F); fillSaved(); sav.value = F.name; say(`Saved \u201c${F.name}\u201d in this browser (hash ${C.formHash(F).slice(0, 12)}).`);
      });
      bLoad.addEventListener("click", () => { if (!sav.value) return; const r = store.load(sav.value); if (r.error) say(r.error, true); else { setForm(r.form); say(`Loaded \u201c${r.form.name}\u201d.`); } });
      bDel.addEventListener("click", () => { if (!sav.value) return; const n = sav.value; store.remove(n); fillSaved(); say(`Deleted \u201c${n}\u201d.`); });
      bNew.addEventListener("click", () => { const f = C.defaultForm(C.nextFormName(F.name)); f.extendedOn = F.extendedOn; f.extra = Object.assign(f.extra, JSON.parse(JSON.stringify(F.extra))); f.extra.command.steps = C.randomCommand(); setForm(f); say(`New form \u201c${f.name}\u201d with fresh random items (your optional sections stay as they were).`); });
      bAll.addEventListener("click", () => { const f = C.defaultForm(F.name); f.extendedOn = F.extendedOn; f.extra = JSON.parse(JSON.stringify(Object.assign({}, f.extra, { catFluency: F.extra.catFluency, stroop: F.extra.stroop, spelling: F.extra.spelling, reaction: F.extra.reaction, command: Object.assign({}, F.extra.command, { steps: C.randomCommand() }) }))); f.trail = { pattern: C.pick(C.TRAIL_PATTERNS).id }; f.shape = C.pick(C.SHAPES).id; setForm(f); say("Every item was re-drawn from the banks."); });
      bExp.addEventListener("click", () => {
        const E = C.validateForm(F); if (E.length) { say("Fix the problems first: " + E[0].msg, true); return; }
        const text = JSON.stringify(C.exportForm(F), null, 2);
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = "cognitive-exam-form-" + F.name.replace(/[^A-Za-z0-9_-]+/g, "_") + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
        say("Exported the form file. Import it on another device to run the same form.");
      });
      const file = h("input", { type: "file", accept: "application/json,.json", "data-k": "form-import", class: "hidden", name: U.token() });
      const bImp = btn("Import form (JSON)…"); bImp.addEventListener("click", () => file.click());
      file.addEventListener("change", () => {
        const fl = file.files && file.files[0]; if (!fl) return;
        const rd = new FileReader();
        rd.onload = () => { const r = C.importForm(String(rd.result)); if (r.error) say(r.error, true); else { setForm(r.form); say(`Imported \u201c${r.form.name}\u201d.`); } file.value = ""; };
        rd.onerror = () => say("Could not read that file.", true);
        rd.readAsText(fl);
      });
      return h("div", { class: "review-item" }, h("h4", null, "Form"),
        h("p", { class: "small muted" }, "A form is the full set of items below. Save it under a name (Form A, Form B \u2026) and use a different form at each repeat visit. Forms are stored only in this browser; export a file to use the same form on another device."),
        row("Form name", nameF, err("name")),
        h("div", { class: "inline-actions" }, bSave, sav, bLoad, bDel), h("div", { class: "inline-actions" }, bNew, bAll), h("div", { class: "inline-actions" }, bExp, bImp, file),
        h("div", { class: "small muted" }, "Form hash (SHA-256 of the contents): ", hashEl), status);
    }

    const card = formsCard();
    const expand = btn("Expand all sections"); expand.setAttribute("data-k", "expand-all");
    expand.addEventListener("click", () => { const all = [...root.querySelectorAll("details.sec")]; const open = all.every((d) => d.open); all.forEach((d) => { d.open = !open; }); expand.textContent = open ? "Expand all sections" : "Collapse all sections"; });
    const wrap = h("div", { class: "editor-wrap" }, card, h("div", { class: "inline-actions ed-head" }, h("h3", { class: "ed-h" }, "Examiner setup: customise the items"), expand),
      h("p", { class: "small muted" }, "Every field already has a sensible default. Use Randomize to draw new items from the built-in banks. Everything on this screen is hidden before the device is handed over."), root);
    build(); refreshErrors();
    return {
      el: wrap, get: () => F, set: (f) => { F = JSON.parse(JSON.stringify(f)); build(); },
      validate: () => { const E = refreshErrors(); return E; }, refresh: refreshErrors,
      openAll: () => root.querySelectorAll("details.sec").forEach((d) => d.setAttribute("open", "")),
      focusPath: (p) => { const s = root.querySelector(`.err[data-path^="${p.split(".")[0]}"]`); const d = s && s.closest("details"); if (d) { d.setAttribute("open", ""); s.scrollIntoView({ block: "center" }); } }
    };
  }
  window.CESetup = { editor, store };
})();
