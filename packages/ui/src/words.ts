/**
 * The words for facts that arrive as codes.
 *
 * A second entry point, and a deliberate one: the worker journals what the extensions
 * panel shows, and both need the same sentence for the same change. Shipping it from
 * `./src/index.ts` would pull the panel — and every other surface in this package —
 * into the worker's graph for the sake of a lookup table. Nothing here touches the DOM.
 */
export {
  CHANGE_EXPLAIN_KEY,
  changeExplain,
  changeSentence,
  ANALYSIS_NOTE_KEY,
  analysisNote,
  findingEvidence,
} from './extensions/words.js'
