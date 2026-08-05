# @okolos/platform

The only place that knows a browser exists.

Chrome runs a service worker with no DOM and needs an offscreen document for
inference; Firefox keeps a background page and a blocking `webRequest`. A
detector that knew any of that would have to be rewritten per browser. One that
takes candidates and returns verdicts does not.

Two rules live here rather than in every caller: URLs are cut to origin and path
at this boundary, and an unknown or future RPC version is answered and survived
instead of thrown.
