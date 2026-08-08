/**
 * A response that came back, or a failure that says so.
 *
 * `send()` resolves to the handler's answer, and a handler that never ran
 * resolves to nothing. Defaulting that with `?? []` turns "the background did
 * not answer" into "there is nothing here" — the reassuring answer, and
 * possibly the wrong one. The trusted-domains panel did exactly that three
 * lines above a comment forbidding it.
 *
 * Every surface that renders a list from an RPC goes through this, so the
 * distinction is made once and in a place a test can reach.
 */

export class NoAnswerError extends Error {
  constructor(what: string) {
    super(`the background did not answer for ${what}`)
    this.name = 'NoAnswerError'
  }
}

export function answered<T>(result: T | null | undefined, what: string): T {
  if (result === null || result === undefined) throw new NoAnswerError(what)
  return result
}
