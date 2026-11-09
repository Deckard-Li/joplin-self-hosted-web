import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createWebServer } from './server.mjs';
import { customizeEnvironment, customizeIndex, customizeNoteList, noteListBridge } from './tools/customize-note-list.mjs';

const listen = async server => {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	return `http://127.0.0.1:${server.address().port}`;
};

describe('Self-hosted Joplin Web', () => {
	test('customizes only the original note-list renderer and rejects changed upstream anchors', async () => {
		const bundle = await readFile(new URL('./web/app.bundle.js', import.meta.url), 'utf8');
		const original = bundle.replace(noteListBridge, '');
		const manifest = JSON.parse(await readFile(new URL('./upstream-assets.json', import.meta.url), 'utf8'));
		assert.equal(createHash('sha256').update(original).digest('hex'), manifest.files.find(file => file.path === 'app.bundle.js').sourceSha256);
		assert.equal(customizeNoteList(original), bundle);
		assert.equal(customizeNoteList(bundle), bundle);
		assert.throws(() => customizeNoteList(original.replace('You currently have no notebooks.', 'Upstream anchor changed.')), /module changed/);
		assert.throws(() => customizeNoteList(original.replace('e.name.match', 'e.label.match')), /icon module changed/);
		const index = await readFile(new URL('./web/index.html', import.meta.url), 'utf8');
		assert.ok(index.indexOf('./note-cards.js') < index.indexOf('./app.bundle.js'));
		assert.equal(customizeIndex(index), index);
		assert.match(customizeIndex('<html><head></head><body><script src="./app.bundle.js"></script></body></html>'), /note-cards\.css/);
		assert.throws(() => customizeIndex('<html><head></head><body></body></html>'), /HTML changed/);
		assert.match(customizeEnvironment("window.process = { env: { EXPO_OS: 'web' } };"), /platform: 'web'/);
		assert.throws(() => customizeEnvironment('window.exports = {};'), /bootstrap changed/);
	});

	test('never loads encrypted previews or parses protected local note bodies', async () => {
		const source = await readFile(new URL('./web/note-cards.js', import.meta.url), 'utf8');
		for (const protection of ['encrypted', 'locked', 'loadedLocked']) {
			const window = {};
			const effects = [];
			const updates = [];
			let loads = 0;
			let parserCalls = 0;
			const react = {
				createElement: (type, props, ...children) => ({ type, props, children }),
				useState: initial => [typeof initial === 'function' ? initial() : initial, value => updates.push(value)],
				useEffect: effect => effects.push(effect),
			};
			const model = { load: async () => { loads++; return { body: 'PROTECTED_BODY', is_locked: 1 }; } };
			const markdown = function() { parserCalls++; throw new Error('Protected previews must not be parsed'); };
			runInNewContext(source, { window, localStorage: { getItem: () => null } });
			const note = { id: 'protected-note', encryption_applied: protection === 'encrypted' ? 1 : 0, is_locked: protection === 'locked' ? 1 : 0 };
			const list = window.JoplinNoteCards.list(react, 'upstream-item', model, 'upstream-icon', markdown, { items: [note] });
			const rendered = list.type(list.props);
			const card = rendered.children[1].children[0];
			card.type(card.props);
			for (const effect of effects) effect();
			await new Promise(resolve => setImmediate(resolve));
			assert.equal(loads, protection === 'loadedLocked' ? 1 : 0);
			assert.equal(parserCalls, 0);
			assert.ok(!updates.includes('PROTECTED_BODY'));
		}
	});

	test('deploys portable HTTPS settings and rejects unsafe installer inputs', async context => {
		const shell = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/sh.exe') : '/bin/sh';
		try {
			await access(shell);
		} catch {
			context.skip('A POSIX shell is required for the Docker installer test.');
			return;
		}
		const directory = await mkdtemp(join(tmpdir(), 'joplin-deploy-'));
		context.after(() => rm(directory, { recursive: true, force: true }));
		await mkdir(join(directory, 'tools'));
		await mkdir(join(directory, 'bin'));
		await copyFile(new URL('./tools/deploy.sh', import.meta.url), join(directory, 'tools/deploy.sh'));
		await writeFile(join(directory, '.env'), 'EXISTING_SETTINGS=preserved\n');
		await writeFile(join(directory, 'bin/docker'), '#!/bin/sh\nprintf "%s|%s|%s\\n" "$*" "$WEB_DOMAIN" "$WEB_BIND" >> docker-calls\ncase " $* " in\n\t*" cp "*) printf "public-root\\n" > joplin-web-lan-root.crt ;;\n\t*" down "*) if [ "${MOCK_DOCKER_FAIL:-}" = yes ]; then exit 1; fi ;;\nesac\n', { mode: 0o700 });
		const run = (args, environment = {}) => spawnSync(shell, ['tools/deploy.sh', ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${join(directory, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, WEB_DOMAIN: 'ambient.example.org', ...environment } });
		for (const args of [
			['lan', 'https://wrong-host', 'http://localhost:22300'],
			['lan', 'localhost', 'http://user:secret@localhost:22300'],
			['lan', 'localhost', 'http://localhost:22300?token=value'],
			['lan', 'localhost', 'http://localhost:22300', '65536'],
			['public', 'notes.example.com', 'https://joplin.example.com', '8443'],
		]) assert.equal(run(args).status, 1, args.join(' '));
		await assert.rejects(readFile(join(directory, 'docker-calls')));
		for (const host of ['192.168.1.20', 'notes.lan']) {
			const result = run(['lan', host, 'http://backend.lan:22300/prefix', '22443']);
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, new RegExp(`https://${host.replaceAll('.', '\\.')}:22443/joplin`));
			assert.match(await readFile(join(directory, '.env.deploy'), 'utf8'), new RegExp(`WEB_DOMAIN=${host.replaceAll('.', '\\.')}\n`));
		}
		assert.equal(await readFile(join(directory, '.env'), 'utf8'), 'EXISTING_SETTINGS=preserved\n');
		assert.equal(await readFile(join(directory, 'joplin-web-lan-root.crt'), 'utf8'), 'public-root\n');
		const publicResult = run(['public', 'notes.example.com', 'https://backend.example.com']);
		assert.equal(publicResult.status, 0, publicResult.stderr);
		assert.match(publicResult.stdout, /https:\/\/notes\.example\.com\/joplin/);
		const calls = await readFile(join(directory, 'docker-calls'), 'utf8');
		assert.match(calls, /--wait --wait-timeout 180 --force-recreate web https-lan/);
		assert.match(calls, /--force-recreate web https\|notes\.example\.com\|127\.0\.0\.1/);
		assert.doesNotMatch(calls, /--env-file[^\n]*ambient\.example\.org|down -v/);
		assert.equal(run(['uninstall']).status, 1);
		assert.equal(await readFile(join(directory, 'docker-calls'), 'utf8'), calls);
		assert.equal(run(['uninstall', '--confirm'], { MOCK_DOCKER_FAIL: 'yes' }).status, 1);
		for (const filename of ['.env', '.env.deploy', 'joplin-web-lan-root.crt']) await access(join(directory, filename));
		for (let attempt = 0; attempt < 2; attempt++) {
			const result = run(['uninstall', '--confirm']);
			assert.equal(result.status, 0, result.stderr);
			for (const filename of ['.env', '.env.deploy', 'joplin-web-lan-root.crt']) await assert.rejects(readFile(join(directory, filename)));
		}
		const uninstallCalls = await readFile(join(directory, 'docker-calls'), 'utf8');
		assert.match(uninstallCalls, /--env-file .env.deploy --profile https --profile lan-https down --volumes --rmi local --remove-orphans/);
		assert.match(uninstallCalls, /--env-file \/dev\/null --profile https --profile lan-https down --volumes --rmi local --remove-orphans/);
		assert.doesNotMatch(uninstallCalls, /system prune|builder prune|image prune|volume prune/);
	});

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
		for (const asset of [...assets.files, ...(assets.localAssets || [])]) {
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