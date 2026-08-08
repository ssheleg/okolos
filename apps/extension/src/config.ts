/**
 * The one address this extension talks to, named once.
 *
 * It was written out inside `feed-sync.ts` as a whole feed URL. The moment a
 * second surface needed the same host — the appeal link on the interstitial —
 * that spelling would have been copied, and a copied origin is an origin that
 * gets moved in one place and left behind in the other.
 *
 * Every path is derived from here. Nothing else in the extension should contain
 * this host as a literal.
 */
export const PROXY_ORIGIN = 'https://okolos-proxy.sergeysheleg4.workers.dev'
