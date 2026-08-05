import { openDb } from '@okolos/storage'

/**
 * The three-second answer: is this page fine, and is anything waiting for me.
 * The full popup lands with M6; this is the skeleton's honest minimum.
 */

const root = document.getElementById('root')

async function paint(): Promise<void> {
  if (!root) return
  try {
    const db = await openDb()
    const findings = await db.getAll('findings')
    const open = findings.filter((f) => f.resolvedAt === null)
    root.textContent =
      open.length === 0
        ? 'Nothing needs you right now.'
        : `${open.length} finding${open.length === 1 ? '' : 's'} waiting for you.`
  } catch {
    // Never a clean verdict we could not compute.
    root.textContent = 'Local data could not be read. Open settings to repair it.'
  }
}

void paint()
