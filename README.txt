COGNITIVE EXAM  (v4.0: customizable, iPad + Windows)
====================================================
An informal, customizable cognitive exam. It has NOT been validated, it has no norms or cut-off
scores, and it is NOT diagnostic. Use it only as one piece of information alongside clinical
judgement. A clinician should review every answer and score. All items (words, sentences, digit
strings, abstraction pairs, drawings, icons) are original.

TWO ENTRY POINTS, ONE APP
-------------------------
  index.html            chooser page with both links
  ipad/    (iPad)       larger touch targets, Safari Dictation tips, touch-first drawing,
                        "Add to Home Screen" app whose start page is /ipad/
  windows/ (Windows)    mouse and keyboard friendly, Chrome/Edge speech tips, wider layout
Both load exactly the same code (app.js, core.js, setup.js ...), the same item banks and the same
scoring, and they share the same saved forms (same browser storage when hosted at one address), so
results are comparable. The platform is recorded in every result export.
All paths are relative, so the folder works from any address or sub-folder, for example
https://<account>.github.io/<repo>/ipad/ now and under a different repo name later.

HOW THE EXAM FLOWS
------------------
1. EXAMINER SETUP. Every item has a sensible default and a "Randomize" button that draws from the
   built-in banks. You can change anything:
     1  Alternating trail: numbers+letters, plants+animals (small icons with a sequence number),
        numbers+weekdays, or numbers+months. 5 pairs. Scored: completed with 0 errors.
     2  Copy the figure: cube, triangular prism, square pyramid or hexagonal prism (wire-frame,
        random orientation each session). 1 point, scored by hand with the criteria shown.
     3  Clock drawing (3 points, unchanged).
     4  Naming: pick 3 animals from the picture library; edit the accepted answers.
     5  Memory: 5 words, an optional category cue for each, and the two distractors for the
        multiple-choice round (typed, or drawn from the category bank).
     6  Digit span: type 5 forward and 3 backward digits (digits only, validated). The examinee
        only HEARS them (1 per second); the digits are never shown on screen.
     7  Letter tapping (unchanged).
     8  Serial 7s: choose the starting number (20-200; default random 80-100).
     9  Sentence repetition: 2 sentences, typed or picked from the 16-sentence bank.
    10  Letter fluency: choose the letter.
    11  Abstraction: choose 2 of the 19 built-in pairs, or add your own pair with accepted keywords.
    12  Delayed recall uses your memory words.
    13  Orientation (unchanged).
    Extended section (optional, scored separately): your own 7 words, digit strings, serial start
    and pairs.
    Additional measures (optional, each scored separately and NOT part of the /30):
      Category fluency (animals, 60 s, optional pass threshold), Stroop colour-word (about 20
      trials; accuracy and mean reaction time), 3-step command following with tap targets,
      reverse spelling of a 5-letter word (default WORLD) and simple reaction time (about 10
      trials; median ms).
   Save the setup under a name (Form A, Form B ...) in this browser, and Export / Import it as a
   JSON file to use the same form on another device. Use a different form at each repeat visit.
2. HAND-OVER SCREEN. After "Continue", the setup is removed from the page, so nothing you typed
   can be seen. Hand the device to the examinee, who presses Begin. ("Examiner: back to setup"
   brings the setup back.)
3. THE EXAM, then RESULTS (examiner review). Every score can be changed on the results page.
   Download results as JSON (full detail) and CSV (one row per item score).

WHAT THE RESULT FILES RECORD
----------------------------
Form name, a hash (SHA-256) of the form contents, the exact form contents, app version "4.0",
platform (ipad / windows), a random session ID and the optional participant ID, plus item scores,
answers, replay counts and timings. Do NOT type a name, date of birth or other identifying details
as the participant ID (use a code such as P-014); the box warns you if it looks like a name.
Results are never sent anywhere and are not stored in the browser; they exist until you download
them or close the tab. Saved FORMS (the items, no participant data) are stored in the browser.

HOW TO LAUNCH (Windows)
-----------------------
1. Unzip the whole folder somewhere (for example your Desktop). Do not run it from inside the zip.
2. Double-click  start-exam.bat
   - A window opens and tells you the address (http://localhost:8765/). Your browser opens the
     Windows version. Leave the window open while you use the exam. Close it (or Ctrl+C) to stop.
   - The launcher runs PowerShell with -ExecutionPolicy Bypass, first removes the "downloaded from
     the internet" mark from the folder (Unblock-File), and if "localhost" cannot be used it falls
     back to 127.0.0.1. If something fails, the window stays open and shows the reason (it does
     not close). If PowerShell is unavailable it tries "python -m http.server 8765".
3. Use Google Chrome or Microsoft Edge. If your default browser is different, open Chrome/Edge
   and go to http://localhost:8765/windows/
Everything except spoken answers also works by opening windows/index.html directly (file://), but
speech recognition needs http://localhost or https, so use start-exam.bat for voice.

USING IT ON AN iPad (Safari)
----------------------------
Host the folder at an HTTPS address (see below) and open  <address>/ipad/  in Safari (iPadOS 14.5+).
Optional: Share > Add to Home Screen gives a full-screen app that starts at /ipad/.
- Drawing tasks use a finger or Apple Pencil; the page does not scroll while you draw.
- Voice answers need Settings > General > Keyboard > Enable Dictation, and Allow when Safari asks
  for the microphone. Typing always works.
- Read-aloud: raise the volume and make sure silent mode is OFF. Better voices: Settings >
  Accessibility > Spoken Content > Voices (download an Enhanced or Premium voice).
- Tip: turn on Guided Access (Settings > Accessibility) before handing the iPad over, so the
  examinee cannot leave the page.

READING ITEMS ALOUD (and the digit-span rule)
---------------------------------------------
Memory words, digits, letters and sentences are spoken by the browser's text-to-speech voice. For
the digit span nothing is ever drawn on the screen. If the browser cannot speak, the exam shows an
"examiner reads aloud" notice and an examiner-only panel (digits hidden behind dots until you press
Show). Press Hide and then hand the device over before the examinee answers. Re-showing the digits
is counted as a replay in the results.

PUTTING IT ON THE WEB
---------------------
Upload the files of this folder (not the zip) to any static HTTPS host: GitHub Pages (Settings >
Pages > Deploy from branch), Netlify Drop, or Cloudflare Pages. Use a non-obvious address; it is
public to anyone with the link. The exam contains no patient data. If you later rename the
repository nothing needs changing (all paths are relative); iPad users re-add the Home Screen icon.

PRIVACY (what leaves the device)
--------------------------------
- The exam makes no network requests of its own. Every page carries a Content-Security-Policy that
  blocks all outgoing connections (connect-src 'none'); no external scripts, fonts or images.
- Only the browser's own speech services can use the network: speech RECOGNITION (Chrome/Edge:
  Google/Microsoft cloud; Safari: Apple) and, if you pick one, a network text-to-speech voice. Use
  no real patient identifiers while testing voice features.

TROUBLESHOOTING
---------------
- "Voice answers are off" notice: you opened the page as a file, or the browser lacks speech
  recognition. Use start-exam.bat and Chrome/Edge.
- "The microphone is blocked": click the lock icon in the address bar, allow it, and reload.
- Port 8765 already in use: an exam window is already running; use it or close it and retry.
- A saved form is missing: forms are stored per browser and per address (a different address or a
  private window has its own list). Export/Import the form file to move it.
- Stroop uses red/blue/green/yellow ink; examinees with colour-vision deficiency may need the
  Stroop section left off. Reaction times depend on the device and are only comparable on the same
  device.

FILES
-----
index.html, choose.js                chooser page
ipad/, windows/                      the two entry pages and their manifests
app.js, core.js, setup.js, ui.js, speech.js, assets.js, styles.css     the app (shared)
icon-*.png, apple-touch-icon.png, _headers, .nojekyll    icons and hosting helpers
start-exam.bat, serve.ps1            local launcher for Windows (PowerShell 5.1+)
CHANGES.md                           what is new in v4
