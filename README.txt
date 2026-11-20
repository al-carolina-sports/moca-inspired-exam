MoCA-INSPIRED COGNITIVE SCREENING (v3.2: iPad + read-aloud)
=========================================
An informal screening inspired by the MoCA. It is NOT the official Montreal Cognitive
Assessment, it has not been validated, and it is not diagnostic.

HOW TO LAUNCH (Windows)
-----------------------
1. Unzip the whole folder somewhere (for example your Desktop). Do not run it from inside the zip.
2. Double-click  start-exam.bat
   - A black window opens ("MoCA-inspired exam is running at http://localhost:8765/").
   - Your default browser opens the exam. Leave the black window open while you use the exam.
   - To stop: close the black window (or press Ctrl+C in it).
3. Use Google Chrome or Microsoft Edge (recommended). If your default browser is something else,
   open Chrome/Edge and go to  http://localhost:8765/  while the black window is running.

If Windows SmartScreen or your antivirus warns about start-exam.bat, choose "More info" > "Run anyway"
only if you trust this folder. The script only serves this folder on your own computer (localhost);
it is not reachable from other computers.

WHY NOT JUST DOUBLE-CLICK index.html?
-------------------------------------
Everything except voice answers works that way (you can type every answer). But Chrome and Edge
block speech recognition on pages opened as files (file://). Speech recognition needs a secure
page, and http://localhost is accepted as secure. If you open index.html directly, the exam shows
a notice at the top telling you to use start-exam.bat; typing keeps working.

MICROPHONE / VOICE ANSWERS
--------------------------
- On the start page, press "Speak" in the Microphone check. The browser asks for permission to use
  the microphone: click ALLOW. (If you clicked Block by mistake: click the lock/mic icon in the
  address bar, allow the microphone, and reload.)
- During the exam each answer box has a "Speak" button. Press it, answer, and the words appear in the
  same box. You can fix them by typing. Typing always works as a fallback.
- Verbal fluency: the Start button begins the microphone and the 60-second timer together. The words
  you say appear live. At 60 seconds it stops itself and lists the words as chips. Click a chip to
  strike it out (names, places, repeats, wrong words) or click again to restore it. 11 or more valid
  words = 1 point.
- Spoken numbers are converted to digits ("seven two eight one" -> 7281).
- Speech recognition is imperfect (accents, background noise, homophones). The clinician should
  review the typed/spoken text and the scores before relying on them. Every score can be changed on
  the results page.

PRIVACY (desktop speech recognition)
-------------------------------------
Speech recognition in Chrome/Edge sends the audio to the browser's cloud speech service (Google or
Microsoft) over the internet. So:
  * Do NOT use real patient names or identifiers while testing voice features.
  * The exam itself stores nothing on a server. Results stay in the browser tab until you download
    the JSON file or close the tab.

USING IT ON AN iPAD (Safari)
----------------------------
The exam is plain static web files, so it runs on an iPad as soon as the files are on an HTTPS web
address (a file:// or http:// address will NOT work for the microphone on Safari). An iPad cannot run
start-exam.bat. See "PUTTING IT ON THE WEB" below for the easiest ways to host it.
- iPadOS 14.5 or later, Safari. Landscape or portrait both work.
- Open the web address in Safari. Optional: Share > "Add to Home Screen" gives a full-screen app icon.
- Trail making, copy-the-figure and clock drawing use the finger or Apple Pencil. The page does not
  scroll while you draw.
- Voice answers (the "Speak" buttons): Safari uses Siri/Dictation, so Settings > General > Keyboard >
  "Enable Dictation" must be ON, and the first time Safari asks for microphone access: tap Allow.
  If dictation is not available the exam says so and you can type every answer instead.
- Verbal fluency: Safari may stop listening on its own after a pause; the exam restarts it
  automatically during the 60 seconds.

READING THE WORDS, DIGITS, LETTERS AND SENTENCES ALOUD
------------------------------------------------------
- On by default (turn off on the start page, or with the "Voice" button at the top during the exam).
- Memory words, digit spans (forward and backward), the letter-tapping list, the extended 7-word list and
  the sentence repetition items are spoken by the browser's own text-to-speech voice. Nothing is shown
  on screen while a voice is reading, so the examinee must listen.
- Words and digits are read one per second. Letters are read one per second; tap the big TAP button
  (or press the space bar) every time the target letter is heard. A tap counts if it is within 1.5
  seconds of the start of that letter. Up to 1 error (missed target or extra tap) still earns the point.
- "Replay" (examiner) repeats a word list, digit list or sentence. Every replay is recorded in the
  results ("REPLAYED n x") and flags the item for review. "Repeat this task" for the letters is also
  recorded and the LAST attempt is scored.
- On the start page, press "Test voice" first. English (US) is chosen by default; you can pick another
  voice and the speaking speed. Better voices: iPad Settings > Accessibility > Spoken Content >
  Voices > download an "Enhanced" or "Premium" voice.
- iPad volume: turn the volume up and make sure the side switch / Control Centre silent mode is OFF,
  otherwise the voice is silent. On the Home Screen app version the same applies.
- If the browser cannot speak at all, the exam says so and shows the items on screen instead.

PUTTING IT ON THE WEB (not done yet; nothing has been published)
----------------------------------------------------------------
Upload the files of this folder (not the zip) to any static HTTPS host. Easiest options:
  1. Netlify Drop (https://app.netlify.com/drop): drag the unzipped folder onto the page. You get a
     https://random-name.netlify.app address in seconds. Sign in to keep it permanently.
  2. GitHub Pages: create a repository (for example under the al-carolina-sports account), upload the files,
     Settings > Pages > Deploy from branch > main / root. Address: https://<account>.github.io/<repo>/
     (free plans need a public repository; the files contain no patient data).
  3. Cloudflare Pages: Workers & Pages > Create > Pages > Upload assets, upload the folder.
The web address is public to anyone who has the link, so use a non-obvious name. The exam contains no
patient data; results exist only inside the browser on the device being used.

PRIVACY (what leaves the device)
--------------------------------
- The exam makes no network requests of its own. The page carries a Content-Security-Policy that blocks
  every outgoing connection (connect-src 'none'), and no external scripts, fonts or images are used.
- Results are never sent anywhere and are not saved: they live in the browser tab until you press
  "Download results" or close the tab.
- The only things that leave the device are the browser's own speech services: (a) speech
  RECOGNITION for the "Speak" buttons (Chrome/Edge: Google/Microsoft cloud; Safari: Apple's service) and
  (b) text-to-speech voices are normally on-device, but the browser may use a network voice if you pick
  one. Use no real patient identifiers when testing.

TROUBLESHOOTING
---------------
- "Voice answers are off" notice at the top: you opened index.html directly, or the browser does not
  support speech recognition. Use start-exam.bat and Chrome/Edge.
- "The microphone is blocked": allow the microphone (lock icon in the address bar) and reload.
- "Could not reach the speech service": speech needs an internet connection.
- Port 8765 already in use: another exam window is already running. Use it, or close it and retry.
- No PowerShell? start-exam.bat falls back to "python -m http.server 8765" if Python is installed.

FILES
-----
index.html, app.js, speech.js, styles.css, assets.js   the exam (no internet libraries needed)
manifest.webmanifest, *.png, _headers, .nojekyll       iPad Home Screen icon/app info and web-hosting helpers
start-exam.bat, serve.ps1                               local server + launcher (Windows PowerShell 5.1+)
CHANGES.md                                              what changed from v2 and why
