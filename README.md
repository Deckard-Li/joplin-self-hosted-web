# Joplin Self-hosted Web

An unofficial, web-only deployment of the original Joplin Web App, with a same-origin proxy to your existing self-hosted Joplin Server. No desktop app, Joplin Cloud account, or native mobile project is needed. This is a deployment distribution of the upstream UI, not a rewritten note viewer. Not affiliated with Joplin or JOPLIN SAS.

The official hosted web app deliberately limits sync choices on `https://app.joplincloud.com`. On your own origin, its existing Joplin Server sync target is available. This repository includes the extracted browser build, so deployment does not rebuild the Joplin monorepo.

## Deploy With Docker

1. Clone this repository and copy `.env.example` to `.env`.
2. Set `JOPLIN_SERVER_URL` to the base URL of your existing Joplin Server, including any reverse-proxy path prefix. The container must be able to reach this URL. `localhost` inside the container refers to the container, not your host.
3. Run `docker compose up --build -d`.
4. On the Docker host, open `http://localhost:8080`. For remote or LAN access, put an HTTPS reverse proxy in front of this web container; preserve the original `Host` header and forward every path, including `/joplin/`.

The web port binds to loopback by default. An HTTP backend such as `http://192.168.1.20:22300` is supported: the browser calls the web app's same-origin `/joplin/api/` proxy, and the container calls your server. **The frontend itself requires a secure browser context: HTTPS, or localhost for development. Plain HTTP on a LAN IP is not sufficient for the browser storage and service worker APIs.** HTTP between the web host and backend still exposes credentials and notes on that network; use HTTPS there too when possible.

An optional Caddy HTTPS service is included. Set `WEB_DOMAIN` to a domain pointing at this host, make ports 80 and 443 reachable and available, and run `docker compose --profile https up --build -d`. Caddy obtains and renews a public TLS certificate. If you already have a reverse proxy, use that instead and leave this profile disabled. An IP-only private LAN deployment needs a certificate trusted by your browsers; the included public-certificate configuration does not set up a private certificate authority.

## Connect And Review Notes

1. Open the web app's settings and the Synchronisation section.
2. Choose **Joplin Server** as the synchronisation target.
3. Set **Joplin Server URL** to the web app's URL followed by `/joplin`, for example `https://notes.example.com/joplin` or `http://localhost:8080/joplin`. This is the proxy URL, not `JOPLIN_SERVER_URL` from `.env`.
4. Enter the same Joplin Server account used by the clipper, save the settings, and synchronise.
5. Open the notebook where you clipped your pages. Notes and attachments appear after the sync finishes.

This frontend does not replace Joplin Server or its database. Both the clipper and this web app use your existing server. The original web app stores a local copy of notes and settings in browser storage; synchronise before clearing that storage. Keep the frontend origin stable, since changing its hostname or port creates a separate browser profile.

## Run Without Docker

Install Node.js 22 or newer. There are no runtime npm dependencies.

```powershell
$env:JOPLIN_SERVER_URL = 'http://192.168.1.20:22300'
npm start
```

Open `http://localhost:8080`. On Linux/macOS, use `JOPLIN_SERVER_URL=http://192.168.1.20:22300 npm start`.

## Development And Upstream

Run `npm ci` and `npm test` to test the web host, HTTP proxy, worker assets, and extraction hashes. `node tools/extract-web.mjs` refreshes browser assets from the official deployment; review and commit `web/` and `upstream-assets.json` together. Extraction parses HTML and JavaScript to discover runtime assets and records hashes. The compiled application JavaScript is preserved; page titles, manifest branding, and restricted app icons are replaced, and development mode remains disabled. On Windows behind an enterprise HTTPS proxy, `node --use-system-ca tools/extract-web.mjs` uses trusted system certificates without disabling TLS checks. Delete the ignored `.cache/upstream/` directory before refreshing to a new upstream release.

Upstream application source and build instructions: [laurent22/joplin](https://github.com/laurent22/joplin), especially `packages/app-mobile`, `packages/lib`, `packages/editor`, and `packages/renderer`. The original app is documented at [Joplin Web App](https://joplinapp.org/help/apps/web/). See `SOURCES.md` for the exact corresponding source revision, `NOTICE.md` for licensing and extraction scope, and `VERIFICATION.md` for completed and unverified checks.

## Security

Use HTTPS for public deployment, protect the browser profile, and expose only the web frontend through your reverse proxy. Never commit `.env` or put passwords in server URLs. The proxy has one operator-configured backend and is not an open proxy. Joplin's authentication and sync engine are retained; this host does not log request bodies or store your account credentials. This experimental deployment needs live-server testing before use with important accounts.