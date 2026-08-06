/**
 * `chrome` inside `page.evaluate` runs in the extension page, not in Node.
 *
 * Declared here rather than imported: pulling the full WebExtension types into
 * the e2e project would drag DOM lib conflicts in with them, and the specs use
 * exactly one call.
 */
declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<unknown> }
}
