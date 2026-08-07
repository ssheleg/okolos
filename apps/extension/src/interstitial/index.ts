import { detectPlatform } from '@okolos/platform'
import { renderInterstitial } from '@okolos/ui'
import '../pages.css'

/**
 * The page shown in place of a blocked one.
 *
 * It asks the background what was blocked rather than reading it from its own
 * query string. A URL in the address bar of an extension page is a URL in the
 * user's history, their session restore and their screenshots — and this
 * particular URL is one they were warned about.
 */

const platform = detectPlatform()
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
          void platform.tabs.create(platform.runtime.getUrl('options.html#appeal'))
        },
      },
    ),
  )
}

void paint()
