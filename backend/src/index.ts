import { Container } from '@cloudflare/containers'

interface Env {
  CONTAINER: DurableObjectNamespace<ZuoyebangBackend>
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  OPENAI_API_KEY?: string
  CORS_ORIGINS: string
  ENVIRONMENT: string
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
    }
  }
}

function containerStub(env: Env) {
  return env.CONTAINER.get(env.CONTAINER.idFromName('primary'))
}

/**
 * Re-moderate rows saved while OpenAI was unreachable (moderated = false).
 * Checks the queue first so an empty queue doesn't wake the container.
 */
async function runModerationSweep(env: Env): Promise<void> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const headers: Record<string, string> = { apikey: key }
  // Legacy JWT keys also go in Authorization; new sb_secret_ keys must not.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`

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

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runModerationSweep(env))
  },
}
