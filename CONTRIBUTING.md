# Contributing

Open an issue describing the environment, expected behavior, and a minimal reproduction. Do not include account credentials, session tokens, note databases, or private content.

Use Node.js 22 or newer. Run `npm ci` and `npm test` before submitting a pull request. Keep changes focused on the standalone web host or extraction tool; do not import the desktop app or native mobile projects. Preserve upstream notices and the independently created application icon.

When updating the browser build, regenerate and commit the extracted assets and provenance together, update `SOURCES.md` to the correct upstream revision, and repeat desktop/mobile browser startup and self-hosted sync configuration checks. Docker build and configuration checks run in CI. A real test account is needed for live-server sync validation; do not place its secrets in the repository.