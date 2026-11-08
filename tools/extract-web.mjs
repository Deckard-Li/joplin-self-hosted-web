import { parse as parseJavaScript } from 'acorn';
import { parse as parseHtml, serialize } from 'parse5';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = 'https://app.joplincloud.com/';
const root = fileURLToPath(new URL('../web/', import.meta.url));
const cacheRoot = fileURLToPath(new URL('../.cache/upstream/', import.meta.url));
const pending = ['index.html', 'environment.js', 'serviceWorker.bundle.js', 'app.bundle.js', 'index.css', 'manifest.json', 'closed.html', 'just-one-client.html', 'info-page.css'];
const visited = new Set();
const records = [];
const revisions = new Set();
const versions = new Set();
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="12" fill="#167d61"/><path d="M26 18h30l14 14v46H26z" fill="white"/><path d="M56 18v16h14M36 46h24M36 57h24M36 68h16" fill="none" stroke="#167d61" stroke-width="4"/></svg>';

const walk = (node, callback) => {
	const pending = [node];
	while (pending.length) {
		const current = pending.pop();
		if (!current || typeof current !== 'object') continue;
		callback(current);
		for (const [key, value] of Object.entries(current)) {
			if (key === 'parentNode') continue;
			if (Array.isArray(value)) pending.push(...value);
			else if (value && typeof value === 'object') pending.push(value);
		}
	}
};

const enqueue = (value, base) => {
	if (!value || value.startsWith('data:') || value.startsWith('blob:')) return;
	const url = new URL(value, new URL(base, source));
	if (url.origin !== new URL(source).origin) return;
	const path = decodeURIComponent(url.pathname.slice(1));
	if (!path || path.startsWith('icons/') || path.startsWith('screenshots/') || path.includes('..') || path.includes('\\')) return;
	if (!visited.has(path)) pending.push(path);
};

const evaluate = (node, parameter, value) => {
	if (node.type === 'Literal') return node.value;
	if (node.type === 'Identifier' && node.name === parameter) return value;
	if (node.type === 'BinaryExpression' && node.operator === '+') return evaluate(node.left, parameter, value) + evaluate(node.right, parameter, value);
	if (node.type === 'LogicalExpression' && node.operator === '||') return evaluate(node.left, parameter, value) || evaluate(node.right, parameter, value);
	if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property => [property.key.name ?? property.key.value, evaluate(property.value, parameter, value)]));
	if (node.type === 'MemberExpression') return evaluate(node.object, parameter, value)?.[node.computed ? evaluate(node.property, parameter, value) : node.property.name];
	throw new Error(`Unsupported chunk URL expression: ${node.type}`);
};

const discoverJavaScript = (text, path) => {
	const tree = parseJavaScript(text, { ecmaVersion: 'latest', sourceType: 'script' });
	const chunks = new Set();
	const chunkResolvers = [];
	walk(tree, node => {
		if (path === 'app.bundle.js' && node.type === 'ObjectExpression') {
			const properties = new Map(node.properties.filter(property => property.type === 'Property').map(property => [property.key.name ?? property.key.value, property.value]));
			if (properties.get('name')?.value === '@joplin/app-mobile') {
				const version = properties.get('version')?.value;
				const revision = properties.get('git')?.properties?.find(property => (property.key.name ?? property.key.value) === 'hash')?.value?.value;
				if (typeof revision === 'string' && /^[a-f0-9]{8,40}$/.test(revision)) revisions.add(revision);
				if (typeof version === 'string' && /^\d+\.\d+\./.test(version)) versions.add(version);
			}
		}
		if (node.type === 'Literal' && typeof node.value === 'string') {
			if (/^(?:\.\/)?[a-f0-9]{16,}\.(?:png|svg|jpe?g|gif|ttf|woff2?|wasm|js)$/.test(node.value)) enqueue(node.value, path);
			if (/^(?:\.\/)?[a-zA-Z0-9_-]+\.bundle\.js$/.test(node.value)) enqueue(node.value, path);
		}
		if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && ['e', 'u'].includes(node.callee.property.name) && typeof node.arguments[0]?.value === 'number') chunks.add(node.arguments[0].value);
		if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.property.name === 'u' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.right.type)) {
			let isChunkResolver = false;
			walk(node.right, nested => { if (nested.type === 'Literal' && typeof nested.value === 'string' && nested.value.endsWith('.bundle.js')) isChunkResolver = true; });
			if (!isChunkResolver) return;
			chunkResolvers.push(node.right);
			walk(node.right, nested => { if (nested.type === 'Property' && /^\d+$/.test(String(nested.key.value ?? nested.key.name))) chunks.add(Number(nested.key.value ?? nested.key.name)); });
		}
	});
	for (const resolver of chunkResolvers) {
		const body = resolver.body.type === 'BlockStatement' ? resolver.body.body.find(node => node.type === 'ReturnStatement')?.argument : resolver.body;
		if (!body) throw new Error('Missing Webpack chunk resolver body.');
		for (const chunk of chunks) enqueue(String(evaluate(body, resolver.params[0]?.name, chunk)), path);
	}
};

await mkdir(root, { recursive: true });
await mkdir(cacheRoot, { recursive: true });
while (pending.length) {
	const path = pending.shift();
	if (visited.has(path)) continue;
	visited.add(path);
	const cached = resolve(cacheRoot, path);
	let bytes;
	try { bytes = await readFile(cached); } catch {
		const response = await fetch(new URL(path, source), { signal: AbortSignal.timeout(300000) });
		if (response.status === 404 && path.endsWith('.LICENSE.txt')) continue;
		if (!response.ok) throw new Error(`Cannot extract ${path}: HTTP ${response.status}`);
		bytes = Buffer.from(await response.arrayBuffer());
		await mkdir(dirname(cached), { recursive: true });
		await writeFile(cached, bytes);
	}
	const text = bytes.toString('utf8');
	let output = bytes;
	if (path.endsWith('.js')) {
		if (path === 'environment.js') {
			const environment = parseJavaScript(text, { ecmaVersion: 'latest' });
			walk(environment, node => {
				if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === 'window' && node.left.property.name === '__DEV__') output = Buffer.from(`${text.slice(0, node.right.start)}false${text.slice(node.right.end)}`);
			});
		}
		discoverJavaScript(text, path);
		if (path.endsWith('.bundle.js')) enqueue(`${path}.LICENSE.txt`, 'index.html');
	} else if (path.endsWith('.html')) {
		const document = parseHtml(text);
		walk(document, node => {
			if (!node.attrs) return;
			for (const attribute of node.attrs) {
				if (['src', 'href'].includes(attribute.name) && ['script', 'link', 'img'].includes(node.tagName)) enqueue(attribute.value, path);
			}
			if (node.tagName === 'link' && node.attrs.some(attribute => attribute.name === 'rel' && ['icon', 'apple-touch-icon'].includes(attribute.value))) {
				const href = node.attrs.find(attribute => attribute.name === 'href');
				if (href) href.value = './self-hosted-icon.svg';
			}
			if (node.tagName === 'title') node.childNodes = [{ nodeName: '#text', value: 'Joplin Web - Unofficial Self-hosted', parentNode: node }];
		});
		output = Buffer.from(serialize(document));
	} else if (path.endsWith('.json')) {
		const manifest = JSON.parse(text);
		manifest.name = 'Joplin Web - Unofficial Self-hosted';
		manifest.short_name = 'Notes';
		manifest.icons = [{ src: './self-hosted-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
		manifest.screenshots = [];
		output = Buffer.from(`${JSON.stringify(manifest, null, '\t')}\n`);
	}
	const destination = resolve(root, path);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, output);
	records.push({ path, sourceSha256: createHash('sha256').update(bytes).digest('hex'), sha256: createHash('sha256').update(output).digest('hex'), bytes: output.length });
	console.log(`Extracted ${path} (${output.length} bytes)`);
}
await writeFile(resolve(root, 'self-hosted-icon.svg'), `${icon}\n`);
if (revisions.size !== 1 || versions.size !== 1) throw new Error('Cannot identify one upstream application revision and version.');
const revision = [...revisions][0];
const commitResponse = await fetch(`https://api.github.com/repos/laurent22/joplin/commits/${revision}`, { headers: { 'User-Agent': 'Joplin-Self-Hosted-Web' }, signal: AbortSignal.timeout(60000) });
if (!commitResponse.ok) throw new Error(`Cannot resolve upstream source revision: HTTP ${commitResponse.status}`);
const commit = await commitResponse.json();
if (!commit.sha.startsWith(revision)) throw new Error('Upstream revision does not match the resolved source commit.');
await writeFile(fileURLToPath(new URL('../upstream-assets.json', import.meta.url)), `${JSON.stringify({ source, upstreamVersion: [...versions][0], upstreamRevision: commit.sha, sourceUrl: `https://github.com/laurent22/joplin/tree/${commit.sha}`, extractedAt: new Date().toISOString(), files: records }, null, '\t')}\n`);
console.log(`Extracted ${records.length} assets. Original JavaScript bundles were not modified.`);