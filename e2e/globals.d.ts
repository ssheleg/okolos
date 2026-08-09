/**
 * `chrome` inside `page.evaluate` runs in the extension page, not in Node.
 *
 * Declared here rather than imported: pulling the full WebExtension types into
 * the e2e project would drag DOM lib conflicts in with them, and the specs use
 * exactly two calls.
 */
declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<unknown> }
  /** Asked for readiness: a message resolving is not a rule being installed. */
  declarativeNetRequest: {
    // `condition` is declared because a test that only counts rules cannot
    // tell the rule it seeded from the four the published feed installs —
    // which is exactly how the SCN-007 flake stayed hidden.
    getDynamicRules(): Promise<
      Array<{ id: number; condition: { urlFilter?: string } }>
    >
    updateDynamicRules(update: {
      removeRuleIds?: number[]
      addRules?: unknown[]
    }): Promise<void>
  }
}
