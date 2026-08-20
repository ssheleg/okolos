/**
 * The block page refuses to render inside somebody else's page.
 *
 * `interstitial.html` is the one file this extension makes web-accessible, because the
 * blocker redirects a tab to it. Web-accessible means **any** page can put it in an
 * iframe — and a framed copy is the product's own block page, with its own "continue
 * anyway" control, sitting inside a document the attacker lays out.
 *
 * What that buys an attacker is narrow and real: the control records an exception for the
 * last blocked address, so a click stolen by an overlay turns the product's strongest
 * protection off for a site it had blocked. The page cannot be made to *name* an arbitrary
 * site — it asks the background rather than reading its own query string — but a click is
 * enough.
 *
 * So the page draws one sentence instead, and the sentence says what the reader is looking
 * at: this is our page, embedded by the site around it, and the site around it put it
 * there. Refusing is free — in real use this document is always a tab of its own, because
 * a redirect is what creates it.
 */

export interface FramedDeps {
  /** The window this document runs in. Injected so a test can pose as a frame. */
  readonly win: Pick<Window, 'top' | 'self'>
}

/** True when this document is not the top-level one. */
export function isFramed(deps: FramedDeps): boolean {
  /**
   * A cross-origin parent makes `win.top` throw on access in some engines rather than
   * returning a foreign window. A throw is itself an answer: only a framed document can be
   * refused access to its own top.
   */
  try {
    return deps.win.top !== deps.win.self
  } catch {
    return true
  }
}
