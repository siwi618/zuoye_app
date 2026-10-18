# Frontend — Zuoyebang

React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui.

## Run

```bash
# First time only
npm install
cp .env.example .env       # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

# Every time
npm run dev                # http://localhost:3000
```

The dev port is pinned to **3000** in `vite.config.ts` (`strictPort: true`).
If 3000 is occupied, Vite will fail loudly instead of silently switching.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## Structure

```
src/
├── api/              # Supabase client + backend API wrapper
│   ├── client.ts     # fetch wrapper that attaches the Supabase JWT
│   └── supabase.ts   # Supabase browser client (anon key)
├── components/
│   ├── ui/           # shadcn primitives
│   ├── AppLayout.tsx # protected-area shell (top nav + outlet)
│   └── ProtectedRoute.tsx
├── hooks/            # reusable hooks
├── i18n/             # i18next config + en/zh locale files
├── lib/              # utils (cn, …)
├── pages/            # route components (SignIn, SignUp, Dashboard, …)
├── store/            # zustand stores (auth)
├── App.tsx           # router
├── main.tsx          # entry (QueryClient + i18n init + StrictMode)
└── index.css         # Tailwind v4 + shadcn theme tokens
```

## Auth flow

- Sign-up / sign-in happens directly against **Supabase Auth** (the frontend talks to Supabase, not the FastAPI backend).
- A Postgres trigger auto-creates a `profiles` row when a user signs up.
- The Zustand `auth` store subscribes to `supabase.auth.onAuthStateChange` and keeps `session` / `user` fresh.
- `<ProtectedRoute>` redirects to `/login` if there's no session; once authenticated, `<AppLayout>` provides the shared shell.
- API calls to FastAPI go through `src/api/client.ts`, which attaches `Authorization: Bearer <access_token>` automatically.

## Adding shadcn components

```bash
npx shadcn@latest add dialog
```

## Env vars

See `.env.example`. The `VITE_*` prefix is required — only those are exposed to the browser bundle.

| Var | What |
|-----|------|
| `VITE_SUPABASE_URL` | e.g. `https://abcd.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon public** key (safe in browser) |
| `VITE_API_BASE_URL` | Backend base URL — defaults to `http://localhost:8000` |
