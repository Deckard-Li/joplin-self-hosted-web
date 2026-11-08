# Verification

Validated locally on 2026-11-08 with Node.js 24.19.0:

- `npm test`: four tests passed. Covered HTTP backend forwarding, reverse-proxy prefixes, request bodies and session headers, rejection of foreign/malformed origins, upstream failures, static asset isolation, worker delivery, WASM MIME type, and SHA-256 verification of extracted assets.
- `npm install`: no dependency vulnerabilities reported. There are no runtime npm dependencies; extraction uses Acorn and parse5 as development dependencies.
- Original web UI starts, creates its browser-local database, and displays the welcome notebook.
- Synchronisation settings offer Joplin Server and show its URL, email, and password fields. Verified the same-origin proxy URL can be entered.
- Desktop 1440x900 and mobile 390x844 browser checks and screenshots: fonts loaded, server settings visible, no horizontal overflow, secure context and cross-origin isolation enabled.
- The integrated test browser identifies itself as Electron, which upstream Joplin interprets as a desktop runtime. Browser tests used a normal Chrome user agent; this test-only adjustment is not shipped in the app. Use a standard supported web browser.

Not verified: Docker container execution or image build, because Docker is not installed in this environment; live authentication/synchronisation against the user's Joplin Server, because its URL and credentials were not provided. Docker configuration validation and image build are included in GitHub Actions. Local server checks use a placeholder backend and controlled HTTP fixtures, not a real account.