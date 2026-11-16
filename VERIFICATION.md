# Verification

## Emoji And Tags

Validated locally on 2026-11-16 with Node.js 24.19.0 and the integrated Playwright browser:

- Corrected the earlier card-only implementation: notebook emoji now appears on the actual Edit notebook page. The unwanted single-note emoji/title controls are removed; the note-card dialog edits only tag assignments. The original note editor retains Tags in its overflow menu.
- The notebook picker changes the original form state and enables its Save changes button. Saving updated the sidebar and notebook heading; reloading retained the icon. Reset saved successfully, while Back discarded an unsaved selection.
- Tags now has a New tag button. Creating an unassigned tag refreshed the list, and search found it before any note assignment. An unassigned tag also survived reload. A duplicate name showed an error; Cancel closed the dialog. The created tag appeared in note-tag suggestions and persisted when assigned to a note. At 320px, the New tag dialog measured 282px wide and disabled creation for a blank name; a screenshot confirmed its layout.
- The locally bundled desktop emoji picker opened and searched without a CDN. A mobile tap selected an emoji, which persisted after Save and reload. At 320px, the settled notebook control spanned exactly the viewport and the picker measured 258px without clipping. A screenshot caught a stacking issue with the mobile overlay; placing the picker at document level fixed it, confirmed by another screenshot and an actual emoji selection.
- All nine `npm test` checks pass. Model regression coverage checks tag-only saves without title/body/notebook changes, locked/encrypted/deleted/read-only rejection, stale tag changes, and standalone tag creation with blank/duplicate validation. Pinned upstream source identity remains verifiable after removing every bridge/import and reversing the tag query substitutions.
- Docker is unavailable locally. No real account or backend credentials were used; live-server synchronisation and deployment CI have not been verified for this change. The original sync engine and same-origin proxy remain unchanged.

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