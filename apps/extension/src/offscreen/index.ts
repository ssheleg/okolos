import { ClassifierSession, createOnnxRuntime, MODEL } from '@okolos/model'
import { detectPlatform } from '@okolos/platform'
import { createModelCache, openDb } from '@okolos/storage'

/**
 * The offscreen document exists for one reason: Chrome's service worker has no
 * DOM and no WebGPU, and a classifier needs both. Firefox never loads this page
 * — its background context is a page already.
 *
 * It holds no policy. It answers "score this text" with a number or with null,
 * and null means "there is no model here" rather than "the text is fine". The
 * distinction is the whole point: a missing classifier must never read as a
 * clean verdict.
 */

const platform = detectPlatform()

let session: ClassifierSession | null = null
let attempted = false

async function ensureSession(): Promise<ClassifierSession | null> {
  if (session) return session
  if (attempted) return null
  attempted = true

  const runtime = createOnnxRuntime()
  if (!runtime) return null

  try {
    const db = await openDb()
    const cache = createModelCache({ db, now: () => new Date().toISOString() })
    const weights = await cache.read(MODEL.id, MODEL.version)
    if (!weights) return null

    session = await ClassifierSession.open(weights, runtime)
    return session
  } catch (cause) {
    console.warn('okolos: the classifier could not be started', cause)
    return null
  }
}

platform.runtime.onMessage((message) => {
  if (message.type !== 'inference/score') return undefined

  const { text } = message.payload as { text: string }
  return (async () => {
    const ready = await ensureSession()
    if (!ready) return { score: null, backend: null }
    try {
      return { score: await ready.score(text), backend: ready.backend() }
    } catch (cause) {
      // A broken score is not a score. Reporting null keeps a numerical fault
      // from turning into a verdict about someone's page.
      console.warn('okolos: inference failed', cause)
      return { score: null, backend: ready.backend() }
    }
  })() as never
})
