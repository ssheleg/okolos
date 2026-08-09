
import { t } from '@okolos/i18n'
import { ClassifierSession, type InferenceRuntime } from '@okolos/model'
import type { InferenceHost } from '@okolos/core-injection'
import type { InferenceHostKind } from '@okolos/platform'

/**
 * Wiring the classifier into the background, without letting it pretend.
 *
 * Three things have to be true before a score is allowed to exist: a context
 * that can run a model (an offscreen document in Chrome, the background page in
 * Firefox), weights the user agreed to fetch, and a backend that started. Any
 * one of them missing makes the host unavailable, and stage 3 is skipped
 * entirely — which is the same code path a device without WebGPU takes, so it
 * is exercised on every run rather than only in a test.
 *
 * `available()` is synchronous because the detector calls it per page, so the
 * answer is prepared once and cached. It starts false: a host that claimed to
 * be ready before it was would make stage 3 wait on a session mid-scan.
 */

export interface InferenceDeps {
  /** Creates the offscreen document if needed and says where a model may run. */
  ensureHost(): Promise<InferenceHostKind>
  /** Cached weights, or null when the user has not agreed to fetch them. */
  weights(): Promise<ArrayBuffer | null>
  /** Null until a runtime is bundled — see REQ-37's open licence question. */
  runtime(): InferenceRuntime | null
  /** Asks another context to score, when the model does not run in this one. */
  remoteScore?: (text: string) => Promise<number | null>
  log?: (message: string) => void
}

export type InferenceStatus =
  | 'not-prepared'
  | 'ready'
  | 'no-host'
  | 'no-weights'
  | 'no-runtime'
  | 'no-backend'

export interface PreparedInference extends InferenceHost {
  prepare(): Promise<InferenceStatus>
  status(): InferenceStatus
}

export function createInferenceHost(deps: InferenceDeps): PreparedInference {
  let status: InferenceStatus = 'not-prepared'
  let session: ClassifierSession | null = null
  let remote: ((text: string) => Promise<number | null>) | null = null

  return {
    status: () => status,

    available: () => status === 'ready',

    async prepare(): Promise<InferenceStatus> {
      const where = await deps.ensureHost()
      if (where === 'none') return (status = 'no-host')

      // Chrome's worker cannot run the model itself; it asks the offscreen
      // document. Without a way to ask, there is no classifier.
      if (where === 'offscreen') {
        if (!deps.remoteScore) return (status = 'no-host')
        remote = deps.remoteScore
        return (status = 'ready')
      }

      const weights = await deps.weights()
      if (!weights) return (status = 'no-weights')

      const runtime = deps.runtime()
      if (!runtime) return (status = 'no-runtime')

      try {
        session = await ClassifierSession.open(weights, runtime)
      } catch (cause) {
        // Every backend refused. Saying so beats reporting a classifier that
        // silently never fires.
        deps.log?.(`okolos: no inference backend — ${String(cause)}`)
        return (status = 'no-backend')
      }

      return (status = 'ready')
    },

    async score(text: string): Promise<number> {
      if (session) return session.score(text)
      if (remote) {
        const value = await remote(text)
        if (value === null) throw new Error(t('inferenceNoModel'))
        return value
      }
      throw new Error(t('inferenceNotReady'))
    },
  }
}
