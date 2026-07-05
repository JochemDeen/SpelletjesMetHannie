# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Small gaming website for playing games with my mom (Hannie) and a few select family members. Plain Node/Express app, server-rendered static HTML + vanilla JS frontend (no build step, no framework, no bundler). Users are manually added by the admin and stored in a local SQLite database — there is no self-service signup.

Games:
- **Mastermind word game** — daily word-guessing game (like Wordle), shared "word of the day" for all users.
- **Pictionary** — one shared, global game at a time (not per-user rooms): one drawer, everyone else guesses, drawer grades guesses each round.

With 1 or 2 more games planned.

## Commands

- Run the app: `npm start` (runs `node app.js`, default port 3000, override with `PORT` env var)
- No test suite, lint, or build step is configured (`npm test` is a stub).
- Admin/data maintenance is done via one-off scripts in `scripts/`, run manually from the project root (see `scripts/admin-manual.txt` for the full command reference), e.g.:
  - `node scripts/addUser.js` — add a user
  - `node scripts/review-suggestions.js`, `accept-suggestion.js`, `reject-suggestion.js` — moderate user-suggested Pictionary words
  - `node scripts/words-to-remove.js`, `words-to-change.js`, `auto-process.js` — review/apply word-list changes based on rating consensus
  - `node scripts/add-word.js`, `remove-word.js`, `change-difficulty.js` — direct word-list edits
  - These scripts are also intended to be run on the AWS Lightsail host where the app is deployed.

## Environment

Config is loaded via `dotenv` from `.env` (not committed):
- `PORT` — server port (default 3000)
- `SESSION_SECRET` — express-session secret
- `COOKIE_SECURE` — set `'true'` to mark session cookie secure (production/HTTPS)
- `GEMINI_API_KEY` — enables the Mastermind hint feature (`models/hintsService.js`); if unset, hints are reported as unavailable rather than erroring.

Sessions are stored in `sessions.sqlite` via `connect-sqlite3`; app data lives in `database.sqlite` in the project root.

## Key Directories

- `data/` — word lists used by the games (`filtered_woorden.txt`, `5wordlist.txt`, `Pictionary_{easy,medium,hard}.csv`, etc.)
- `middleware/` — `authMiddleware.js` (`requireLogin`)
- `models/` — main game logic; Mastermind logic lives directly in this directory
- `models/pictionary/` — all Pictionary logic
- `models/db.js` — shared SQLite connection and core table creation
- `models/user.js` — user lookups
- `prompts/` — prompts used when requesting Mastermind hints from Gemini
- `public/` — all public-facing code for the Mastermind/shared pages
- `public/pictionary/` — all public-facing code for Pictionary
- `public/images/` — images used on the site
- `public/images/drawings/` — Pictionary drawings get saved here
- `routes/` — `auth.js` (authentication), `games.js` (Mastermind), `pictionary_routes.js` (Pictionary), `ratings.js` (word ratings), `settings.js` (user settings)
- `scripts/` — admin scripts for cleaning up/managing the database, run from the project root (also intended to run on the AWS Lightsail host)

## Architecture

### Request flow
`app.js` wires session middleware (SQLite-backed) and mounts routers at the root: `routes/auth.js`, `routes/games.js`, `routes/pictionary_routes.js`, `routes/ratings.js`, and `routes/settings.js` (mounted under `/settings`). `middleware/authMiddleware.js`'s `requireLogin` checks `req.session.userId` and redirects to `/login` — applied per-route, not globally. A catch-all route redirects unauthenticated requests to `/login` and authenticated ones to `/dashboard`.

Static HTML pages live in `public/` (Mastermind + shared) and `public/pictionary/` (Pictionary), each with a matching vanilla-JS controller in `public/js/` or `public/pictionary/js/` that polls the corresponding `/api/...` JSON endpoints — there is no websocket/push layer, so all "real-time" behavior across players is done via client-side polling of server-authoritative state.

### Database (`models/db.js`)
Single shared `sqlite3` connection, tables created with `CREATE TABLE IF NOT EXISTS` on startup (no migration framework — schema changes are additive `ALTER`/manual scripts, see `models/fix_table.js` for an example one-off migration). Core tables: `users`, `user_settings`, `games` (Pictionary), `actions` (Pictionary guesses/events), `scores`, `pictionary_word_ratings`, `pictionary_word_suggestions`. Mastermind-specific tables (`mastermind_word`, `mastermind_hints`) are created lazily inside `models/wordsService.js` / `models/hintsService.js` against the same `database.sqlite` file rather than in `db.js`.

### Mastermind (word game)
- `models/wordsService.js` — loads candidate words from `data/filtered_woorden.txt` into memory at startup, manages the shared "word of the day" (stored per-date in `mastermind_word`), validates guesses against `data/5wordlist.txt`, and serves Pictionary words per difficulty from the `data/Pictionary_*.csv` files.
- `models/gameResults.js` — per-user guess history/results and stats.
- `models/hintsService.js` — Gemini-backed hint generation, gated by a monthly per-user quota (`MONTHLY_HINT_LIMIT`); prompts are loaded from `prompts/mastermind-hints.json`.
- `routes/games.js` — feedback (`correct`/`misplaced`/`incorrect` per letter, Wordle-style) is computed server-side in `generateFeedback()`; nothing about the word of the day is trusted from the client.

### Pictionary
`models/pictionary/index.js` re-exports everything from the manager submodules as one flat `Pictionary` object used by `routes/pictionary_routes.js`:
- `gameManager.js` — the global game record and its state machine (see below), including drawer rotation logic in `createNewGame` (next drawer = next user id after the last drawer, wrapping around) and the "no game right now, but one finished/started recently" `scoring` pseudo-state used to avoid immediately starting a new game back-to-back.
- `wordManager.js` — assigning the word to draw for a difficulty.
- `drawingManager.js` — saving drawings/modified drawings to `public/images/drawings` and the drawing/modification countdown timers.
- `guessesManager.js` — recording and fetching guesses (`actions` table).
- `scoringManager.js` — computing and persisting round/game scores.
- `ratingsManager.js` — word difficulty ratings and user-suggested words (backs the admin scripts and `routes/ratings.js`).

There is exactly **one active Pictionary game at a time** across the whole site (`games.status = 'ongoing'`), not one per user — `getActiveGame()` is the source of truth everyone's client polls against. The `games.state` column drives a per-game state machine: `choose` → `thinking` → `drawing` → `guessing` → `feedback` → (loop `guessing`/`feedback` per round, or) → `completed`, plus a `modify` side-state letting the drawer touch up their drawing once per round. `routes/pictionary_routes.js` derives a *per-viewer* projection of this shared state (e.g. non-drawers see `idle` during `choose`/`thinking`/`drawing`; non-guessers or users who already guessed this round see `guessing-watching`) rather than exposing the raw row to everyone — keep that distinction in mind when adding new states or fields, since `word`/`image_path` must stay hidden from the wrong role at the wrong phase.

### Logging
`logger.js` (winston) writes to `combined.log`; routes/models log liberally with `logger.info/error` including user ids and game ids, which is the main way to trace a bug across a request without a debugger.
