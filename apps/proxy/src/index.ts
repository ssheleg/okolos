import { handle, type Env } from './router.js'

/**
 * The thin backend.
 *
 * "Thin" is a design constraint, not a description: everything it serves is
 * either public (feeds, model files) or supplied by someone acting on their own
 * behalf (a site owner checking their domain, or appealing). It holds no user
 * accounts, no browsing data and no identifiers, because there is nothing here
 * that would need them.
 */
export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),

  async scheduled(_event: unknown, env: Env): Promise<void> {
    // 180 days, swept rather than assumed: a retention policy nobody enforces
    // is a sentence in a privacy page.
    const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString()
    await env.DB.prepare('DELETE FROM appeals WHERE created_at < ?').bind(cutoff).run()
  },
}
