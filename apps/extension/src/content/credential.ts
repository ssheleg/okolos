import { t } from '@okolos/i18n'
import { guardCredentialEntry, type CredentialContext } from '@okolos/core-credential'
import { mountBanner, type BannerHandle, type BannerHandlers, type BannerProps } from '@okolos/ui'

/**
 * The pause before a password.
 *
 * It appears when the field is focused, not when the page loads: before that
 * moment there is nothing to warn about, and a banner shown to everyone who
 * lands on a login page is a banner nobody reads by the second week.
 *
 * It never blocks typing. Someone mid-login on a site they know is better
 * served by an explanation they can ignore than by a modal they have to fight.
 */

export interface CredentialDeps {
  readonly doc: Document
  facts(host: string): Promise<Omit<CredentialContext, 'host' | 'now'>>
  now(): string
  trust(host: string): Promise<void>
  leave(): void
  host(): string
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

export interface CredentialWatcher {
  stop(): void
}

const SENSITIVE = 'input[type=password], input[autocomplete*="cc-number"]'

/**
 * Card fields are matched by name in code rather than by selector: the
 * case-insensitive attribute form (`[name*=card i]`) is not supported
 * everywhere this runs, and a selector that throws takes the whole listener
 * with it.
 */
function isSensitive(element: Element): boolean {
  if (element.matches(SENSITIVE)) return true
  const name = `${element.getAttribute('name') ?? ''} ${element.getAttribute('id') ?? ''}`
  return /card(number|num)?|cardnumber/i.test(name)
}

/** The injected mount, or the real one when a caller did not supply a slot. */
function mounting(deps: { readonly doc: Document; mountWarning?: (p: BannerProps, h: BannerHandlers) => BannerHandle }) {
  return (props: BannerProps, handlers: BannerHandlers): BannerHandle =>
    (deps.mountWarning ?? ((p, h) => mountBanner(deps.doc, p, h)))(props, handlers)
}

export function watchCredentialFields(deps: CredentialDeps): CredentialWatcher {
  const mount = mounting(deps)
  let banner: BannerHandle | null = null
  let asked = false

  const onFocus = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element) || !isSensitive(target)) return
    // Once per page: focus moves in and out of a password field constantly
    // while someone types, and a warning that reappears is a warning that gets
    // clicked away without reading.
    if (asked) return
    asked = true
    void warn(target)
  }

  async function warn(field: Element): Promise<void> {
    const host = deps.host()
    let context: CredentialContext
    try {
      context = { ...(await deps.facts(host)), host, now: deps.now() }
    } catch {
      // Unable to read what we know about this site. Staying silent is right:
      // a warning built from nothing would say nothing useful.
      return
    }

    const warning = guardCredentialEntry({ ...context, postsTo: postsTo(field, host) })
    if (!warning) return

    banner = mount(
      {
        variant: 'credential',
        severity: warning.severity,
        headline: t('warnCredentialHeadline'),
        detail: [
          ...warning.facts,
          warning.missing.length > 0 ? t('warnCredentialUnknown', warning.missing.join('; ')) : '',
        ]
          .filter(Boolean)
          .join(' '),
        sourceLine: t('warnFoundBy', t('warnCredentialSource')),
      },
      {
        onPrimary: deps.leave,
        onRetry: deps.leave,
        onDispute: () => {
          void deps.trust(host)
          dismiss()
        },
        onDismiss: dismiss,
      },
    )
  }

  function dismiss(): void {
    banner?.destroy()
    banner = null
  }

  deps.doc.addEventListener('focusin', onFocus, true)

  return {
    stop() {
      deps.doc.removeEventListener('focusin', onFocus, true)
      dismiss()
    },
  }
}

/** The origin a form sends to, when it is not the page's own. */
function postsTo(field: Element, host: string): string | null {
  const form = field.closest('form')
  const action = form?.getAttribute('action')
  if (!action) return null
  try {
    const url = new URL(action, `https://${host}`)
    return url.hostname === host ? null : url.origin
  } catch {
    return null
  }
}
