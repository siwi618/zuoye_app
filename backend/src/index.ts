import { Container } from '@cloudflare/containers'

interface Env {
  CONTAINER: DurableObjectNamespace<ZuoyebangBackend>
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  OPENAI_API_KEY?: string
  CORS_ORIGINS: string
  ENVIRONMENT: string
  MEDIA_VIDEO_ENABLED: string
}

/**
 * Durable Object that owns the FastAPI container.
 *
 * NOTE: the @cloudflare/containers Container base class IGNORES options.envVars
 * passed to super(); only defaultPort/sleepAfter are applied. We must assign
 * `this.envVars` directly after super() for the env to actually reach the container.
 */
export class ZuoyebangBackend extends Container<Env> {
  override defaultPort = 8000
  override sleepAfter = '10m'

  constructor(...args: ConstructorParameters<typeof Container<Env>>) {
    super(...args)
    const [, env] = args
    this.envVars = {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY: env.OPENAI_API_KEY ?? '',
      CORS_ORIGINS: env.CORS_ORIGINS,
      ENVIRONMENT: env.ENVIRONMENT,
      MEDIA_VIDEO_ENABLED: env.MEDIA_VIDEO_ENABLED,
    }
  }
}

function containerStub(env: Env) {
  return env.CONTAINER.get(env.CONTAINER.idFromName('primary'))
}

// Must match the entries in wrangler.jsonc's triggers.crons.
const WEEKLY_CRON = '0 20 * * SUN'
const DAILY_CRON = '5 16 * * *'

function serviceHeaders(env: Env): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const headers: Record<string, string> = { apikey: key }
  // Legacy JWT keys also go in Authorization; new sb_secret_ keys must not.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  return headers
}

/**
 * Delete literature tags no analysis uses any more (see migration 0019). Runs in the
 * database, so the container isn't woken.
 */
async function runTagCleanup(env: Env): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/lit_delete_unused_tags`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    console.error('tag clean-up failed', res.status, await res.text())
    return
  }
  console.log('tag clean-up: deleted', await res.text())
}

/**
 * Settle last month's 「月度冠军」 if it isn't yet (see migration 0030). Runs in the database;
 * daily, so a missed run catches up the next day, and settling twice changes nothing.
 */
async function runChampionSettle(env: Env): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/settle_month_champion`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    console.error('month champion settle failed', res.status, await res.text())
    return
  }
  console.log('month champion:', await res.text())
}

/**
 * Re-moderate rows saved while OpenAI was unreachable (moderated = false).
 * Checks the queue first so an empty queue doesn't wake the container.
 */
async function runModerationSweep(env: Env): Promise<void> {
  const headers = serviceHeaders(env)
  const queue = await fetch(`${env.SUPABASE_URL}/rest/v1/moderation_queue?select=id&limit=1`, {
    headers,
  })
  if (!queue.ok) {
    console.error('moderation queue check failed', queue.status, await queue.text())
    return
  }
  const pending = (await queue.json()) as unknown[]
  if (pending.length === 0) return

  const res = await containerStub(env).fetch('http://container/internal/moderation/sweep', {
    method: 'POST',
  })
  console.log('moderation sweep', res.status, await res.text())
}

/**
 * Worker entry point — route every request to the singleton container.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Internal endpoints are only reachable from the cron below.
    if (new URL(request.url).pathname.startsWith('/internal/')) {
      return new Response('Not found', { status: 404 })
    }
    return containerStub(env).fetch(request)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const job =
      controller.cron === WEEKLY_CRON
        ? runTagCleanup
        : controller.cron === DAILY_CRON
          ? runChampionSettle
          : runModerationSweep
    ctx.waitUntil(job(env))
  },
}
