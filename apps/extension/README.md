# @okolos/extension

The extension itself: collectors, background wiring, surfaces, and the manifests
for both browsers.

`pnpm build` produces `dist/chrome` and `dist/firefox`. Three passes, because
the targets differ: the content script must be one self-contained IIFE (Chrome
does not support modules in content scripts), the background is a module, the
pages are ordinary HTML.

Manifests are hand-written per browser. They are the security surface a reviewer
and a user actually read, and a generated manifest is one indirection away from
nobody noticing a permission appear. A test pins the permission list.

The background holds no state between wake-ups — Chrome tears the worker down
after about thirty seconds of quiet — so everything that survives goes to
IndexedDB and every schedule goes through alarms.
