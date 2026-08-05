# @okolos/net

The single way out to the network.

`request()` writes the audit entry **before** the transport runs, and a failure
to write it cancels the request. Written afterwards, the log would describe what
already happened; written first, it is what permits it.

A redactor refuses emails, absolute URLs and markup in anything outgoing, so a
leak fails during development rather than after release.

`transport.ts` is the only file in the repository that may call `fetch`. That is
enforced three ways: an ESLint rule on the source, a scan of the built bundles,
and an e2e check that every observed request has a matching log entry.
