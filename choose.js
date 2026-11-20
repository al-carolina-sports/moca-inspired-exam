/* Root page helper: makes the links work from file:// too and suggests the right version for this device. */
(function () {
  "use strict";
  var file = location.protocol === "file:";
  var ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var win = /Windows/.test(navigator.userAgent);
  ["linkIpad", "linkWindows"].forEach(function (id) {
    var a = document.getElementById(id); if (!a) return;
    if (file) a.setAttribute("href", a.getAttribute("href") + "index.html");
  });
  var rec = document.getElementById("recommend");
  var pick = ipad ? "linkIpad" : win ? "linkWindows" : null;
  if (pick) { document.getElementById(pick).classList.add("recommended"); if (rec) rec.textContent = "This looks like " + (ipad ? "an iPad" : "a Windows computer") + ": the " + (ipad ? "iPad" : "Windows") + " version is highlighted."; }
})();
