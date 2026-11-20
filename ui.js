/* Small DOM helpers shared by setup.js and app.js (window.CEUI). */
(function () {
  "use strict";
  // touch devices (iPad): never pop the on-screen keyboard open by script
  const focusIt = (el) => { if (el && !(navigator.maxTouchPoints > 0) && !/iPad|iPhone|iPod/.test(navigator.userAgent)) el.focus(); };

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
  const btn = (label, cls) => h("button", { type: "button", class: "btn " + (cls || "") }, label);

  // ---------- answer fields: hardened against autofill / history / spellcheck / hints ----------
  // - created fresh for every screen; random, never-reused name/id; autocomplete off, no placeholder,
  //   no value, no datalist, spellcheck/autocorrect/autocapitalize off
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
      "aria-label": opts.label || "Your answer", enterkeyhint: "done"
    };
    if (opts.numeric) attrs.inputmode = "numeric";
    if (opts.k) attrs["data-k"] = opts.k;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.className = "input";
    e.value = "";
    return e;
  }
  function formOf(...kids) {
    return h("form", { autocomplete: "off", novalidate: true, onsubmit: (ev) => ev.preventDefault() }, ...kids);
  }
  function wipe(root) { // blank every field before removal (defence in depth)
    root.querySelectorAll("input,textarea").forEach((i) => { if (i.type !== "checkbox" && i.type !== "range" && i.type !== "file") i.value = ""; });
  }
  // wire-frame figure (CECore.figure output) as an SVG
  function figSvg(fig) {
    const svg = sv("svg", { viewBox: "0 0 " + fig.w + " " + fig.h, class: "fig" });
    fig.edges.forEach(([i, j]) => svg.append(sv("line", { x1: fig.pts[i][0], y1: fig.pts[i][1], x2: fig.pts[j][0], y2: fig.pts[j][1], stroke: "#111", "stroke-width": 3, "stroke-linecap": "round" })));
    return svg;
  }
  window.CEUI = { h, sv, btn, field, formOf, wipe, token, focusIt, figSvg };
})();
