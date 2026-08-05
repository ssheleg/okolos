import { checkLookalike, DEFAULT_WATCHLIST, type LookalikeVerdict } from '@okolos/core-lookalike'
import { mountBanner, renderComparison, type BannerHandle } from '@okolos/ui'

/**
 * The lookalike warning, shown on the page it is about.
 *
 * It runs entirely on the device against a list that ships with the extension:
 * a check that needs the network is a check that does not run on the page where
 * it matters, and asking a server "is this domain a fake" would send every
 * address the user visits somewhere.
 *
 * The warning is advisory rather than blocking. The user may be on a genuine
 * site with an unlucky name, and the cost of being wrong here is someone
 * learning to dismiss our warnings without reading them.
 */

export interface LookalikeDeps {
  readonly doc: Document
  hostname(): string
  /** Domains the user has already said are fine. */
  trusted(): Promise<readonly string[]>
  trust(host: string): Promise<void>
  leave(): void
  watchlist?: readonly string[]
}

export interface LookalikeWarning {
  readonly verdict: LookalikeVerdict
  /** The banner's shadow root — the surface itself, for whoever mounted it. */
  readonly root: ShadowRoot
  dismiss(): void
}

export async function warnIfLookalike(deps: LookalikeDeps): Promise<LookalikeWarning | null> {
  const host = deps.hostname()
  const trusted = await deps.trusted()
  if (trusted.includes(host)) return null

  const watchlist = [...(deps.watchlist ?? DEFAULT_WATCHLIST), ...trusted]
  const verdict = checkLookalike(host, watchlist)
  if (!verdict) return null

  return show(deps, verdict)
}

function show(deps: LookalikeDeps, verdict: LookalikeVerdict): LookalikeWarning {
  let banner: BannerHandle | null = null
  let comparison: HTMLElement | null = null

  const close = () => {
    comparison?.remove()
    comparison = null
    banner?.destroy()
    banner = null
  }

  const openComparison = () => {
    comparison?.remove()
    comparison = renderComparison(
      deps.doc,
      {
        visited: verdict.visited,
        decoded: verdict.decoded,
        resembles: verdict.resembles,
        kind: verdict.kind,
      },
      {
        onLeave: () => {
          close()
          deps.leave()
        },
        onTrust: () => {
          void deps.trust(verdict.visited)
          close()
        },
        onClose: () => {
          comparison?.remove()
          comparison = null
        },
      },
    )
    deps.doc.body.append(comparison)
  }

  const mounted = mountBanner(
    deps.doc,
    {
      variant: 'lookalike',
      severity: 'major',
      headline: 'This address only looks like one you know',
      detail: `You are on ${verdict.decoded}, which resembles ${verdict.resembles}.`,
      sourceLine: 'Found by: comparing the address on this device',
    },
    {
      onPrimary: openComparison,
      onRetry: openComparison,
      onDispute: () => {
        void deps.trust(verdict.visited)
        close()
      },
      onDismiss: close,
    },
  )
  banner = mounted

  return { verdict, root: mounted.root, dismiss: close }
}
