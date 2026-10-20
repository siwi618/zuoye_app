# Supabase

SQL migrations for the Coral Study database.

## Schema overview

```
auth.users  (managed by Supabase Auth)
   │ 1:1
   ▼
profiles  ──┐
   │        │
   │ 1:N    │ 1:N as helper
   ▼        ▼
requests  ←─── helper_id (nullable)
   │
   │ 1:N
   ▼
feedbacks  (mutual; UNIQUE per (request_id, from_user_id))

user_ratings  (view → per-user avg rating, drives leaderboard)
```

## Applying migrations

### Option A — via Supabase Dashboard (easiest, recommended for now)

1. Open your project at https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `migrations/0001_initial_schema.sql` → Run
4. Repeat for `migrations/0002_rls_policies.sql`

### Option B — via Supabase CLI (later, when we automate)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## What gets created

| Object | Purpose |
|--------|---------|
| `profiles` table | public profile, 1:1 with `auth.users` |
| `requests` table | help requests with status, mode, schedule |
| `feedbacks` table | mutual 1-5 star + comment per request |
| `user_ratings` view | per-user avg rating + count (leaderboard source) |
| Trigger `on_auth_user_created` | auto-creates a profile row when a user signs up |
| Triggers `*_touch_updated_at` | keeps `updated_at` columns fresh |
| RLS policies | authenticated users can SELECT; only the service-role key can mutate |

## Auth / RLS philosophy

- The **frontend** uses the Supabase JS client with the **anon key**. It can sign up / sign in users and read public data (profiles, requests, feedbacks, leaderboard).
- The **backend (FastAPI)** uses the **service-role key**. It does all writes — creating requests, accepting them, recording feedback — after validating the caller's JWT.
- This means even if someone sniffs the anon key, they can't mutate data without going through the backend's authorization checks.
