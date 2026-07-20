# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (also downloads Puppeteer's bundled Chrome into .cache/puppeteer/)
npm install

# Start the server
npm start        # or: node server.js

# Open in browser
open http://localhost:3000

# If port 3000 is busy
lsof -ti:3000 | xargs kill -9

# One-shot PDF render from existing JSON files (no server needed)
node generate-pdf.js   # reads progressive-leader.json + progressive-follower.json → progressive.pdf
```

Requires a `.env` file with `GEMINI_API_KEY=...` (get a free key at aistudio.google.com/apikey). Optional `GEMINI_API_KEY_2=...` — on quota exhaustion the app switches to the second key automatically.

## Architecture

Single-page Express app: image upload → Gemini extracts structured data → Puppeteer renders HTML → PNG returned to browser.

**Request flow (`POST /convert`):**
1. `server.js` receives the uploaded PNG, `danceType` form field, and optional `customTitle`
2. `lib/gemini.js` → `extractFromImage()` sends the image + a dance-specific JSON schema prompt to Gemini, returns an array of `page` objects (one per table on the image, e.g. Leader + Follower)
3. `lib/gemini.js` → `normalizeSummary()` post-processes each page: normalizes Tango/Slow-Fox count values (S→М, Q→Б), calls `repairPageSummary()` and `repairNotes()`
4. `lib/summary-groups.js` → `repairPageSummary()` reconstructs the SUMMARY column — for Tango/Slow-Fox it infers rhythm groups (SS=ММ, QQS=ББМ, SQQ=МББ) from step counts; for other dances it sanitizes the raw data
5. `lib/notes.js` → `repairNotes()` separates the Lead prose block from the numbered Notes list, fixes `notesHeader` routing (`leader` / `follower` / `shared` / `general` / `lead`), and moves misplaced items between the two
6. `lib/render-png.js` → `renderPng()` builds an HTML string via `buildHtml()`/`renderTable()` and screenshots it with Puppeteer at 2× deviceScaleFactor

**Page object shape** (returned by Gemini, used throughout):
```js
{
  title, subtitle, level, commence,
  steps: [{ step, footPosition, dancePosition, alignment, turn, cbm, riseFall, fw, count, beats?, sway? }],
  summary: [{ label, desc, rowSpan, startStep }],
  leadSourceHeader, leadNotes,
  notesSourceHeader, notesHeader,   // 'leader'|'follower'|'shared'|'general'|'lead'
  notes: []
}
```

**Dance types:** `slow-waltz`, `tango`, `slow-fox`, `viennese-waltz`. Tango and Slow Fox have divergent logic:
- Tango: `beats` column (8CT numbers: 1,2 / 3,4 / 5 / 6 / 7,8) replaces `sway`; `normalizeTangoCount()` maps COUNT (S/Q) → М/Б
- Slow Fox: has both `beats` (BEAT column) and `sway` columns; rhythm groups are SS=ММ / QQ=ББ
- Viennese Waltz: `count` column contains digits 1/2/3, not М/Б; no coloured badge rendered
- `inferTangoRhythmGroups()` / `inferSlowFoxRhythmGroups()` rebuild summary from step rhythms when the raw summary is missing or malformed

**Gemini API key fallback:** `GEMINI_API_KEY` → `GEMINI_API_KEY_2` when quota is exhausted (daily limit or unrecoverable 429). **Model fallback chain:** `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-3.1-flash-lite` → `gemini-3-flash-preview` → `gemini-3.5-flash`. Override with `GEMINI_MODEL` in `.env`. Retries on 503/overload; on 429 RPM waits per API hint, on daily quota (`limit: 0`) switches to the next API key (or next model if only one key).

**Frontend** (`public/index.html`): single self-contained HTML file with inline CSS/JS. Dance selector buttons use class `.dance-btn`; the general `button` CSS rule sets `margin-top: 20px` and `width: 100%` — `.dance-btn` must explicitly override these.

**`generate-pdf.js`**: standalone legacy script (no server, no Gemini) — reads `progressive-leader.json` and `progressive-follower.json` and renders a landscape A4 PDF via Puppeteer. Used for one-shot offline rendering; not part of the HTTP server flow.

## Abbreviations

All abbreviations used in dance figure tables (English → Russian) are documented in [`abbreviations.md`](abbreviations.md): dance positions (CP/ЗП, PP/ПП…), holds, footwork (T/H/B…), technical terms (CBM, NFR…), directions (LOD, DC…), rise & fall notation, sway, rhythm patterns (SS/ММ, QQS/ББМ…), and table column names.
