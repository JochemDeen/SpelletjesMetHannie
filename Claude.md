# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Small gaming website for playing games with my mom (Hannie) and a few select family members. Plain Node/Express app, server-rendered static HTML + vanilla JS frontend (no build step, no framework, no bundler). Users are manually added by the admin and stored in a local SQLite database — there is no self-service signup.

Games:
- **Woordle** (internally still called **Mastermind**: URLs `/mastermind`, tables `mastermind_*`, `models/mastermind/`) — daily word-guessing game like Wordle, one shared "word of the day" for all users. Players only ever see the name Woordle.
- **Pictionary** — one shared, global game at a time (not per-user rooms): one drawer, everyone else guesses, drawer grades guesses each round.
- **Wie ben ik** — one shared, global game at a time: players vote for a theme, everyone gets a secret character (visible to the others, not to yourself), and per round everyone asks one question which the other players then answer by voting Ja/Nee/??. A player can turn their question into a guess; a Gemini-backed judge suggests to the voters whether the guess is right, and a majority of Ja votes wins the game.

## Commands

- Run the app: `npm start` (runs `node app.js`, default port 3000, override with `PORT` env var)
- No test suite, lint, or build step is configured (`npm test` is a stub). CI (`.github/workflows/ci.yml`) only runs `npm audit --audit-level=high` and checks that the server starts; Dependabot (`.github/dependabot.yml`) opens weekly dependency PRs.
- The Lightsail server runs Node 18.20.4 on Debian 12 (glibc 2.36). Keep `sqlite3` on 5.x until the server is upgraded: the Linux binary of `sqlite3` 6 needs glibc 2.38. The `package.json` overrides move sqlite3 5's build-time tools (`node-gyp`, `tar`) to patched versions. CI runs in Debian 12 containers with Node 18 and 24, and Dependabot ignores sqlite3 major updates.
- Admin/data maintenance is done via scripts in `scripts/`, run manually from the project root (full reference in `scripts/README.md`), e.g.:
  - `node scripts/addUser.js <username> <password>` — add a user
  - `node scripts/word-dashboard.js` — review Pictionary word ratings and suggestions; `accept-suggestion.js`, `reject-suggestion.js`, `auto-process.js`, `add-word.js`, `remove-word.js`, `change-difficulty.js` apply changes
  - `node scripts/check-mastermind-scores.js` — read-only recomputation of the Woordle monthly scores / months won, to compare with the scoreboard
  - `node scripts/cleanup-drawings.js [--delete]` — unused Pictionary drawing files
  - `node scripts/generate-images.js` — dev-only, generates candidate site images with Gemini
  - These scripts are also intended to be run on the AWS Lightsail host where the app is deployed.

## Environment

Config is loaded via `dotenv` from `.env` (not committed):
- `PORT` — server port (default 3000)
- `SESSION_SECRET` — express-session secret
- `COOKIE_SECURE` — set `'true'` to mark session cookie secure (production/HTTPS)
- `GEMINI_API_KEY` — enables the Woordle hints ("Ollie", `models/mastermind/hintsManager.js`), the Wie ben ik guess judge (`models/wieBenIk/llmJudge.js`), and the Pictionary grade suggester (`models/pictionary/gradeSuggester.js`), which all call Gemini through `models/gemini.js`; if unset, hints are reported as unavailable and guesses/grades simply get no LLM suggestion, rather than erroring.
- `LOG_LEVEL` — optional winston level (default `info`; `debug` adds the per-poll game dumps)

Sessions are stored in `sessions.sqlite` via `connect-sqlite3`; app data lives in `database.sqlite` in the project root (both resolved relative to the project, not the working directory).

## Key Directories

- `data/` — word lists used by the games (`filtered_woorden.txt`, `5wordlist.txt`, `Pictionary_{easy,medium,hard}.csv`, `wie_ben_ik_personages.json`, etc.)
- `middleware/` — `authMiddleware.js` (`requireLogin`)
- `models/mastermind/`, `models/pictionary/`, `models/wieBenIk/` — game logic, one folder per game, each with an `index.js` re-exporting its managers as one flat object
- `models/db.js` — the one shared SQLite connection and core table creation
- `models/gemini.js` — the one Gemini text call (`callGemini`, 15 s timeout, model id in one constant)
- `models/user.js` — user lookups
- `prompts/` — prompts used for the Gemini calls (Woordle hints, Wie ben ik guess judge, Pictionary grade suggester)
- `utils/` — `servePage.js` (route handler for the static pages) and `wordAdmin.js` (word-list editing for the admin scripts)
- `public/` — shared pages (login, dashboard, settings) and the Woordle pages; `public/css/base.css` holds the shared look (colour tokens, Nunito font, header, buttons, cards, toasts, modal) and `public/js/common.js` the shared helpers (`api()`, `toast()`, `poll()`, `escapeHtml()`) that every page loads
- `public/pictionary/` — all public-facing code for Pictionary
- `public/wie-ben-ik/` — all public-facing code for Wie ben ik
- `public/images/` — images used on the site (dashboard cards, eraser icon); icons are inline SVG
- `public/images/drawings/` — Pictionary drawings get saved here
- `routes/` — `auth.js` (login, dashboard, `/api/me`), `mastermind_routes.js` (Woordle), `pictionary_routes.js` (Pictionary), `wie_ben_ik_routes.js` (Wie ben ik), `ratings.js` (Pictionary word ratings), `settings.js` (user settings)
- `scripts/` — admin scripts for cleaning up/managing the database, run from the project root (also intended to run on the AWS Lightsail host)

## Architecture

### Request flow
`app.js` serves static assets (css/js/images) before the session middleware, then mounts routers at the root: `routes/auth.js`, `routes/mastermind_routes.js`, `routes/pictionary_routes.js`, `routes/wie_ben_ik_routes.js`, `routes/ratings.js`, and `routes/settings.js` (under `/settings`). `middleware/authMiddleware.js`'s `requireLogin` checks `req.session.userId` and redirects to `/login`; it is applied per API route, and every `.html` file under `public/` is only served to logged-in users. A catch-all route redirects unauthenticated requests to `/login` and authenticated ones to `/dashboard`.

Static HTML pages live in `public/` (shared + Woordle), `public/pictionary/` and `public/wie-ben-ik/`, each with a vanilla-JS controller that calls the `/api/...` JSON endpoints — there is no websocket/push layer, so all "real-time" behavior across players is client-side polling (`poll()` from `common.js`, paused while the tab is hidden) of server-authoritative state. Every page shares the same head and `.site-header` markup (home button, title, pill navigation with `aria-current="page"`); Wie ben ik pages add `class="theme-wbi"` on `<body>` for their dark navy/gold variant of the same tokens.

### Database (`models/db.js`)
Single shared `sqlite3` connection (with a busy timeout) used by every module, tables created with `CREATE TABLE IF NOT EXISTS` on startup. There is no migration framework: schema changes are additive and run on startup, like the `game_date` column added in `models/mastermind/schema.js` (check `PRAGMA table_info`, `ALTER TABLE ... ADD COLUMN`, backfill). Core tables in `db.js`: `users`, `user_settings`, `games` (Pictionary), `actions` (Pictionary guesses/events), `scores`, `pictionary_word_ratings`, `pictionary_word_suggestions`. Woordle tables (`mastermind_word`, `mastermind_results`, `mastermind_hints`) are created in `models/mastermind/schema.js`, Wie ben ik tables in `models/wieBenIk/schema.js`.

### Woordle (Mastermind)
- `models/mastermind/dates.js` — a Woordle day is the **Dutch** day (`todayNL()`, Europe/Amsterdam): the word changes at midnight in the Netherlands. Each guess stores its day in `mastermind_results.game_date`; rows from before October 2026 were backfilled with their UTC day so history didn't shift. Use these helpers, never `new Date().toISOString().slice(0, 10)`.
- `models/mastermind/wordManager.js` — loads candidate words from `data/filtered_woorden.txt`, picks the shared word of the day (stored per date in `mastermind_word`, race-free via `INSERT OR IGNORE`), validates guesses against `data/5wordlist.txt`, and computes the Wordle-style feedback (`generateFeedback`, `correct`/`misplaced`/`incorrect` per letter). Nothing about the word is trusted from the client; the answer is only sent once the player's game is over.
- `models/mastermind/resultsManager.js` — guesses, per-day results (`getDailyResults`), personal stats (streaks, distribution), and the monthly scoreboard. Daily points: 8/6/4/3/2/1 for solving in 1–6 guesses, 0 otherwise. A month's winners are everyone tied on the top score, but only if that score is above 0; "months won" only counts finished months.
- `models/mastermind/hintsManager.js` — Ollie's Gemini hints, one per day and `MONTHLY_HINT_LIMIT` per month; prompts in `prompts/mastermind-hints.json`.
- `routes/mastermind_routes.js` handles one guess per player at a time (in-process queue), so a player can't exceed 6 guesses with parallel requests.

### Pictionary
`models/pictionary/index.js` re-exports everything from the manager submodules as one flat `Pictionary` object used by `routes/pictionary_routes.js`:
- `gameManager.js` — the global game record and its state machine (see below), including drawer rotation logic in `createNewGame` (next drawer = next user id after the last drawer, wrapping around) and the "no game right now, but one finished/started recently" `scoring` pseudo-state used to avoid immediately starting a new game back-to-back.
- `wordManager.js` — the word lists (`loadWordList`, read fresh each time because the admin scripts edit them) and assigning the word to draw.
- `drawingManager.js` — drawing and touch-up deadlines (`games.drawing_completed_at`, ISO strings) and saving drawings to `public/images/drawings` (validated 800×400 PNG, new file per save).
- `guessesManager.js` — recording and fetching guesses (`actions` table).
- `scoringManager.js` — computing and persisting round/game scores.
- `ratingsManager.js` — word difficulty ratings and user-suggested words (backs the admin scripts and `routes/ratings.js`).

There is exactly **one active Pictionary game at a time** across the whole site (`games.status = 'ongoing'`), not one per user — `getActiveGame()` is the source of truth everyone's client polls against. The `games.state` column drives a per-game state machine: `choose` → `thinking` → `drawing` → `guessing` → `feedback` → (loop `guessing`/`feedback` per round, or) → `completed`, plus a `modify` side-state letting the drawer touch up their drawing once per round (recorded as a `modify_drawing` action when it starts; re-entering returns the running deadline). `routes/pictionary_routes.js` derives a *per-viewer* projection of this shared state (e.g. non-drawers see `idle` during `choose`/`thinking`/`drawing` and `guessing-watching` during `feedback`/`modify`; users who already guessed this round, and the drawer while others guess, see `guessing-watching`; non-players get `Off`) rather than exposing the raw row to everyone — keep that distinction in mind when adding new states or fields, since `word`/`image_path` must stay hidden from the wrong role at the wrong phase. For the same reason the past-game endpoint (`/api/pictionary/get-game`) refuses ongoing games, and `set-difficulty` (whose response contains the word) is drawer-only during `choose`. When a drawer abandons a turn, `GET /api/pictionary/state` resolves it 30 s after the deadline (drawing → game ends as empty drawing via `handleEmptyDrawing`; touch-up → back to `feedback`), so the shared game never gets stuck. The drawing UI lives in `public/pictionary/js/drawing-board.js` (`DrawingBoard`: Pointer Events, stroke list for undo/redo/clear/fill, devicePixelRatio-sharp, logical 800×400, strokes saved in localStorage so a reload keeps the drawing).

### Wie ben ik
`models/wieBenIk/index.js` re-exports the manager submodules as one flat `WieBenIk` object used by `routes/wie_ben_ik_routes.js`:
- `schema.js` — creates the `wbi_games`, `wbi_players`, `wbi_questions`, `wbi_votes` and `wbi_scores` tables (lazily, on first require).
- `characterManager.js` — loads `data/wie_ben_ik_personages.json` (8 themes plus the synthetic `alle` "all categories" option) and picks distinct random characters.
- `gameManager.js` — the global game record and state machine, theme voting (most votes wins, random tie-break; a player can change their vote until everyone has voted, and the "Verras me!" option is translated to a random real theme by the route before it is stored) and the 24h `scoring` pseudo-state after a game finishes (same pattern as Pictionary).
- `questionsManager.js` — questions/guesses per round, Ja/Nee/?? votes, and the round-resolution logic (`checkForEndOfVoting`: a guess with more Ja than Nee votes wins the game, otherwise the next round starts).
- `scoringManager.js` — a win counts as one entry (score 1) per winner, last-game/monthly scoreboards.
- `llmJudge.js` — Gemini call comparing a guess against the player's real character, returns `'ja'`/`'nee'`/`null` (never throws; prompt in `prompts/wie-ben-ik-judge.json`).

Like Pictionary there is exactly **one active game at a time** (`wbi_games.status = 'ongoing'`), auto-created from users with the `wieBenIkEnabled` setting (needs ≥ 2). When a user has no explicit `wieBenIkEnabled` row, it falls back to their `pictionaryEnabled` setting (then to on), so at rollout only Pictionary players joined automatically. The `wbi_games.state` machine is `theme_vote` → (`question` → `voting` per round) → `completed`. The route derives a per-viewer projection (`theme-vote[-waiting]`, `question[-waiting]`, `voting[-waiting]`, `scoring`, `Off`) and hides the viewer's own character while the game is ongoing; vote tallies for the current round stay hidden until the round is resolved. Logged-in non-participants spectate an ongoing game (`spectate-{theme-vote,question,voting}` states): they see the question history (current-round texts only once the question phase is over) but no characters at all. The past-game endpoint (`/api/wie-ben-ik/get-game`) only serves completed games, with all characters revealed. `/wie-ben-ik/personages` is a character browser (all figures per theme, linked from the theme-vote screen); its data endpoint (`/api/wie-ben-ik/characters`) returns 403 while a game is live (any state past `theme_vote`).

### Logging
`logger.js` (winston) writes to `combined.log` (rotated at 5 MB, 5 files). Extra arguments are printed, so `logger.error('Something failed:', err)` logs the message and stack. Routes/models log with `logger.info/error` including user ids and game ids, which is the main way to trace a bug across a request without a debugger; high-volume per-poll logging uses `logger.debug`.
