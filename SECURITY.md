# Security

This unofficial deployment is experimental. Use HTTPS for public browser access and preferably for the configured Joplin backend. A plain HTTP LAN frontend lacks the secure-context APIs needed by the original web app. The server session and browser-local notes remain sensitive, even when the frontend is served securely.

Protect `.env`, browser profiles, and server access. The proxy forwards only to `JOPLIN_SERVER_URL`, rejects browser requests from foreign origins, strips browser cookies, and does not log passwords or note bodies. Keep Joplin Server and your reverse proxy patched; this web host does not replace their authentication or security controls.

Report vulnerabilities privately through GitHub's private vulnerability reporting when available. Otherwise, open a public issue requesting a private contact channel without including exploit details or secrets. Do not attach credentials, session tokens, private notes, or browser storage exports.