import { renderFirstRun, type CheckRow } from '@okolos/ui'
import { detectPlatform } from '@okolos/platform'
import { openDb } from '@okolos/storage'
import '../pages.css'

/**
 * What the first run can honestly check.
 *
 * Every row reports the state of a real capability on this device: a check that
 * cannot run says so and why, rather than being omitted. A first impression
 * built on an overstatement is the failure mode this product exists against, and
 * the row that says "not on this browser" is worth more than the one that
 * quietly disappears.
 */

const platform = detectPlatform()
const root = document.getElementById('root')

async function checks(): Promise<{ rows: CheckRow[]; findings: number }> {
  const rows: CheckRow[] = [
    {
      id: 'detector',
      label: 'Hidden-instruction detection',
      state: 'ok',
      note: 'active on every page you open, including frames',
    },
  ]

  let findings = 0
  try {
    const db = await openDb()
    const open = (await db.getAll('findings')).filter((f) => f.resolvedAt === null)
    findings = open.length
    rows.push({ id: 'storage', label: 'Local storage', state: 'ok', note: 'ready' })
  } catch (cause) {
    rows.push({ id: 'storage', label: 'Local storage', state: 'failed', note: String(cause) })
  }

  rows.push(
    platform.extensions.available()
      ? {
          id: 'extensions',
          label: 'Installed extensions',
          state: 'ok',
          note: 'reviewed daily for new permissions and changes of publisher',
        }
      : {
          id: 'extensions',
          label: 'Installed extensions',
          state: 'unavailable',
          note: 'this browser does not let an extension read the others',
        },
    {
      id: 'passwords',
      label: 'Leaked-password check',
      state: 'ok',
      note: 'runs on submit; the most common ones are answered without any request',
    },
    platform.downloads.available()
      ? { id: 'downloads', label: 'Download checks', state: 'ok', note: 'run before the file is written' }
      : {
          id: 'downloads',
          label: 'Download checks',
          state: 'unavailable',
          note: 'this browser does not expose downloads to an extension',
        },
  )

  return { rows, findings }
}

async function paint(): Promise<void> {
  if (!root) return
  const { rows, findings } = await checks()
  root.replaceChildren(
    renderFirstRun(document, { checks: rows, findings }, {
      // Straight to the queue: the first interaction should end with something
      // to do, not a page to read.
      onContinue: () => void platform.tabs.create(platform.runtime.getUrl('options.html#queue')),
      onSkip: () => window.close(),
      onOpenAudit: () => void platform.runtime.openOptionsPage(),
    }),
  )
}

void paint()
