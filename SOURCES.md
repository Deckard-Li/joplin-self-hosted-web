# Corresponding Source

The included original browser application is Joplin Mobile/Web **3.7.0**, built from upstream revision **425a05ac4b03ab84e038f67a6bcc029377d1b50e**, on the upstream `release-3.7` branch. This identity was verified using the running application's version information. The compiled application and worker bundles remain unchanged; original and resulting asset hashes are recorded in `upstream-assets.json`.

- [Exact upstream application source](https://github.com/laurent22/joplin/tree/425a05ac4b03ab84e038f67a6bcc029377d1b50e)
- [Download corresponding source archive](https://github.com/laurent22/joplin/archive/425a05ac4b03ab84e038f67a6bcc029377d1b50e.tar.gz)
- [Original web build instructions](https://github.com/laurent22/joplin/blob/425a05ac4b03ab84e038f67a6bcc029377d1b50e/readme/dev/BUILD.md#web)
- [Source for this deployment and its adaptations](https://github.com/Deckard-Li/joplin-self-hosted-web)

To rebuild the UI from corresponding source, check out the exact upstream revision, enable Corepack, run `yarn install` at the upstream repository root, then run `yarn web` from `packages/app-mobile`. Its output is `packages/app-mobile/web/dist`. Upstream package dependencies and build tools are needed for this source build; this small deployment repository intentionally does not duplicate unrelated upstream native and desktop projects.

This repository contains the source for the Node.js static host and fixed-backend API proxy, extraction/adaptation tool, tests, and Docker configuration. The adaptations replace document titles and manifest icons and disable development mode for the production build. After refreshing to another upstream release, update this document to match the newly generated provenance file.