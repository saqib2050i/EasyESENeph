# Nephron — ESENeph study pipeline

A closed loop for turning the MCQs you grind into a living revision deck.

```
 MCQ PDF/DOCX ──▶ LLM + built-in prompt ──▶ batch.json ──▶ Nephron "Ingest a batch" ──▶ deck (merged by id)
       ▲                                                          │
       └───────────── copy prompt from the app ───────────────────┘   (the APP merges, never duplicates)
```

## Files
| Path | What it is |
|---|---|
| `eseneph-processor-prompt.md` | Human copy of the ingest prompt (the app has the live copy — see below). |
| `nephrology-study.html` | The app shell. Links the styles/scripts under `assets/` and reads `data.json` beside it. |
| `assets/css/` | `themes.css` (colour tokens) + `app.css` (layout & components). |
| `assets/js/` | Plain vanilla JS — `store`, `markdown`, `state`, `srs`, `merge` (ingest engine), `prompt` (the copyable LLM prompt), `app`, `embedded`, and one file per view under `views/`. No build step, no framework. |
| `server.py` + `merge_engine.py` | The backend: a dependency-free Python server that serves the app and a JSON API, and validates/merges/persists ingests. |
| `data.json` | Your accumulating deck (the database; on the server volume). Ships with a real ESENeph batch. |
| `Dockerfile` + `docker-compose.yml` | Builds and runs the server container on your homelab. |

## The weekly loop
1. Do a batch of MCQs, keep the file (question, your answer, correct answer, explanations) — PDF or DOCX.
2. In the app: **Load Data → Copy prompt**. New chat with an LLM → paste the prompt → attach your file.
3. The LLM returns one JSON **batch** (just that file's MCQs). Save it as a `.json`.
4. Back in the app: **Load Data → Ingest a batch** → paste the JSON or drop the file, hit **Validate & preview**, then **Merge & save**. The server validates it and writes it to the database.
5. Weak domains float to the top of the dashboard; new flashcards enter the deck — reflected immediately for every device on the site.

> The merge happens **on the server** — it matches topics/flashcards by their stable `id` slugs, appends attempts, recomputes stats/status, and adds new cards. You no longer paste the old `data.json` into the LLM; you only ever feed it the new file. Re-ingesting the same batch is safe (attempts dedupe).

### Where the deck lives
When served by the bundled server (Docker), the deck is a **JSON file the server owns** (`/data/data.json` on the mounted volume) — that is the "database". Ingesting a batch makes the server **validate** it, merge it, and write it atomically (with a `.bak`), so the change is shared across every device that opens the site. **Export data.json** downloads a copy; **Reload from server** re-reads the live deck.

*(If you instead open the files on a plain static host or via `file://` with no backend, the app falls back to merging client-side and remembering the deck in your browser — same UI, no server writes.)*

## Run it (Docker)
```bash
docker compose up -d --build
# open http://<host-ip>:8973
```
The image is a tiny, dependency-free Python server ([`server.py`](server.py)) that serves the app **and** a small JSON API on one port. The deck persists in `./data/data.json` on the host (the `./data` volume) — on first run it's seeded from the deck baked into the image. No rebuild is needed to change data; ingest through the site.

## Publish to GitHub & auto-build the image (GHCR)
GitHub Actions ([`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)) builds the image and pushes it to **GitHub Container Registry** on every push to `main` (and on `vX.Y.Z` tags) — no secrets to set up, it uses the built-in `GITHUB_TOKEN`.

**One-time: create the repo and push**
```bash
git init && git add . && git commit -m "Nephron: ESENeph study deck"
git branch -M main
# create an empty repo on github.com (or: gh repo create <name> --private --source=. --push), then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Watch **Actions** build it, then find the image under the repo's **Packages** as `ghcr.io/<you>/<repo>`.

**Deploy on Unraid by pulling that image** (no local build) with [`docker-compose.unraid.yml`](docker-compose.unraid.yml):
```bash
# edit the image line to ghcr.io/<you>/<repo>:latest  (or set NEPHRON_IMAGE in .env)
docker compose -f docker-compose.unraid.yml pull
docker compose -f docker-compose.unraid.yml up -d
```
If the GHCR package is **private**, authenticate the host once so it can pull:
```bash
echo <your-PAT-with-read:packages> | docker login ghcr.io -u <you> --password-stdin
```
(or make the package public in GitHub → repo → Packages → package settings → change visibility). To ship an update, push to `main`, then on Unraid `pull` + `up -d` again.

### Deploy on Unraid behind your existing Cloudflare tunnel
1. Add this as a **Compose stack** (or `docker compose up -d --build`). It listens on `8973`.
2. In your **Cloudflare Zero Trust → Tunnels** config, add a *public hostname* (e.g. `nephron.yourdomain.com`) with the service `http://<unraid-ip>:8973`. No new tunnel or `cloudflared` container is needed — reuse the one you have.
3. Because the app and its API are the **same origin**, it works through the tunnel with no CORS or extra config.
4. **The whole site is behind a login (secure by default).** You sign in once per device and a signed **HttpOnly session cookie** keeps you in — **Remember me** ticked lasts ~30 days, unticked ends after ~8 hours (handy on a shared machine). The deck data and all writes require that session; only the app shell and the login screen are public. Username defaults to `admin`; if you don't set a password, the server **auto-generates one on first run** and prints it in the logs:
   ```bash
   docker compose logs nephron | grep -i login
   ```
   To choose your own, copy `.env.example` to `.env` and set `AUTH_USER` / `AUTH_PASSWORD`. Use the **Sign out** button (sidebar) to end a session. For an extra layer (real IdP / MFA), you can still put the hostname behind a **Cloudflare Access** policy on top.

Other hardening: passwords compared in constant time, failed logins throttled, request bodies capped (5 MB → `413`), writes atomic with a `.bak`, and `X-Content-Type-Options: nosniff` on responses.

Nothing needs internet except web-fonts, which degrade gracefully to system fonts offline.

## Without Docker
- **With the server:** `python3 server.py` (needs only Python 3, no packages) → open `http://localhost:8973`. Full ingest/validation works.
- **Truly static:** open `nephrology-study.html` directly. With no backend it can't write server-side, so **Load Data → Ingest a batch** merges client-side and persists in your browser.

### The API (same origin)
| Method & path | Purpose |
|---|---|
| `POST /api/login` | `{ user, password }` → sets the session cookie |
| `POST /api/logout` | clears the session cookie |
| `GET /api/health` | `{ ok, backend, authRequired, authed }` (open) |
| `GET /api/deck` | the live deck (JSON) — **requires session** |
| `POST /api/validate` | raw JSON text → `{ ok, errors, warnings, summary }`, no write — **requires session** |
| `POST /api/ingest?mode=merge\|replace` | validate + merge + persist → `{ ok, summary, deck }` — **requires session** |

## The app
- **Dashboard** — accuracy per curriculum domain (the matrix), overall stats, an accuracy-over-time trend, and a "focus next" list sorted weak-first. "MCQs logged" reflects the actual attempts recorded in your deck.
- **Flashcards** — filter by domain/status; weak cards surface first; grade with **1 / 2 / 3** (or click), **Space** to flip. A box read-out shows how the deck is spread across the Leitner boxes; grades persist via a lightweight Leitner box.
- **High-yield** — every learning point on one page, grouped by domain. Hit **Print / save as PDF** for a clean last-minute sheet.
- **Topics** — full explainers, pitfalls, and the MCQ encounters that generated each topic. Searchable.
- **Load Data** — the data hub: see the active deck and its sources, **ingest** a JSON batch (with a preview of exactly what will change before it saves), **export** `data.json`, **reload from the server file**, and **copy the LLM prompt** used to generate a batch.
- **Theme** — five palettes (Nephron / Night / Paper / Cortex / Contrast), bottom-left, remembered across sessions.

## Notes
- The domain taxonomy lives in the prompt (both in-app and in `eseneph-processor-prompt.md`). Edit it if you want it to match a specific ESENeph blueprint, and the dashboard follows automatically.
- Data lives only in your `data.json` and your browser's local storage — nothing leaves your homelab.
