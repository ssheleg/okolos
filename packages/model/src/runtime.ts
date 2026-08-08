import type { InferenceRuntime } from './session.js'
import type { ModelDescriptor } from './manager.js'

/**
 * The seam where an ONNX runtime is plugged in — and the reason it is empty.
 *
 * The licence question is settled: `docs/licences.md` restricts this project to
 * weights that may be redistributed and derived from without a user accepting
 * anyone's terms, which excludes Prompt-Guard-2-22M and its Llama-licensed
 * relatives.
 *
 * What is not settled is the artefact. The one ungated Apache-2.0 candidate,
 * `llmware/protectai-prompt-injection-onnx`, measures 738,563,308 bytes — two
 * orders of magnitude past what belongs in a browser extension, and nowhere
 * near REQ-09's 250 ms. Apache-2.0 permits derivatives with attribution, so an
 * INT8 quantisation of it is the open path; until one exists and has been
 * measured, this stays empty.
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
  // Still unreachable on purpose, and now for a stated reason rather than an
  // unanswered question: the artefact this will point at does not exist yet.
  // Pointing it at the 704 MB upstream would describe something the product
  // will never fetch.
  url: 'https://models.okolos.invalid/pending-quantisation.onnx',
  // A digest that matches nothing is safer than a real one for weights that
  // have not been built, let alone measured.
  sha256: '0'.repeat(64),
  bytes: 0,
}
