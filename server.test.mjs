import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWebServer } from './server.mjs';

const listen = async server => {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	return `http://127.0.0.1:${server.address().port}`;
};

describe('Self-hosted Joplin Web', () => {
	test('proxies HTTP sync requests with path prefixes, body and session headers', async context => {
		const backend = createServer(async (request, response) => {
			assert.equal(request.url, '/prefix/api/sessions?test=1');
			assert.equal(request.headers['x-api-auth'], 'test-session');
			assert.equal(request.headers.cookie, undefined);
			assert.equal(request.headers.origin, undefined);
			let body = '';
			for await (const chunk of request) body += chunk;
			assert.equal(body, '{"email":"test@example.org"}');
			response.setHeader('Set-Cookie', 'unwanted=value');
			response.end('{"id":"test-session"}');
		});
		context.after(() => new Promise(resolve => backend.close(resolve)));
		const backendUrl = await listen(backend);
		const frontend = createWebServer({ upstream: `${backendUrl}/prefix` });
		context.after(() => new Promise(resolve => frontend.close(resolve)));
		const frontendUrl = await listen(frontend);
		const response = await fetch(`${frontendUrl}/joplin/api/sessions?test=1`, { method: 'POST', headers: { Origin: frontendUrl, 'X-API-AUTH': 'test-session', Cookie: 'private=value' }, body: '{"email":"test@example.org"}' });
		assert.equal(response.status, 200);
		assert.equal(await response.text(), '{"id":"test-session"}');
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal(response.headers.get('set-cookie'), null);
	});

	test('rejects cross-origin proxy access and provides isolation headers', async context => {
		const server = createWebServer({ upstream: 'http://127.0.0.1:1' });
		context.after(() => new Promise(resolve => server.close(resolve)));
		const url = await listen(server);
		for (const origin of ['https://untrusted.example.org', 'null', 'not-a-url']) {
			const response = await fetch(`${url}/joplin/api/sessions`, { method: 'POST', headers: { Origin: origin } });
			assert.equal(response.status, 403);
			assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
			assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
		}
		const invalidUrlStatus = await new Promise((resolve, reject) => {
			const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: 'http://[invalid' }, response => { response.resume(); resolve(response.statusCode); });
			request.on('error', reject);
			request.end();
		});
		assert.equal(invalidUrlStatus, 400);
	});

	test('rejects unsafe upstream URLs', () => {
		for (const upstream of ['file:///tmp/test', 'https://user:password@example.org', 'https://example.org/?token=value']) assert.throws(() => createWebServer({ upstream }));
	});

	test('serves the original frontend, workers and WASM with verified asset hashes', async context => {
		const assets = JSON.parse(await readFile(new URL('./upstream-assets.json', import.meta.url), 'utf8'));
		for (const asset of assets.files) {
			const bytes = await readFile(new URL(`./web/${asset.path}`, import.meta.url));
			assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
		}
		const server = createWebServer({ upstream: 'http://127.0.0.1:1' });
		context.after(() => new Promise(resolve => server.close(resolve)));
		const url = await listen(server);
		const index = await fetch(url);
		assert.equal(index.status, 200);
		assert.match(await index.text(), /app\.bundle\.js/);
		for (const asset of assets.files.filter(asset => /\.wasm$|^\d+\.bundle\.js$/.test(asset.path))) {
			const response = await fetch(`${url}/${asset.path}`, { method: 'HEAD' });
			assert.equal(response.status, 200, asset.path);
			assert.equal(response.headers.get('content-length'), String(asset.bytes));
			if (asset.path.endsWith('.wasm')) assert.equal(response.headers.get('content-type'), 'application/wasm');
			assert.equal(await response.text(), '');
		}
		assert.equal((await fetch(`${url}/server.mjs`)).status, 404);
		assert.equal((await fetch(`${url}/joplin/api/ping`)).status, 502);
	});
});