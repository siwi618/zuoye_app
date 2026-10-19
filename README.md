# Zuoyebang — Peer Homework Help

A web platform where students post help requests (grade / subject / topic), other students accept them, meet online or offline, and leave mutual feedback (1–5 stars + comment). A leaderboard ranks helpers by average rating.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + i18next |
| Backend | Python 3.12 + FastAPI + uvicorn |
| DB + Auth | Supabase (Postgres + RLS + Supabase Auth) |
| Hosting (frontend) | Cloudflare Pages |
| Hosting (backend) | Cloudflare Workers + Containers (Workers Paid plan, $5/mo) |
| CI/CD | GitHub Actions |
| Source | GitHub (private) |

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend (prod) | https://zuoyebang-app.pages.dev |
| Backend API (prod) | https://zuoyebang-backend.lyu331901400.workers.dev |
| Backend Swagger (prod) | https://zuoyebang-backend.lyu331901400.workers.dev/docs |
| Backend health (prod) | https://zuoyebang-backend.lyu331901400.workers.dev/healthz |
| Frontend (local) | http://localhost:3000 |
| Backend API (local) | http://localhost:8000 |
| Backend Swagger (local) | http://localhost:8000/docs |

## Developer consoles

Bookmark these — they're where you actually do operational work.

| What | Where |
|------|-------|
| GitHub repo | https://github.com/siwi618/zuoye_app |
| GitHub Actions runs | https://github.com/siwi618/zuoye_app/actions |
| GitHub Actions secrets | https://github.com/siwi618/zuoye_app/settings/secrets/actions |
| Supabase project dashboard | https://supabase.com/dashboard |
| Supabase SQL editor | Dashboard → SQL Editor |
| Supabase Auth users | Dashboard → Authentication → Users |
| Supabase API keys | Dashboard → Settings → API |
| Cloudflare dashboard | https://dash.cloudflare.com |
| Cloudflare Pages project | Dashboard → Workers & Pages → `zuoyebang-app` |
| Cloudflare Worker (backend) | Dashboard → Workers & Pages → `zuoyebang-backend` |
| Cloudflare Containers | Dashboard → Workers & Pages → `zuoyebang-backend` → Containers |
| Cloudflare API tokens | https://dash.cloudflare.com/profile/api-tokens |

---

## Repo layout

```
zuoyebang/
├── frontend/                  # Vite + React SPA           → frontend/README.md
├── backend/                   # FastAPI + Worker wrapper   → backend/README.md
│   ├── app/                   #   Python FastAPI code
│   ├── src/index.ts           #   Worker that routes traffic into the Container DO
│   ├── Dockerfile             #   image Cloudflare Containers runs
│   └── wrangler.jsonc         #   Worker + Container binding config
├── supabase/                  # SQL migrations + setup notes → supabase/README.md
├── .github/workflows/         # CI/CD
│   ├── deploy-frontend.yml    #   auto-deploys on push to frontend/**
│   └── deploy-backend.yml     #   disabled — workflow_dispatch only (see below)
└── README.md
```

---

## Local development

### Prerequisites

- Node ≥ 22 (see [`frontend/.nvmrc`](frontend/.nvmrc))
- Python ≥ 3.11 (we use 3.12 in the Docker image)
- Docker Desktop (only needed if you want to test the backend container locally)
- A Supabase project — see [`supabase/README.md`](supabase/README.md)
- Env files filled in — see **Env vars** below

### 1. Start the backend (terminal 1)

```bash
cd backend
python3 -m venv .venv              # first time only
source .venv/bin/activate
pip install -e ".[dev]"            # first time only
uvicorn app.main:app --reload      # http://localhost:8000
```

Verify: open http://localhost:8000/docs — Swagger UI lists `/healthz`, `/me`, and the request/feedback routers.

### 2. Start the frontend (terminal 2)

```bash
cd frontend
npm install                        # first time only
npm run dev                        # http://localhost:3000
```

The dev port is pinned to **3000** (`strictPort: true` in [`frontend/vite.config.ts`](frontend/vite.config.ts)). If 3000 is occupied Vite fails loudly instead of switching.

### 3. Sign up and use the app

1. Visit http://localhost:3000 → you'll be redirected to `/login`.
2. Sign up with any email + password (≥ 6 chars) + display name.
   - If Supabase has "Confirm email" enabled, click the verification link in the email.
   - To skip during local testing: Supabase Dashboard → Authentication → Providers → Email → toggle off **Confirm email**.
3. After login you land on the Dashboard. Toggle UI language with **EN / 中** in the top-right.

---

## Env vars

### `frontend/.env` (copy from `frontend/.env.example`)

| Var | Where to get it |
|-----|-----------------|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` public key |
| `VITE_API_BASE_URL` | `http://localhost:8000` for local, prod backend URL otherwise |

### `backend/.env` (copy from `backend/.env.example`)

| Var | Where to get it |
|-----|-----------------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` secret (**never** ship to browser) |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT Settings → JWT Secret |
| `CORS_ORIGINS` | Comma-separated list, e.g. `http://localhost:3000` |
| `ENVIRONMENT` | `development` locally |

CORS: backend defaults to `http://localhost:3000`. If you change the frontend port, update both [`frontend/vite.config.ts`](frontend/vite.config.ts) and `backend/.env`.

---

## Deploy — Frontend (Cloudflare Pages)

**Automatic.** Any push to `main` that touches `frontend/**` triggers [`.github/workflows/deploy-frontend.yml`](.github/workflows/deploy-frontend.yml):

1. Checkout, set up Node 22 (from `frontend/.nvmrc`)
2. `npm ci` → `npm run build` (with `VITE_*` build-time env from GitHub secrets)
3. `npx wrangler pages deploy dist --project-name=zuoyebang-app --branch=main`

Watch a run: https://github.com/siwi618/zuoye_app/actions/workflows/deploy-frontend.yml

### Manual frontend deploy (fallback)

```bash
cd frontend
npm ci
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_API_BASE_URL=https://zuoyebang-backend.lyu331901400.workers.dev \
  npm run build
npx wrangler pages deploy dist --project-name=zuoyebang-app --branch=main
```

### Required GitHub Actions secrets

Set at https://github.com/siwi618/zuoye_app/settings/secrets/actions:

| Secret | Source |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (scopes: Pages: Edit, Account: Read) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar → Account ID |
| `VITE_SUPABASE_URL` | Supabase API page |
| `VITE_SUPABASE_ANON_KEY` | Supabase API page |

(Optional repo variable `VITE_API_BASE_URL` overrides the hardcoded prod backend URL in the workflow.)

---

## Deploy — Backend (Cloudflare Workers + Containers)

**Manual only.** [`.github/workflows/deploy-backend.yml`](.github/workflows/deploy-backend.yml) exists but is set to `workflow_dispatch:` only — see *Backend CI: why it's disabled* below.

```bash
cd backend
npx wrangler deploy
```

This:
1. Builds the Docker image from `backend/Dockerfile`
2. Pushes it to Cloudflare's image registry
3. Updates the Worker (`src/index.ts`) and the Container Durable Object
4. Returns the live Worker URL

First run will prompt OAuth login in a browser — that's expected. After that, OAuth credentials are cached in `~/.wrangler`.

### Backend secrets (one-time setup)

Non-secret config lives in [`backend/wrangler.jsonc`](backend/wrangler.jsonc) under `vars`. Secrets must be set via Wrangler — they're never committed:

```bash
cd backend
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

To list/rotate later:

```bash
npx wrangler secret list
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # overwrites
```

### Backend CI: why it's disabled

`wrangler deploy` calls `GET /accounts/{id}/containers/me` to check Container access. With a custom API token this returns **403** even with `Cloudchamber: Edit` + `User Details: Read`. The scope that actually grants `/containers/me` access isn't surfaced in Cloudflare's Custom Token UI. Until Cloudflare documents this, the backend ships from your laptop via `npx wrangler deploy` (which uses OAuth, not an API token, and works fine).

To re-enable later: uncomment the `push:` block in `.github/workflows/deploy-backend.yml`.

---

## Database — Supabase

Schema, RLS, and triggers live in `supabase/migrations/`:

| File | Purpose |
|------|---------|
| `0001_initial_schema.sql` | `profiles`, `requests`, `feedbacks` tables + `user_ratings` view + auto-profile trigger |
| `0002_rls_policies.sql` | RLS: authenticated SELECT only; writes go through backend service-role |
| `0003_helper_only_ratings.sql` | `user_ratings` view filtered to helper-direction feedback (powers leaderboard) |
| `0004_profile_soft_delete.sql` | `profiles.is_deleted` soft delete: bans the auth user, revokes sessions, hides their requests/feedback, drops them from the leaderboard |
| `0005_forum.sql` | Discussion forum: `forum_posts`, `forum_comments`, post/comment likes, counter triggers, `forum_increment_view()` |
| `0006_moderation_flags.sql` | `moderated` / `moderation_flagged` columns + `moderation_queue` view; a Worker cron re-moderates unchecked rows every 10 min |

### Apply migrations

Dashboard route (current — solo dev, simplest):

1. Supabase Dashboard → SQL Editor → New query
2. Paste each `.sql` file in order → Run

CLI route (for later automation): see [`supabase/README.md`](supabase/README.md).

### Auth philosophy

- **Frontend** uses the Supabase JS client with the `anon` key — signs users up/in, reads public data.
- **Backend** uses the `service_role` key — does all writes after validating the caller's JWT via `GET /auth/v1/user`. This works with HS256 *and* ES256/RS256 (Supabase now defaults to ES256).
- RLS lets authenticated users SELECT; mutations only happen via the backend, which enforces authorization in `app/services/`.

---

## Common dev commands

### Frontend (`cd frontend`)

| Command | What |
|---------|------|
| `npm run dev` | Dev server, HMR, port 3000 |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npx shadcn@latest add <name>` | Add a shadcn component |

### Backend (`cd backend`)

| Command | What |
|---------|------|
| `source .venv/bin/activate` | Activate Python venv |
| `uvicorn app.main:app --reload` | Dev server on :8000 |
| `pytest` | Run tests |
| `docker build -t zuoyebang-backend .` | Build the image Cloudflare Containers runs |
| `docker run --rm -p 8000:8000 --env-file .env zuoyebang-backend` | Run the container locally |
| `npx wrangler deploy` | Deploy Worker + Container to Cloudflare |
| `npx wrangler tail` | Stream live Worker logs |
| `npx wrangler secret list` | List backend secrets |

---

## Troubleshooting / gotchas worth remembering

- **`@cloudflare/containers` Container base class ignores `options.envVars` passed to `super()`** — only `defaultPort` and `sleepAfter` are applied. You must assign `this.envVars = {...}` directly after `super()`. See [`backend/src/index.ts`](backend/src/index.ts).
- **pydantic-settings + `list[str]` silently falls back to default** when JSON parsing of an env var fails. Use a raw `str` field + a `@property` that splits commas. See `cors_origins` in [`backend/app/config.py`](backend/app/config.py).
- **Supabase-py `.maybe_single()` returns `None`** (not a response object) when no rows match — `.data` then raises `AttributeError`. Use `.limit(1).execute().data or []` instead.
- **Docker BuildKit layer cache can skip pushes** even when source changed. If a deploy looks like it didn't pick up your edit, force a cache bust (e.g. touch the Dockerfile or rebuild with `--no-cache`).
- **SPA deep links 404 on Pages** without [`frontend/public/_redirects`](frontend/public/_redirects) → `/* /index.html 200`.
- **Container cold start** is ~2–5s after `sleepAfter = '10m'` of idle. First request after idle will be slow; subsequent requests are instant.

---

## Status

✅ **Phase 2 complete** — end-to-end MVP locally:
- Auth (Supabase Auth: signup / signin / protected routes)
- Request CRUD (post / browse / detail / cancel)
- Accept → schedule → mark-complete flow
- Mutual 1–5 star + comment feedback
- Helper-only leaderboard (Top 10)
- Bilingual (EN / 中) UI

✅ **Phase 3 complete** — deployed to Cloudflare:
- Frontend on Cloudflare Pages
- Backend (FastAPI in Docker) on Cloudflare Containers
- Repo on GitHub (private)

✅ **Phase 5 partial** — GitHub Actions CI/CD:
- ✅ Frontend auto-deploys on push to `main` (`frontend/**` changes)
- ⚠️ Backend auto-deploy disabled — see *Backend CI: why it's disabled* above. Push backend manually with `cd backend && npx wrangler deploy`.
