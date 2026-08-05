import { renderDataControls, renderSelfAudit, type PanelState } from '@okolos/ui'
import { exportAll, openDb, wipeAll } from '@okolos/storage'

/**
 * The options page is, first of all, the self-audit panel: the product's
 * central claim in a form the user can read and export. Beneath it sit the
 * data controls, so "you own what this stores" is something a person can act
 * on rather than a sentence in a README.
 */

const root = document.getElementById('root')

async function load(): Promise<PanelState> {
  try {
    const db = await openDb()
    const entries = await db.getAll('outbound_log')
    if (entries.length === 0) return { kind: 'empty' }
    return { kind: 'ready', entries, since: 'the last seven days' }
  } catch (cause) {
    return { kind: 'error', message: String(cause) }
  }
}

async function paint(state: PanelState): Promise<void> {
  if (!root) return
  root.replaceChildren(
    renderSelfAudit(document, state, {
      onExport: () => void download(),
      onRepair: () => void reload(),
    }),
    renderDataControls(document, {
      onExport: download,
      onWipe: async () => {
        const db = await openDb()
        return wipeAll(db)
      },
      onWiped: () => void reload(),
    }),
  )
}

async function download(): Promise<void> {
  const db = await openDb()
  const json = await exportAll(db)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'okolos-export.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function reload(): Promise<void> {
  await paint({ kind: 'loading' })
  await paint(await load())
}

void reload()
