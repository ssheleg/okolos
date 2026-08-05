import type { InferenceRuntime } from './session.js'
import type { ModelDescriptor } from './manager.js'

/**
 * The seam where an ONNX runtime is plugged in — and the reason it is empty.
 *
 * Every candidate classifier for this job (Prompt-Guard-2-22M and its
 * relatives) ships under a licence with acceptable-use terms that a public
 * AGPL repository cannot restate on the user's behalf. Choosing the weights is
 * therefore an operator decision, recorded as a human step in the brief, not
 * something this repository can make on its own.
 *
 * Until it is made, this returns null and every layer above degrades honestly:
 * `createInferenceHost` reports `no-runtime`, stage 3 never fires, and no
 * surface claims a page was checked by a model it does not have. That is the
 * same path a device without WebGPU takes, so it is exercised on every run.
 *
 * To enable the classifier: add the runtime dependency, return a session
 * factory here, and pin the weights' digest in `MODEL` below.
 */
export function createOnnxRuntime(): InferenceRuntime | null {
  return null
}

/** The artefact the cache and the digest check are written against. */
export const MODEL: ModelDescriptor = {
  id: 'hidden-instruction-classifier',
  version: '0',
  url: 'https://models.okolos.invalid/pending-licence-decision.onnx',
  // Deliberately unreachable: a placeholder digest that matches nothing is
  // safer than a real one for a model nobody has approved.
  sha256: '0'.repeat(64),
  bytes: 0,
}
