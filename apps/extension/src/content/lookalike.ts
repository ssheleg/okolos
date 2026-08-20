import { t } from '@okolos/i18n'
import { checkLookalike, DEFAULT_WATCHLIST, type LookalikeVerdict } from '@okolos/core-lookalike'
import { mountBanner, mountComparison, type BannerHandle, type ComparisonHandle, type BannerHandlers, type BannerProps } from '@okolos/ui'

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
  /**
   * How a warning reaches the screen.
   *
   * Injected rather than imported so every source passes through the same slot. Six
   * modules mounted their own banner, and on a page that was both a lookalike and
   * poisoned two of them drew panels at identical coordinates — one exactly on top of
   * the other, the lower one unreadable (B-69). "One in-page panel" is a rule about
   * the surface, not about the source, so it cannot live in any one source.
   *
   * Optional so a test can leave it out and get the real thing; the entry point always
   * supplies the slot.
   */
  mountWarning?: (props: BannerProps, handlers: BannerHandlers) => BannerHandle
}

export interface LookalikeWarning {
  readonly verdict: LookalikeVerdict
  /** The banner's shadow root — the surface itself, for whoever mounted it. */
  readonly root: ShadowRoot
  /**
   * The comparison's shadow root while it is open, and `null` while it is not.
   *
   * The same reason `root` is here: both surfaces are closed to the page, so the
   * only way to reach either is from whoever mounted it. Before 2026-08-20 the
   * comparison needed no accessor because it sat in the page's own body, which is
   * the defect this replaced — and its tests found it with
   * `document.querySelector`, which is another way of saying the page could too.
   */
  comparisonRoot(): ShadowRoot | null
  dismiss(): void
}

/** The injected mount, or the real one when a caller did not supply a slot. */
function mounting(deps: { readonly doc: Document; mountWarning?: (p: BannerProps, h: BannerHandlers) => BannerHandle }) {
  return (props: BannerProps, handlers: BannerHandlers): BannerHandle =>
    (deps.mountWarning ?? ((p, h) => mountBanner(deps.doc, p, h)))(props, handlers)
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
  const mount = mounting(deps)
  let banner: BannerHandle | null = null
  let comparison: ComparisonHandle | null = null

  const close = () => {
    comparison?.destroy()
    comparison = null
    banner?.destroy()
    banner = null
  }

  const openComparison = () => {
    // The comparison owns its host now, so opening it twice is a replacement
    // rather than two surfaces stacked in the page's body.
    comparison?.destroy()
    comparison = mountComparison(
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
          comparison?.destroy()
          comparison = null
        },
      },
    )
  }

  const mounted = mount(
    {
      variant: 'lookalike',
      severity: 'major',
      headline: t('warnLookalikeHeadline'),
      detail: t('warnLookalikeDetail', verdict.decoded, verdict.resembles),
      sourceLine: t('warnFoundBy', t('warnLookalikeSource')),
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

  return {
    verdict,
    root: mounted.root,
    comparisonRoot: () => comparison?.root ?? null,
    dismiss: close,
  }
}
