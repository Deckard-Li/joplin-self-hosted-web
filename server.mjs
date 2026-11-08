import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentTypes = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export const createWebServer = ({ upstream, webRoot = fileURLToPath(new URL('./web/', import.meta.url)) }) => {
	const target = new URL(upstream);
	if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error('JOPLIN_SERVER_URL must be an HTTP(S) base URL without credentials, query, or fragment.');
	const root = resolve(webRoot);
	return createServer(async (incoming, outgoing) => {
		outgoing.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
		outgoing.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
		outgoing.setHeader('X-Content-Type-Options', 'nosniff');
		let pathname;
		try { pathname = new URL(incoming.url, 'http://localhost').pathname; } catch { outgoing.writeHead(400).end('Invalid request URL.'); return; }
		if (pathname.startsWith('/joplin/api/')) {
			const origin = incoming.headers.origin;
			let trustedOrigin = !origin;
			try { if (origin) trustedOrigin = ['http:', 'https:'].includes(new URL(origin).protocol) && new URL(origin).host === incoming.headers.host; } catch { trustedOrigin = false; }
			if (!trustedOrigin) {
				outgoing.writeHead(403).end('Cross-origin requests are not allowed.');
				return;
			}
			const url = new URL(`${target.href.replace(/\/$/, '')}${incoming.url.slice('/joplin'.length)}`);
			const headers = { ...incoming.headers, host: target.host };
			delete headers.origin;
			delete headers.cookie;
			delete headers['x-forwarded-for'];
			delete headers['x-real-ip'];
			const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
			const request = transport(url, { method: incoming.method, headers, timeout: 60000 }, response => {
				const responseHeaders = { ...response.headers, 'cache-control': 'no-store' };
				delete responseHeaders['set-cookie'];
				delete responseHeaders['access-control-allow-origin'];
				outgoing.writeHead(response.statusCode, responseHeaders);
				response.on('error', () => outgoing.destroy());
				response.pipe(outgoing);
			});
			request.on('timeout', () => request.destroy(new Error('Upstream timeout')));
			request.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end('Joplin Server is unavailable.'); });
			incoming.on('aborted', () => request.destroy());
			incoming.on('error', () => request.destroy());
			outgoing.on('close', () => request.destroy());
			incoming.pipe(request);
			return;
		}
		if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405).end(); return; }
		try {
			const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
			const file = resolve(root, relative);
			if (!file.startsWith(`${root}${sep}`)) { outgoing.writeHead(403).end(); return; }
			const info = await stat(file);
			if (!info.isFile()) { outgoing.writeHead(404).end(); return; }
			outgoing.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream');
			outgoing.setHeader('Content-Length', info.size);
			outgoing.setHeader('Cache-Control', 'no-cache');
			if (incoming.method === 'HEAD') { outgoing.end(); return; }
			createReadStream(file).on('error', () => outgoing.destroy()).pipe(outgoing);
		} catch {
			outgoing.writeHead(404).end('Not found');
		}
	});
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (!process.env.JOPLIN_SERVER_URL) throw new Error('Set JOPLIN_SERVER_URL to the existing Joplin Server base URL.');
	const port = Number(process.env.PORT || 8080);
	createWebServer({ upstream: process.env.JOPLIN_SERVER_URL }).listen(port, '0.0.0.0', () => console.log(`Joplin Web is listening on port ${port}.`));
}