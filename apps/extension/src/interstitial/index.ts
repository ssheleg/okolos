import { useResolver } from '@okolos/i18n'
import { detectPlatform } from '@okolos/platform'
import { renderInterstitial } from '@okolos/ui'
import '../pages.css'

import { appealLinkFor } from './appeal-link.js'

/**
 * The page shown in place of a blocked one.
 *
 * It asks the background what was blocked rather than reading it from its own
 * query string. A URL in the address bar of an extension page is a URL in the
 * user's history, their session restore and their screenshots — and this
 * particular URL is one they were warned about.
 */

const platform = detectPlatform()

// Before anything paints. A renderer that asks for a message before this line
// runs gets `[key]` — visible, which is the point, but not on a real page.
useResolver((key, substitutions) => platform.message(key, substitutions))
const root = document.getElementById('root')

async function paint(): Promise<void> {
  if (!root) return

  const context = await platform.runtime.send('block/context', {}).catch(() => null)

  root.replaceChildren(
    renderInterstitial(
      document,
      {
        url: context?.url ?? 'a page on this site',
        feed: context?.feed ?? null,
        entryDate: context?.entryDate ?? null,
        feedAgeDays: context?.feedAgeDays ?? null,
      },
      {
        onBack: () => history.back(),
        onContinue: () => {
          void (async () => {
            const allowed = await platform.runtime
              .send('block/allow', { url: context?.url ?? '' })
              .catch(() => null)
            if (allowed?.url) location.replace(allowed.url)
          })()
        },
        onOwner: () => {
          // The public status page, with the domain already in it — the appeal
          // is filed with the service, not with this copy of the extension,
          // and the link still works from a phone or in someone else's hands.
          //
          // This is the one URL this page deliberately puts in the address bar:
          // the domain is the owner's own, and they asked for it by clicking.
          const link = appealLinkFor(context?.url)
          if (link !== null) void platform.tabs.create(link)
        },
      },
    ),
  )
}

void paint()
