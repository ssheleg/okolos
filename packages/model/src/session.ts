/**
 * The classifier session: weights in, a probability out.
 *
 * The ONNX runtime itself is injected rather than imported. That is not
 * ceremony — it is what lets every rule here be tested on a machine with no
 * WebGPU and no weights, and it is what keeps the licence question about which
 * model ships out of this file entirely.
 *
 * Two behaviours matter more than speed. The session reports the backend it
 * actually got, never the one it asked for: a fallback that quietly claims
 * WebGPU makes every later performance number a lie. And a score that is not a
 * probability is a failure, not a verdict — a NaN travelling onward as evidence
 * about someone's page is worse than no classifier at all.
 */

export type Backend = 'webgpu' | 'wasm'

/** Fast first, then the one that runs everywhere. */
export const DEFAULT_BACKENDS: readonly Backend[] = ['webgpu', 'wasm']

export interface RuntimeSession {
  /** Probability that the text is an instruction planted for a model. */
  run(text: string): Promise<number>
  release?(): Promise<void>
}

export interface InferenceRuntime {
  /** Creates a session on the named backend, or throws if it is unavailable. */
  create(weights: ArrayBuffer, backend: Backend): Promise<RuntimeSession>
}

export class ClassifierSession {
  #closed = false

  private constructor(
    private readonly session: RuntimeSession,
    private readonly chosen: Backend,
  ) {}

  static async open(
    weights: ArrayBuffer,
    runtime: InferenceRuntime,
    order: readonly Backend[] = DEFAULT_BACKENDS,
  ): Promise<ClassifierSession> {
    const failures: string[] = []

    for (const backend of order) {
      try {
        return new ClassifierSession(await runtime.create(weights, backend), backend)
      } catch (cause) {
        failures.push(`${backend}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    throw new Error(`No inference backend could be started — ${failures.join('; ')}`)
  }

  backend(): Backend {
    return this.chosen
  }

  async score(text: string): Promise<number> {
    // i18n-exempt: thrown at a caller that used a closed session — a programming mistake, not a state a user reaches
    if (this.#closed) throw new Error('The classifier session is closed.')

    const value = await this.session.run(text)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      // i18n-exempt: an inference backend returning a non-probability is a fault in the backend, reported to whoever is debugging it
      throw new Error(`The classifier returned ${value}, which is not a probability.`)
    }
    return value
  }

  async close(): Promise<void> {
    this.#closed = true
    await this.session.release?.()
  }
}
