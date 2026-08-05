import type { AuditEntry } from '@okolos/contracts'

/**
 * Getting the classifier's weights onto the device.
 *
 * This is the half of REQ-36 where the product's promises actually apply. A
 * model is tens of megabytes fetched from someone else's server — exactly the
 * sort of quiet network traffic this extension exists to make visible. So:
 *
 *   - nothing is downloaded without the user saying yes;
 *   - the download goes through the same egress point as everything else and
 *     appears in the audit log as a model update;
 *   - the payload is checked against a pinned digest before it is kept, because
 *     a model file is executable weight in every sense that matters;
 *   - a cached model costs no request at all, and a version bump discards it
 *     rather than silently mixing versions.
 *
 * The ONNX session that consumes these bytes is a thin adapter on top and is
 * deliberately not here: the choice of weights carries a licence question that
 * is the operator's to answer, not the code's.
 */

export type ModelState = 'absent' | 'declined' | 'downloading' | 'ready' | 'failed'

export interface ModelDescriptor {
  readonly id: string
  readonly version: string
  readonly url: string
  /** Pinned digest of the exact artefact this version expects. */
  readonly sha256: string
  readonly bytes: number
}

export interface ModelCache {
  read(id: string, version: string): Promise<ArrayBuffer | null>
  write(id: string, version: string, bytes: ArrayBuffer): Promise<void>
  clear(id: string): Promise<void>
}

export interface ModelDeps {
  /** Asks the user. Called before any network activity, every time. */
  consent(descriptor: ModelDescriptor): Promise<boolean>
  request(descriptor: ModelDescriptor): Promise<Response>
  digest(bytes: ArrayBuffer): Promise<string>
  cache: ModelCache
  writeAudit(entry: AuditEntry): Promise<void>
  now(): string
  newId(): string
}

export class ModelManager {
  #state: ModelState = 'absent'

  constructor(
    private readonly descriptor: ModelDescriptor,
    private readonly deps: ModelDeps,
  ) {}

  state(): ModelState {
    return this.#state
  }

  /** Returns the model bytes, or null when the user has not agreed to fetch them. */
  async ensure(): Promise<ArrayBuffer | null> {
    const cached = await this.deps.cache.read(this.descriptor.id, this.descriptor.version)
    if (cached) {
      this.#state = 'ready'
      return cached
    }

    // A different version was cached, or none was. Either way the old bytes go
    // before new ones arrive: two versions of a classifier in one cache is a
    // bug nobody would see until its verdicts disagreed.
    await this.deps.cache.clear(this.descriptor.id)

    if (!(await this.deps.consent(this.descriptor))) {
      this.#state = 'declined'
      return null
    }

    this.#state = 'downloading'
    const entry = (outcome: AuditEntry['outcome']): AuditEntry => ({
      id: this.deps.newId(),
      createdAt: this.deps.now(),
      destination: new URL(this.descriptor.url).hostname,
      purpose: 'model-update',
      payloadShape: `model:${this.descriptor.id}@${this.descriptor.version}`,
      triggeredBy: 'user:enable-classifier',
      outcome,
    })

    let bytes: ArrayBuffer
    try {
      await this.deps.writeAudit(entry('sent'))
      const response = await this.deps.request(this.descriptor)
      bytes = await response.arrayBuffer()
    } catch (cause) {
      this.#state = 'failed'
      await this.deps.writeAudit(entry('failed'))
      throw cause
    }

    const digest = await this.deps.digest(bytes)
    if (digest !== this.descriptor.sha256) {
      this.#state = 'failed'
      throw new Error(
        `Refused the model: digest ${digest.slice(0, 12)}… does not match the pinned value`,
      )
    }

    await this.deps.cache.write(this.descriptor.id, this.descriptor.version, bytes)
    this.#state = 'ready'
    return bytes
  }
}
