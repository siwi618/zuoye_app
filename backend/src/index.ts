import { Container } from '@cloudflare/containers'

interface Env {
  CONTAINER: DurableObjectNamespace<ZuoyebangBackend>
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
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
      CORS_ORIGINS: env.CORS_ORIGINS,
      ENVIRONMENT: env.ENVIRONMENT,
    }
  }
}

/**
 * Worker entry point — route every request to the singleton container.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.CONTAINER.idFromName('primary')
    const stub = env.CONTAINER.get(id)
    return stub.fetch(request)
  },
}
