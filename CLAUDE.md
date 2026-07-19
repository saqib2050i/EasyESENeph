# CLAUDE.md — Nephron (ESENeph study deck)

Context for Claude Code working in this repo. Read before editing.

## What this is
A web app that turns logged nephrology MCQs into a revision deck (dashboard, flashcards, high-yield
sheet, topic explainers) for the ESENeph exam. A tiny **Python-stdlib backend** (`server.py`) serves the
HTML shell + `assets/` **and** a small JSON API on one origin, and owns the `data.json` "database". There
is **no build step, no framework, no bundler, no package.json, and no third-party Python packages** — the
front end is plain CSS/JS served as written; the server is stdlib only.

The content pipeline: a human copies the in-app prompt (`INGEST_PROMPT`), feeds an MCQ PDF/DOCX to an LLM,
gets back a JSON **batch**, and pastes/drops it into the Load view. The **server** validates and merges it
into `data.json` by stable `id`. The front end still runs **without** the backend (static host / `file://`)
by falling back to a client-side merge into `localStorage` — so both paths must keep working.

## Repo layout
| Path | Role | Edit? |
|---|---|---|
| `nephrology-study.html` | HTML shell + font links + ordered `<link>`/`<script>` tags | Yes, for markup/wiring changes |
| `assets/css/themes.css` | Colour tokens only (`:root`, `html[data-theme=…]`, swatch colours) | Yes, for themes |
| `assets/css/app.css` | Layout & components. **No colour literals — use tokens.** | Yes, for styling |
| `assets/js/store.js` | Safe `localStorage` wrapper (`store`) | Rarely |
| `assets/js/markdown.js` | `md()` renderer + `esc`/`escAttr`/`mdInline` helpers | Rarely |
| `assets/js/embedded.js` | `EMBEDDED` fallback deck (used when the deck is unreachable) | Rarely |
| `assets/js/state.js` | Shared globals + derived selectors (`totals`, `domainStats`, `activityTrend`…); `backend`/`dataSource` flags | Yes |
| `assets/js/srs.js` | Leitner deck: `srs`, `buildDeck`, `gradeCard`, `boxDistribution` | Yes |
| `assets/js/merge.js` | **Client** ingest engine (no-backend fallback): pure `mergeDecks(base,incoming)→{deck,summary}` | Yes |
| `assets/js/prompt.js` | `INGEST_PROMPT` — the copyable LLM prompt (mirror of `eseneph-processor-prompt.md`) | Yes |
| `assets/js/views/*.js` | One file per view: `renderX()` + `bindX()` (dashboard, flashcards, highyield, topics, **knowledge**, load) | Yes — add views here |
| `assets/js/app.js` | Orchestrator: `VIEWS` registry, `paint`, router, boot, backend detection, API + client ingest, `gotoKb`, theme | Yes |
| `server.py` | Backend: static serving + JSON API (`/api/deck\|validate\|ingest\|health`); atomic writes to `DATA_PATH` | Yes |
| `merge_engine.py` | **Server** merge + validation — must mirror `merge.js` (+ `validate_payload`) | Yes |
| `data.json` | The live deck / seed. **Source of truth for content.** On deploy it lives on the `/data` volume. | Rarely — user data, not code |
| `eseneph-processor-prompt.md` | Human copy of the MCQ-ingest prompt (mirrors `prompt.js` `INGEST_PROMPT`) | Only alongside a schema change |
| `knowledge-base-prompt.md` | Human copy of the KB-article prompt (mirrors `prompt.js` `KB_PROMPT`) | Only alongside a schema change |
| `Dockerfile` / `.dockerignore` | Builds the server image (python:3.12-slim, stdlib only) | Yes if deployment changes |
| `docker-compose.yml` | Builds + runs the server on port 8973, mounts `./data:/data` | Yes if deployment changes |
| `README.md` | Human-facing overview + deploy guide | Keep in sync with behaviour changes |

## The one hard rule: the `data.json` schema is a contract
Four places must agree on this shape: the **renderers** (`assets/js/views/*.js`), the **two merge engines**
(`assets/js/merge.js` for the no-backend path **and** `merge_engine.py` for the server — keep them
byte-for-byte equivalent in behaviour), and the **prompt** — which lives in **both** `assets/js/prompt.js`
(`INGEST_PROMPT`) and `eseneph-processor-prompt.md`. If you add/rename/remove a field, update all of them,
keep the two prompts identical and the two merge engines in lockstep, and read fields **defensively**
(`t.stats?.seen || 0`, `(t.flashcards||[])`) so older `data.json` files still load.

```
meta:   { exam, owner, lastUpdated, totalMcqs, sources:[{name,date,count}] }
topic:  { id, title, domain, subtopic,
          status: "weak"|"review"|"mastered", priority: 1..5,
          stats: { seen, correct },
          encounters: [{ date, source, correct:bool, note }],
          highYield: [string], explainer: markdown-string, pitfalls: [string],
          flashcards: [{ id, front, back, tags:[string] }],
          references: [string] }
kbArticle: { id, title, domain, aliases:[string], summary: markdown,
          sections: [{ heading, body: markdown }],   // ordered; small→few, large→split Acute/Chronic mgmt
          keyPoints: [string], flashcards: [{ id, front, back, tags }],
          references: [string], guideline, lastUpdated,
          links: { topics:[topicId], kb:[kbId] } }   // articles live in deck.knowledgeBase[]
```
`id` (topic, flashcard, kbArticle) values are **stable slugs** — the merge engines match batches by them.
Never regenerate or renumber existing ids in a way that would break that merge. The **knowledge base**
(`deck.knowledgeBase`) is didactic notes, merged by id independently of `topics`; a batch may contain
`topics`, `knowledgeBase`, or both. `allCards()` gathers flashcards from both and **de-dupes by question
text** (topic cards win) so KB cards never duplicate an MCQ card. Markdown (`md()`) supports pipe tables
and `[[kb-id|label]]` links (opened via `gotoKb`); the Knowledge view (`views/knowledge.js`) is the reader.

## Architecture & invariants
- **Split static front end + stdlib backend, no build step.** CSS in `assets/css/`, JS in `assets/js/`, wired via ordered `<link>`/`<script>` tags. `server.py` serves them plus the API. Do **not** add a bundler, npm deps, a JS framework, or a third-party **Python** package without asking — the server must stay `python server.py` on a bare `python:slim` image.
- **One origin.** `server.py` serves the app *and* `/api/*` on the same port, so it sits behind a Cloudflare tunnel with no CORS. Keep it that way — don't split the API onto another port/host.
- **Two runtime modes; both must keep working.** (1) **Backend present** — `boot()` finds `/api/health`; if `authRequired && !authed` it renders the login gate (`showLogin()`) and stops; once signed in it sets `backend=true`, loads `GET /api/deck` (`dataSource='server-db'`), and ingest goes through the server. (2) **No backend** (static host / `file://`) — no auth; falls back to `localStorage` deck → `./data.json` → `EMBEDDED`, and ingest merges client-side via `merge.js` into `nephron-data`. The static path is why the front end stays framework-free and `file://`-safe.
- **Auth gates data, not the shell.** The app shell/assets and `/api/health`, `/api/login`, `/api/logout` are open (so the login screen can load); `/api/deck`, `/data.json`, `/api/validate`, `/api/ingest` require a valid session cookie. `showLogin()` POSTs `/api/login`; success sets the cookie and `location.reload()`s (health then reports `authed`). The sidebar `#signout` button POSTs `/api/logout` and reloads. All API fetches use `credentials:'same-origin'`.
- **Classic scripts, not ES modules — on purpose.** No `type="module"`; top-level `let`/`const`/`function` share one global scope (e.g. `app.js` reassigns `DATA` from `state.js`). Keeps `file://` working. Load order matters: helpers → `embedded` → `state` → `srs` → `merge` → `prompt` → `views/*` → `app` (calls `boot()`).
- **No framework.** Vanilla DOM. Each view file exports `renderX()` (returns an HTML string) and `bindX()`. `app.js` holds the `VIEWS` registry; `paint()` writes the string to `#main` then calls the view's `bind`. Router is `switchView()` / `paint()`.
- **Escape all injected content.** Interpolated text goes through `esc()`/`escAttr()`; markdown through `md()`/`mdInline()`. Don't drop raw `${…}` deck values into HTML.
- **Ingest (backend path).** Load view sends the raw paste/file text to `POST /api/validate` → shows `{errors,warnings,summary}` as `pendingImport`; `applyImport` sends `POST /api/ingest?mode=merge|replace` (auth is the session cookie, sent automatically). The **server** parses/validates (`merge_engine.validate_payload`), merges (`merge_engine.merge_decks`), and **writes `DATA_PATH` atomically with a `.bak`** under a lock. Response `deck` becomes the new `DATA`.
- **Ingest (fallback path).** `merge.js`'s `mergeDecks` is the pure client mirror; `applyImport` commits into `DATA`, `persistDeck()` saves to `nephron-data`, `resetToServer()` re-reads. Both engines: merge by topic+flashcard `id`, dedupe `encounters`, refresh teaching content, recompute `stats`/`status`/`priority` from the cumulative record, advance (never regress) `meta.lastUpdated`, recompute `meta.totalMcqs`.
- **Login-gated, secure by default.** All data/writes require a signed session cookie (`nephron_session`: HmacSHA256 over an expiry, `SESSION_SECRET` persisted in `.session_secret`; cookie is HttpOnly + SameSite=Strict, `Secure` when `X-Forwarded-Proto: https`). `/api/login` takes a `remember` flag → TTL `SESSION_TTL_LONG` (~30 days) or `SESSION_TTL_SHORT` (~8 h); the TTL sets both the cookie `Max-Age` and the signed expiry, so a short session can't be extended client-side. `resolve_auth()` takes `AUTH_USER` (default `admin`) and `AUTH_PASSWORD`, else generates/persists `.auth_password` (0600) and logs it — no open mode. Credentials compared with `hmac.compare_digest`; failed logins `time.sleep(0.4)`. Also: bodies capped at `MAX_BODY` (413), disk writes under `LOCK` + atomic `os.replace` with `.bak`, `X-Content-Type-Options: nosniff` on every response. Don't add an unauthenticated data/write path; don't weaken the cookie flags.
- **Storage is never assumed.** Use the `store` helper (wraps `localStorage`, falls back to in-memory). Keys: `nephron-theme`, `nephron-srs`, `nephron-data` (no-backend fallback deck). The session is a server cookie, **not** in `localStorage`. Do **not** call `localStorage` directly.
- **Offline-capable.** Google Fonts load with system-font fallback; nothing else needs the network.
- **Quality floor:** responsive to mobile, visible focus states, `prefers-reduced-motion` respected, print CSS drives the high-yield → PDF export. Preserve these.

## Theme system
Themes are pure CSS custom properties under `html[data-theme="…"]` blocks in `assets/css/themes.css`. To add a theme:
1. In `themes.css`, add a `html[data-theme="name"]{ --bg … --accent … }` block (mirror the token set of an existing theme) and a `.sw[data-t="name"]{}` swatch colour rule.
2. In the HTML, add a `<button class="sw" data-t="name" aria-pressed="false">` swatch.
That's it — the switcher and persistence are generic. Never hard-code colours in components; use the tokens.

## Flashcard SRS (`assets/js/srs.js`)
`srs` is `{ cardId: boxNumber }`. `buildDeck()` sorts low box first (due), then weak status first.
Grading: Again→box 0, Good→+1, Easy→+2, persisted via `store`. `boxDistribution()` powers the box
read-out on the flashcards view. Keep it this lightweight; no external SRS lib.

## Running & verifying (no test suite — verify manually)
```bash
AUTH_PASSWORD=test DATA_PATH=/tmp/t.json python3 server.py --port 8987   # throwaway deck + known password
docker compose up -d --build         # the real deployment path
# API smoke test (data/writes need the session cookie):
curl -s localhost:8987/api/health                                        # open: authRequired/authed
curl -s -o /dev/null -w '%{http_code}\n' localhost:8987/api/deck         # 401 (not signed in)
curl -s -c /tmp/j -X POST --data '{"user":"admin","password":"test"}' localhost:8987/api/login
curl -s -b /tmp/j -X POST --data '{bad' localhost:8987/api/validate      # now → JSON parse error reported
```
No Node here, so `node --check` isn't available. Sanity-check Python with `python3 -c "import ast,server,merge_engine"`
(after `import ast; ast.parse(...)`), then verify behaviour in a browser. When testing ingest through the browser,
point `server.py` at a **throwaway `--data` copy** so you don't clobber the real `data.json`.

After any change, manually check: the **login gate** blocks the app until sign-in (wrong password → error,
no reload; correct → app loads, session survives a reload; **Sign out** → back to login, `/api/deck` 401);
then all 5 views render, theme persists, a flashcard flips + grades, high-yield prints cleanly; and on the
Load view — paste **and** file ingest both validate, **invalid JSON shows the server error**, a valid batch
previews then **saves to the server** (`GET /api/deck` reflects it; re-ingest adds 0 attempts), **Export**
downloads, **Reload from server** works, **Copy prompt** works. Confirm the **no-backend fallback** still
works (open the HTML statically → `backend:false`, no login, client-side ingest into `localStorage`).
Confirm an *old-shape* deck (missing `stats`/`encounters`, odd `status`) still loads.

## When asked to…
- **Add a content field** (e.g. `mnemonic`): update the schema in **both** prompts (`prompt.js` + `.md`), carry it through **both** merge engines (`merge.js` + `merge_engine.py`), add a defensive (escaped) renderer in the relevant view, and note it in `README.md`.
- **Change validation rules:** edit `merge_engine.validate_payload` (server, authoritative) and keep `validateDeckClient` in `app.js` at least as strict for the fallback path.
- **Add a view:** create `assets/js/views/x.js` with `renderX()` + `bindX()`, add a `<script>` tag before `app.js`, register it in `VIEWS`, add a nav button (`data-view="x"`).
- **Add an API endpoint:** add a branch in `server.py`'s `route()`; keep it same-origin and JSON.
- **Change the domain taxonomy:** it's defined in the prompt (`prompt.js` + `.md`) and mirrored in `merge_engine.TAXONOMY` (for validation warnings). Update both; the dashboard derives domains from data.

## Don't
- Don't add a build step, JS framework, bundler, or any **third-party Python package** — the server is stdlib only.
- Don't switch the scripts to `type="module"` or otherwise break the no-backend / `file://` fallback path.
- Don't split the API onto a different origin/port (breaks the single-tunnel deployment).
- Don't let `merge.js` and `merge_engine.py` (or the two prompts) drift apart.
- Don't write `data.json` from a request handler without the lock + atomic replace in `server.py`.
- Don't break backward compatibility with existing `data.json` files.
- Don't hand-edit `data.json` content to "fix" the app — that's user study data (ingest instead).
- Don't call `localStorage` directly, or interpolate raw deck values into HTML (escape via `esc`/`escAttr`/`md`).
