# MoCA-inspired screening: v3 changes

Informal screening *inspired by* the MoCA. It is **not** the official MoCA, has not been validated, and is not diagnostic. All words, sentences, digit/letter strings, abstraction pairs and animal drawings are original.

Files: `index.html`, `app.js`, `speech.js`, `styles.css`, `assets.js` (the 9 animal line drawings, embedded), `start-exam.bat` + `serve.ps1` (local launcher), `README.txt`. No build step or CDN. **For voice answers, launch with `start-exam.bat`** (see "Microphone" below). Typed answers also work by opening `index.html` directly.

## Why answers "popped up" in the text boxes (v2)

Confirmed from the v2 source. The answers were written into the page itself:

1. **Placeholders contained the answers.** Ghost text in the empty boxes was the right answer:
   - digit span: `placeholder="7281"`
   - serial 7s: `placeholder="93, 86, 79, 72, 65"`
   - delayed recall: `placeholder="FACE, VELVET, CHURCH, DAISY, RED"`
   - fluency: `placeholder="farm, fox, food, ..."`
   - orientation: format hints
   This is what you saw. The delayed-recall box showed the whole word list in grey.
2. **The stimulus stayed on screen** next to the box: the digits (7 - 2 - 8 - 1) in the digit-span prompt and the sentence in the repetition item. There was no memory demand.
3. **Back button and sidebar.** You could go back to the word-list screen and read the words again.
4. **No autofill protection.** Fields had no `autocomplete="off"`, no unique names, and spellcheck/autocorrect were on. Browser history or autofill can offer previously typed entries.

Other v2 problems found and fixed:
- **Orientation always scored 0**, even with correct answers (confirmed in a headless run). The scoring function was handed one string instead of the field values.
- Drawings were never scored.
- Fluency counted any 5 "f" words as a pass.
- Most items were 3-option multiple choice with an obvious answer (lion, "transportation").
- Every session was identical.
- A new `window` listener was added each time a drawing screen was shown.
- A live running score was visible during the test.
- "Open clinician review" skipped the test.

## Pop-up fix (v3)

- Every answer box is created fresh for each screen, and nothing is carried over between screens.
- Each box gets a random, never-reused `name`/`id` (browsers key autofill history on these).
- `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"`, password-manager ignore flags.
- No `placeholder`, no `value`, no `<datalist>`. Boxes are wrapped in a form that never submits.
- Correct answers are never written into the DOM. They stay in JavaScript memory and are not exposed on `window`.
- Stimuli (words, digits, letters, sentences) are removed from the page after their display time. The delayed-recall screen contains none of the words.
- No Back button. Earlier screens cannot be reopened. The sidebar shows domain names only.
- Fields are blanked when a screen is removed and on "New session". The session state is replaced.
- The live score is hidden until the end.

## Structure (follows the 30-point layout of the paper form; all items original)

| Domain | Pts | Task |
|---|---|---|
| Visuospatial/Executive | 5 | Click-to-connect alternating trail (1-A-2-B...; random positions); cube copy (random orientation); clock at a random set time (contour, numbers, hands). Drawings are scored by the clinician with the score boxes on the results page. |
| Naming | 3 | 3 of 9 original realistic line drawings, **typed** (not multiple choice). |
| Memory | 0 | 5 words from a pool of 13 categories, **two** learning trials, timed one-at-a-time presentation. |
| Attention | 6 | Forward 5 digits and backward 3 digits (shown one at a time, then hidden); letter tapping (random target, 30 letters, 9 targets, ≤1 error); serial 7s from a **random start** (92-129), one answer at a time, scored 3/2/1/0. |
| Language | 3 | 2 sentence repetitions (shown briefly, then hidden; from a pool of 16); fluency in 60 s with a random letter, threshold ≥11 words. |
| Abstraction | 2 | 2 **typed** answers from 12 pairs (keyword auto-score plus clinician check). |
| Delayed recall | 5 | Uncued typed recall after the other tasks. Then unscored category cues and unscored multiple choice for missed words only, after the uncued answer is locked. |
| Orientation | 6 | Date, month, year, weekday, place, city. |

- **Total /30**, with an optional +1 for ≤12 years of education. It is set in the setup screen and can be toggled on the results page.
- The results page shows a per-domain breakdown, memory-trial results, delay length, the drawings, and an editable per-item score list so the clinician can override any score. There are also clinician notes, JSON download and Print.
- The ">=26" reference line is shown with a "not validated" caveat.
- **Optional Extended (harder) mode.** It is reported separately and is not part of the 30:
  - an extra 7-word list recalled after the other extended tasks
  - 7-digit forward and 5-digit backward spans
  - serial 13s
  - a longer 8-pair trail
  - 2 harder abstraction pairs
  - Extended score is out of 15.

## Microphone / voice answers (added after the first v3)

- **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`), `en-US`, `continuous = true`, `interimResults = true`.
- **Needs a secure context.** Chrome/Edge do not allow speech recognition from `file://`. `start-exam.bat` runs `serve.ps1`, which serves the folder on `http://localhost:8765/` using PowerShell's built-in `HttpListener`, with no Python dependency and loopback only. It opens the default browser. If PowerShell is missing it falls back to `python -m http.server` when Python is installed.
- **Clear notice when voice can't work.** A banner at the top appears for `file://`, an unsupported browser or an insecure context. It says to use `start-exam.bat`, and typed answers still work. Mic errors (blocked permission, no microphone, no network) also show a specific message. Mic buttons are disabled when voice is unavailable.
- **Mic buttons, typed fallback kept**, on:
  - animal naming
  - memory learning trials and delayed recall, including the hint round
  - digit spans (spoken number words become digits, including homophones like "to" and "won")
  - serial 7s and 13s
  - sentence repetition
  - abstraction
  - orientation (spoken date, ordinals like "nineteenth", and years like "twenty twenty six" are converted)
  - a microphone check on the start page
- **Same hardened fields.** Transcripts are written into the same fresh, random-named, autocomplete-off, placeholder-free fields. Nothing is added to the page ahead of time, and the mic is stopped whenever a screen is left.
- **Verbal fluency (60 s).**
  - One Start button starts the microphone and the timer together. The live transcript shows in its own read-only field. A typed box stays available, and the mic restarts itself if the browser ends a recognition session early.
  - It stops itself at 60 s. Unique words beginning with the target letter are extracted into an **editable chip list**:
    - repeats are removed
    - filler words, known names/places, and same-stem repeats (fish/fishing, farm/farmer) are flagged and auto-struck
    - a capitalised mid-sentence word is flagged only
  - The clinician clicks chips to strike or restore them, or adds a missed word, before scoring. 11 or more valid words earns 1 point. The struck and valid lists are kept in the result detail.
- **Sentence repetition** now reports a word-level match against the target (matched, missing and extra words). Only an exact match scores automatically, and spoken answers are flagged "verify". US spellings are used so speech output matches.
- **Naming** ignores filler such as "It's a ...".
- `speech.js` holds the pure parsing code (number words, years, fluency extraction, word match) and is unit-tested in Node.
- Privacy: browser speech recognition uses a cloud speech service. Don't use real patient identifiers when testing (see `README.txt`).

## Testing

Automated headless Chrome test (puppeteer-core) that steps through every section to the results screen. It checks:
- no console errors or failed requests
- every input is blank, with no placeholder, and has autocomplete/spellcheck/autocorrect off and a random name
- the memory words, digit string and sentence are absent from the DOM on the recall screens
- no Back button
- "New session" clears everything
- a perfect run scores 30/30 (plus 15/15 extended) once the drawings are scored, and a blank run scores 0

Added for voice:
- The same end-to-end run with a mocked `SpeechRecognition`, speaking every answer, also reaches 30/30 and 15/15. It checks that en-US, continuous and interim results are set, and that the fluency chips, strike/restore, add-word and auto-restart all work.
- Banner checks cover `file://`, no speech API, and a blocked-microphone error.
- 61 unit assertions cover the number-word parser and the fluency extractor.
- `serve.ps1` parses cleanly and was run under PowerShell 7 on Linux (loopback only, path traversal blocked). It was **not run on Windows**.


# v3.2: iPad support and spoken stimuli

**Read aloud (speechSynthesis; browser built-in, no external service)**
- Memory words (both trials and the extended 7-word list), forward/backward digit spans, the letter-tapping list and the sentence-repetition items are spoken. Each word/digit/letter is a separate utterance, one per second (not one long sentence). Nothing is shown while a voice is speaking.
- Letter tapping: letters read at 1/second; big TAP button (touch `pointerdown`, space bar also works). A tap counts if it lands between the letter's start and 1.5 s later; scoring uses the real start time of each spoken letter (the engine's `start` event). 0-1 errors (misses + extra taps) = 1 point. Double taps within 0.7 s of a hit are ignored. Tap times, letter onsets and the mode are in the JSON export.
- Letters are respelled for the voice ("ay", "bee", "see"...) so voices say the letter name instead of a word. Digits are spoken as words.
- Examiner **Replay** per item; every replay is logged on the item ("REPLAYED n x by examiner"), flags it for review and appears in the JSON. Repeating the letter task is also logged and the last attempt is scored.
- Start page: voice on/off, voice picker (en-US preferred by default), speed (0.9 default), "Test voice". Header "Voice" button toggles during the exam.
- iOS/Safari: speech is started from a tap (the Play/Start buttons) and a silent utterance unlocks audio on the first touch; voices load asynchronously (re-read on `voiceschanged` and polled); notes about volume and the silent switch.
- If speechSynthesis is missing or errors, the exam keeps going and shows the items on screen with a notice.

**iPad / Safari**
- Pointer events everywhere (trail making, TAP, drawing); `touch-action: none` and prevented scrolling while drawing; canvas scaled by devicePixelRatio; 44-48 px minimum tap targets; no hover-only UI; portrait and landscape layouts; viewport meta with safe-area padding.
- Speech recognition uses `webkitSpeechRecognition` on Safari 14.5+ (needs Dictation). Fluency auto-restarts when Safari ends the session early. Clear notice if unavailable; typing always works.
- Web app manifest, `apple-touch-icon` and original icons for Add to Home Screen.
- Content-Security-Policy meta (`connect-src 'none'`): the page cannot send data anywhere. `_headers` (Netlify/Cloudflare) and `.nojekyll` (GitHub Pages) are included. Nothing has been published.

**Fixed along the way**: pending speech is aborted when the examiner presses Continue; fields no longer auto-focus on iPad (no surprise keyboard); the sidebar collapses to a compact row in portrait.

**Tests**: 89 unit assertions (adds letter-name respelling, schedule planning and letter-tap scoring: hits, misses, false taps, double taps, window edges, ordering, time scaling); headless end-to-end runs with a mocked speechSynthesis (spacing between spoken items, stimuli never on screen, default voice/rate, replay logging, late-loading voices, no-TTS fallback) in desktop, file://, iPad landscape 1024x768 and iPad portrait 768x1024 touch emulation. See the test summary delivered with this build. Not verifiable here: a real iPad, real Safari, real TTS voices and the silent switch.
