# @okolos/storage

IndexedDB schema v1, retention, export and wipe. The only module that knows how
data is laid out.

Two behaviours are deliberate and tested:

- **Retention never deletes an unresolved finding.** It is work the user still
  owes themselves; the clock starts when they resolve it, not when it appeared.
- **A partial wipe reports failure.** A wipe that half-worked and returned
  success is the one outcome that makes someone stop checking.

No encryption. A key stored beside the data protects against nothing but a
casual glance while looking like protection; the trust boundary is the browser
profile, and the UI says so.
