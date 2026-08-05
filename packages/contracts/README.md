# @okolos/contracts

The vocabulary every layer shares: `Verdict`, `Evidence`, `PageCandidates`, the
versioned RPC map, and `decideAction` — the confidence ladder.

Two rules make this package what it is:

- **No dependencies.** It must load from a test, a service worker, a content
  script and a Cloudflare Worker alike.
- **No ambient state.** `createdAt` and ids are parameters, never read from a
  clock or a random source, which is what makes a corpus run reproducible.

`decideAction` holds one invariant, pinned by a property test: a verdict whose
evidence came only from the classifier is capped at `inform`, whatever
confidence the caller claims. Blocking a page on an unexplainable score is the
failure mode this product was built against.
