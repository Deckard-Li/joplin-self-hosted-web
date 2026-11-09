import { parse } from 'acorn';
import { parse as parseHtml, parseFragment, serialize } from 'parse5';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const walk = (node, callback) => {
	if (!node || typeof node !== 'object') return;
	callback(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parentNode') continue;
		if (Array.isArray(value)) value.forEach(child => walk(child, callback));
		else if (value && typeof value === 'object') walk(value, callback);
	}
};

export const noteListBridge = 'if(this.props.items.length&&window.JoplinNoteCards)return window.JoplinNoteCards.list(m,O.default,n(98800).default,n(94467).default,n(20580),this.props);';

export const customizeNoteList = source => {
	const marker = 'window.JoplinNoteCards.list';
	if (source.includes(marker)) return source;
	const tree = parse(source, { ecmaVersion: 'latest' });
	const candidates = [];
	const dependencies = new Map();
	walk(tree, node => {
		if (node.type === 'Property' && [94467, 20580, 98800].includes(node.key.value)) dependencies.set(node.key.value, source.slice(node.start, node.end));
		if (node.type !== 'Property' || node.key.value !== 67846) return;
		const code = source.slice(node.start, node.end);
		if (!code.includes('You currently have no notebooks.') || !code.includes('O=f(n(37309))')) throw new Error('Upstream note-list module changed.');
		walk(node.value.body, nested => {
			if (nested.type !== 'ObjectExpression') return;
			const properties = new Map(nested.properties.filter(property => property.type === 'Property').map(property => [property.key.name ?? property.key.value, property.value]));
			if (properties.get('key')?.value === 'render' && properties.get('value')?.type === 'FunctionExpression') candidates.push(properties.get('value').body.start + 1);
		});
	});
	if (candidates.length !== 1) throw new Error('Expected exactly one upstream note-list render method.');
	if (!dependencies.get(94467)?.includes('e.name.match') || !dependencies.get(94467)?.includes('ionicon')) throw new Error('Upstream icon module changed.');
	if (!dependencies.get(20580)?.includes('.prototype.render=function')) throw new Error('Upstream Markdown module changed.');
	if (!dependencies.get(98800)?.includes('key:"tableName",value:function(){return"notes"}')) throw new Error('Upstream note model changed.');
	const position = candidates[0];
	const output = `${source.slice(0, position)}${noteListBridge}${source.slice(position)}`;
	parse(output, { ecmaVersion: 'latest' });
	return output;
};

export const customizeIndex = source => {
	const document = parseHtml(source);
	let head;
	let appScript;
	let hasStyles = false;
	let hasScript = false;
	walk(document, node => {
		if (node.tagName === 'head') head = node;
		if (node.tagName === 'script' && node.attrs.some(attribute => attribute.name === 'src' && attribute.value === './app.bundle.js')) appScript = node;
		if (node.tagName === 'link' && node.attrs.some(attribute => attribute.value === './note-cards.css')) hasStyles = true;
		if (node.tagName === 'script' && node.attrs.some(attribute => attribute.value === './note-cards.js')) hasScript = true;
	});
	if (!head || !appScript) throw new Error('Upstream application HTML changed.');
	if (!hasStyles) {
		const link = parseFragment('<link rel="stylesheet" href="./note-cards.css">').childNodes[0];
		link.parentNode = head;
		head.childNodes.push(link);
	}
	if (!hasScript) {
		const script = parseFragment('<script defer src="./note-cards.js"></script>').childNodes[0];
		script.parentNode = appScript.parentNode;
		appScript.parentNode.childNodes.splice(appScript.parentNode.childNodes.indexOf(appScript), 0, script);
	}
	return serialize(document);
};

export const customizeEnvironment = source => {
	const candidates = [];
	walk(parse(source, { ecmaVersion: 'latest' }), node => {
		if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression' || node.left.object.name !== 'window' || node.left.property.name !== 'process' || node.right.type !== 'ObjectExpression') return;
		candidates.push(node.right);
	});
	if (candidates.length !== 1) throw new Error('Upstream web bootstrap changed.');
	if (candidates[0].properties.some(property => (property.key.name ?? property.key.value) === 'platform')) return source;
	const position = candidates[0].start + 1;
	return `${source.slice(0, position)}\n\tplatform: 'web',${source.slice(position)}`;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const manifestUrl = new URL('../upstream-assets.json', import.meta.url);
	const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
	const bundleUrl = new URL('../web/app.bundle.js', import.meta.url);
	const source = await readFile(bundleUrl, 'utf8');
	const record = manifest.files.find(file => file.path === 'app.bundle.js');
	if (createHash('sha256').update(source).digest('hex') !== record.sha256) throw new Error('The application bundle does not match its recorded hash.');
	const outputs = new Map([
		['app.bundle.js', customizeNoteList(source)],
		['index.html', customizeIndex(await readFile(new URL('../web/index.html', import.meta.url), 'utf8'))],
		['environment.js', customizeEnvironment(await readFile(new URL('../web/environment.js', import.meta.url), 'utf8'))],
	]);
	for (const path of ['app.bundle.js', 'index.html', 'environment.js']) {
		const bytes = Buffer.from(outputs.get(path));
		await writeFile(new URL(`../web/${path}`, import.meta.url), bytes);
		const entry = manifest.files.find(file => file.path === path);
		entry.sha256 = createHash('sha256').update(bytes).digest('hex');
		entry.bytes = bytes.length;
	}
	manifest.localAssets = [];
	for (const path of ['note-cards.js', 'note-cards.css']) {
		const bytes = await readFile(new URL(`../web/${path}`, import.meta.url));
		if (path.endsWith('.js')) parse(bytes.toString('utf8'), { ecmaVersion: 'latest' });
		manifest.localAssets.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
	}
	manifest.customizations = ['Local note cards with excerpts and a compact-list toggle'];
	await writeFile(manifestUrl, `${JSON.stringify(manifest, null, '\t')}\n`);
	console.log('Customized and syntax-checked the upstream note list; recorded output hashes.');
}