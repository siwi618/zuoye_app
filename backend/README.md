# Backend — Zuoyebang

FastAPI service. Auth = Supabase JWT (HS256, audience `authenticated`). DB = Supabase Postgres via supabase-py.

## Run

```bash
# First time only
python3 -m venv .venv                # requires Python 3.11+
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env                 # then fill in Supabase keys

# Every time
source .venv/bin/activate
uvicorn app.main:app --reload        # http://localhost:8000
```

Verify:
- http://localhost:8000/healthz → `{"status":"ok"}`
- http://localhost:8000/docs → Swagger UI
- http://localhost:8000/me without a token → `401`

## Env

See `.env.example`.

| Var | Where to get it |
|-----|-----------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role secret (keep private!) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings → JWT Secret |
| `CORS_ORIGINS` | JSON array of allowed origins, e.g. `["http://localhost:3000"]` |

## Structure

```
app/
├── main.py             # FastAPI app factory + CORS middleware
├── config.py           # pydantic-settings (env vars)
├── deps.py             # auth dependency — verifies Supabase JWT (HS256)
├── supabase_client.py  # server-side client using service-role key (bypasses RLS)
├── routers/            # FastAPI routers, one file per feature area
│   ├── health.py       # /healthz
│   └── me.py           # /me — returns the authenticated user
├── schemas/            # pydantic request/response models (added in Phase 2B)
└── services/           # business logic (added in Phase 2B+)
```

## How auth works

1. Frontend signs the user in against Supabase Auth and gets a JWT (`access_token`).
2. Frontend attaches `Authorization: Bearer <jwt>` to every backend call.
3. `deps.get_current_user` decodes the JWT with `SUPABASE_JWT_SECRET` (HS256, audience `authenticated`) and yields a `CurrentUser` with `id`, `email`, `role`.
4. Routes that need auth do `def handler(user: CurrentUserDep): ...`.

## Docker

```bash
docker build -t zuoyebang-backend .
docker run --rm -p 8000:8000 --env-file .env zuoyebang-backend
```

The image is what Cloudflare Containers will run in production.

## Dev tips

- `uvicorn --reload` watches `app/` and restarts on save.
- If env vars don't load: confirm `.env` lives in the **backend** root and you launched uvicorn from there.
- If CORS breaks the frontend: confirm `CORS_ORIGINS` in `.env` matches the frontend's actual origin (default `http://localhost:3000`).
