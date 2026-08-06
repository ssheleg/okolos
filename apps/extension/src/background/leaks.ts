import { mergeLeaks, type Leak, type LeakInventory, type SourceStatus } from '@okolos/core-leaks'
import { request, type RequestDeps } from '@okolos/net'

/**
 * Asking several places whether an address has appeared in a breach.
 *
 * Every source here is optional and every one of them can be silent, which is
 * the normal case rather than the exception: one needs a key the user may not
 * have, another rate-limits, a third is simply down. The merge reports which
 * ones answered, and the panel shows that beside the total — a number whose
 * basis is unstated is the thing this feature exists to replace.
 *
 * What leaves the device is the address the user typed into the box, to the
 * sources they can see named, when they press the button. Nothing is looked up
 * in the background.
 */

export interface LeakSource {
  readonly name: string
  /** Null when the source cannot run — the reason is shown to the user. */
  readonly unavailable: string | null
  lookup(address: string, deps: RequestDeps): Promise<readonly Leak[]>
}

export const CAVALIER: LeakSource = {
  name: 'Hudson Rock Cavalier',
  unavailable: null,
  async lookup(address, deps) {
    const response = await request(
      {
        url: `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent(address)}`,
        method: 'GET',
        purpose: 'leak-lookup',
        payloadShape: `email:${redact(address)}`,
        triggeredBy: 'user:leak-check',
      },
      deps,
    )
    const body = (await response.json()) as { stealers?: Array<{ date_compromised?: string }> }
    return (body.stealers ?? []).map((entry) => ({
      name: 'Infostealer infection',
      occurredAt: entry.date_compromised?.slice(0, 10) ?? null,
      source: CAVALIER.name,
      classes: ['saved passwords', 'session cookies'],
    }))
  },
}

/**
 * The breached-account API needs a paid key. Without one the source is not
 * silently dropped: it reports why it could not run, and the coverage line says
 * the list may be incomplete because of it.
 */
export function hibp(apiKey: string | null): LeakSource {
  return {
    name: 'Have I Been Pwned',
    unavailable: apiKey ? null : 'no API key is configured for this source',
    async lookup(address, deps) {
      const response = await request(
        {
          url: `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(address)}?truncateResponse=false`,
          method: 'GET',
          purpose: 'leak-lookup',
          payloadShape: `email:${redact(address)}`,
          triggeredBy: 'user:leak-check',
          headers: { 'hibp-api-key': apiKey ?? '' },
        },
        deps,
      )
      if (response.status === 404) return []
      const body = (await response.json()) as Array<{
        Name?: string
        Domain?: string
        BreachDate?: string
        DataClasses?: string[]
      }>
      return body.map((entry) => ({
        name: entry.Name ?? 'Unnamed breach',
        occurredAt: entry.BreachDate ?? null,
        source: 'Have I Been Pwned',
        classes: entry.DataClasses ?? [],
        // Carried through so the panel can offer a page rather than describe
        // one. HIBP leaves it blank for breaches it cannot attribute.
        ...(entry.Domain ? { domain: entry.Domain } : {}),
      }))
    },
  }
}

export async function lookupLeaks(
  address: string,
  sources: readonly LeakSource[],
  deps: RequestDeps,
): Promise<LeakInventory> {
  const statuses: SourceStatus[] = []

  for (const source of sources) {
    if (source.unavailable) {
      statuses.push({ name: source.name, answered: false, why: source.unavailable })
      continue
    }
    try {
      statuses.push({ name: source.name, answered: true, leaks: await source.lookup(address, deps) })
    } catch (cause) {
      // One source failing must not take the others with it, and must not be
      // mistaken for that source having nothing to report.
      statuses.push({
        name: source.name,
        answered: false,
        why: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return mergeLeaks(statuses)
}

/** What the audit log shows: enough to recognise, not enough to be the address. */
function redact(address: string): string {
  const [local = '', domain = ''] = address.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}
