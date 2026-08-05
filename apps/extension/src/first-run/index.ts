import { renderFirstRun, type CheckRow } from '@okolos/ui'
import { detectPlatform } from '@okolos/platform'
import { openDb } from '@okolos/storage'

/**
 * What the first run can honestly check today.
 *
 * Tab and extension inventories need permissions this version deliberately
 * does not request — they arrive with the features that justify them — so they
 * appear as `unavailable` with the reason rather than being omitted. A first
 * impression built on an overstatement is the failure mode this product exists
 * against.
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
    {
      id: 'extensions',
      label: 'Installed extensions',
      state: 'unavailable',
      note: 'needs the extensions permission, which arrives with that feature',
    },
    {
      id: 'passwords',
      label: 'Leaked-password check',
      state: 'unavailable',
      note: 'arrives with the credentials feature',
    },
  )

  return { rows, findings }
}

async function paint(): Promise<void> {
  if (!root) return
  const { rows, findings } = await checks()
  root.replaceChildren(
    renderFirstRun(document, { checks: rows, findings }, {
      onContinue: () => void platform.runtime.openOptionsPage(),
      onSkip: () => window.close(),
      onOpenAudit: () => void platform.runtime.openOptionsPage(),
    }),
  )
}

void paint()
