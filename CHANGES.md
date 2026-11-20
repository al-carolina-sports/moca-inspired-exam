# Cognitive Exam v4.0: changes from v3

Informal cognitive exam. **Not validated and not diagnostic.** All items are original.

## Renamed and re-scoped
- The product is now **Cognitive Exam** (UI, page titles, manifests, README, export JSON and file names).
- Everything the examiner could not change in v3 is now configurable (see below), with a Randomize button per item.

## Two entry links, one build
- `/ipad/` and `/windows/` load the same `core.js`, `setup.js`, `app.js`, banks and scoring, so results compare. The root `index.html` offers both links.
- Platform flag: `<html data-platform="ipad|windows">`. iPad: larger touch targets, Safari Dictation hints, touch-first drawing, Add-to-Home-Screen manifest with `start_url "./"` (= `/ipad/`). Windows: mouse/keyboard friendly, Chrome/Edge Web Speech hints, wider two-column setup.
- Relative paths only (GitHub Pages sub-path safe, `file://` safe). Saved forms are shared by both entries (same origin).
- The platform is recorded in every export.

## Examiner setup (new first screen)
| # | Item | Examiner controls |
|---|------|-------------------|
| 1 | Alternating trail | numbers+letters, **plants+animals** (original SVG icons with sequence badges), numbers+weekdays, numbers+months; 5 pairs, scored completed with 0 errors |
| 2 | Copy the figure | cube, **triangular prism, square pyramid, hexagonal prism** (wire-frame, random orientation), 1 point by hand with per-shape criteria |
| 3 | Clock | unchanged |
| 4 | Naming | pick 3 animals from the picture library; editable accepted answers |
| 5 | Memory | 5 words, optional category cue, distractors typed or from the category bank |
| 6 | Digit span | typed 5 forward / 3 backward digits, validated; **heard only, never shown** (see below) |
| 7 | Letter tapping | unchanged |
| 8 | Serial 7s | starting number (20-200, default random 80-100) |
| 9 | Sentence repetition | 2 sentences typed or picked from 16 |
| 10 | Letter fluency | choose the letter |
| 11 | Abstraction | 19 original pairs with scoring keywords; choose 2 or add a custom pair |
| 12 | Delayed recall | uses your memory words |
| 13 | Orientation | unchanged |
| Ext | Extended section | own 7 words, digit strings, serial start, pairs |

## New optional "Additional measures" (scored separately, outside the /30)
Category fluency (animals, 60 s, optional threshold), Stroop colour-word (about 20 incongruent trials: accuracy, mean RT), 3-step command following (tap shapes/colours in order), reverse spelling (default WORLD), simple reaction time (about 10 trials, median ms).

## Forms
- Save under a name (Form A, B ...) in localStorage; load, delete, "New form" (next name, randomized); Export/Import as JSON. Imports are validated and hash-checked (a hand-edited file is rejected).
- Every export records: form name, SHA-256 hash of the form contents, the contents themselves, app version `4.0`, platform, session ID, optional participant ID (the box warns if it looks like a name). A CSV of item scores is offered next to the JSON.

## Hand-over
After setup a "Hand device to examinee" screen removes the setup from the page, so typed answers can never be seen during the exam.

## Digit span: no visual cues
Digits are spoken at 1 per second and the page never contains them while the examinee is doing the task. Replays are logged. If speech is unavailable an examiner-only panel (masked until Show) is used, with a notice to read the digits aloud and hide the panel before handing the device over.

## Windows launcher (start-exam.bat / serve.ps1)
Runs with `-ExecutionPolicy Bypass`; removes the downloaded-from-the-internet mark from the folder first (`Unblock-File`); shows a visible message; pauses on error; falls back to `127.0.0.1` if `localhost` cannot be bound; Python fallback; opens `/windows/`.

## Kept
CSP with `connect-src 'none'` (no outbound requests), speech in/out, touch drawing, iPad Safari support, per-item scoring review.

## Tests
Unit (speech and core), end-to-end for both entries (perfect / blank / voice / extended / all extras / each trail pattern and figure / TTS on, off, late, none / file:// / iPad landscape and portrait) and a setup/forms/static suite (validation, randomize, save/load/delete, cross-entry sharing, export/import, tamper rejection, chooser, manifests, no banned strings).
