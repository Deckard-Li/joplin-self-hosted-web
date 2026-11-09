# Verification

## Note Cards

Validated locally on 2026-11-09 with Node.js 24.19.0 and the integrated Playwright browser:

- Seven host/regression tests pass, including protected-preview checks, pinned upstream module validation, idempotent HTML/bootstrap adaptation, and hashes for both upstream and local assets. Removing the single note-list bridge restores the original application bundle's source hash.
- Original app starts with the explicit web platform stub. Card view shows Markdown and HTML excerpts from the browser-local note database; compact mode hides excerpts and persists after reload.
- Clicking a to-do excerpt opens the original editor without completing the task. The original checkbox persists completion without opening the editor. Back navigation restores the card view.
- A locked fixture displays "Locked note" without exposing its body. An HTML fixture's script never executes and its image URL is never requested by the preview.
- Desktop 1440x900, mobile 390x844, and narrow mobile 320x740 have no horizontal overflow. Desktop/mobile screenshots were captured with isolated, disposable local sample notes. Secure context and cross-origin isolation are enabled at the localhost preview.
- `tools/extract-web.mjs` passes syntax checking and automatically invokes the checked customization tool. The current assets pass customization/hash validation; a fresh upstream network extraction was not rerun for this UI-only change.

This UI validation uses no real account or backend credentials. Live sync with the customized UI and CI for these local changes are not verified; the original sync engine and proxy behavior are unchanged. The startup sync-provider dialog must be dismissed in an unconfigured preview profile.

## Original Deployment

Validated locally on 2026-11-08 with Node.js 24.19.0:

- `npm test`: four tests passed. Covered HTTP backend forwarding, reverse-proxy prefixes, request bodies and session headers, rejection of foreign/malformed origins, upstream failures, static asset isolation, worker delivery, WASM MIME type, and SHA-256 verification of extracted assets.
- `npm install`: no dependency vulnerabilities reported. There are no runtime npm dependencies; extraction uses Acorn and parse5 as development dependencies.
- Original web UI starts, creates its browser-local database, and displays the welcome notebook.
- Synchronisation settings offer Joplin Server and show its URL, email, and password fields. Verified the same-origin proxy URL can be entered.
- Desktop 1440x900 and mobile 390x844 browser checks and screenshots: fonts loaded, server settings visible, no horizontal overflow, secure context and cross-origin isolation enabled.
- The integrated test browser identifies itself as Electron, which upstream Joplin interprets as a desktop runtime. Browser tests used a normal Chrome user agent; this test-only adjustment is not shipped in the app. Use a standard supported web browser.

GitHub Actions passed for application commit `86e13987aa645b370a1148a32fbeff944b5f4096`, including the same host tests, `docker compose config --quiet`, and a Docker image build. [Successful CI run](https://github.com/Deckard-Li/joplin-self-hosted-web/actions/runs/42445234031).

Not verified: Docker container execution against a live backend; live authentication/synchronisation against the user's Joplin Server, because its URL and credentials were not provided. Docker is not installed locally, so the image build and Compose checks were verified through CI. Local server checks use a placeholder backend and controlled HTTP fixtures, not a real account.