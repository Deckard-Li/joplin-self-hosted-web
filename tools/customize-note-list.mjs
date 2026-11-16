import { parse } from 'acorn';
import { parse as parseHtml, parseFragment, serialize } from 'parse5';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

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
export const metadataBridge = 'window.JoplinNoteCards.models(n(12682).default,n(66532).default,n(1290).connect,n(17592).itemIsReadOnlySync);';
export const folderBridge = 'window.JoplinNoteCards.folder(y,JoplinNotebookIcon,k.default,this),';
export const tagsBridge = 'window.JoplinNoteCards.tags(d,JoplinTagsIcon,f.default,function(){D("");h(function(e){return e+1})}),';
export const screenImports = ['var JoplinNotebookIcon=n(94467).default;', 'var JoplinTagsIcon=n(94467).default;'];
export const tagQueries = [
	['t=yield f.default.searchAllWithNotes({titlePattern:n})}else t=yield f.default.allWithNotes();t.sort', 't=yield f.default.search({titlePattern:n})}else t=yield f.default.all();t.sort'],
];

export const customizeScreens = source => {
	if (source.includes(folderBridge) && source.includes(tagsBridge)) return source;
	source = source.replace(folderBridge, '').replace(tagsBridge, '');
	for (const code of screenImports) source = source.replace(code, '');
	for (const [original, replacement] of tagQueries) source = source.replace(replacement, original);
	const positions = [];
	const imports = [];
	let tagModule;
	walk(parse(source, { ecmaVersion: 'latest' }), node => {
		if (node.type === 'Property' && node.key.value === 75677) tagModule = node;
		if (node.type !== 'Property' || node.key.value !== 48032) return;
		imports.push({ position: node.value.body.body[0].end, code: screenImports[0] });
		if (!source.slice(node.start, node.end).includes('Edit notebook')) throw new Error('Upstream notebook editor changed.');
		walk(node.value.body, nested => {
			if (nested.type !== 'CallExpression' || nested.callee.type !== 'MemberExpression' || nested.callee.property.name !== 'createElement') return;
			if (nested.arguments[0]?.type !== 'MemberExpression' || nested.arguments[0].object.name !== 'C' || nested.arguments[0].property.name !== 'default') return;
			positions.push({ position: nested.end + 1, code: folderBridge });
		});
	});
	if (positions.length !== 1) throw new Error('Expected one notebook title input.');
	if (!tagModule || !source.slice(tagModule.start, tagModule.end).includes('Search tags')) throw new Error('Upstream tags screen changed.');
	imports.push({ position: tagModule.value.body.body[0].end, code: screenImports[1] });
	walk(tagModule.value.body, node => {
		if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.property.name !== 'createElement') return;
		if (node.arguments[0]?.type !== 'MemberExpression' || node.arguments[0].object.name !== 'g' || node.arguments[0].property.name !== 'ScreenHeader') return;
		positions.push({ position: node.end + 1, code: tagsBridge });
	});
	if (positions.length !== 2) throw new Error('Expected one tags header.');
	let output = source;
	for (const { position, code } of [...positions, ...imports].sort((left, right) => right.position - left.position)) output = `${output.slice(0, position)}${code}${output.slice(position)}`;
	for (const [original, replacement] of tagQueries) {
		if (!output.includes(original)) throw new Error('Upstream tag queries changed.');
		output = output.replace(original, replacement);
	}
	parse(output, { ecmaVersion: 'latest' });
	return output;
};

export const customizeNoteList = source => {
	const marker = 'window.JoplinNoteCards.list';
	if (source.includes(metadataBridge)) return source;
	if (source.includes(marker)) source = source.replace(noteListBridge, '').replace('window.JoplinNoteCards.models(n(12682).default,n(66532).default);', '');
	const tree = parse(source, { ecmaVersion: 'latest' });
	const candidates = [];
	const dependencies = new Map();
	walk(tree, node => {
		if (node.type === 'Property' && [94467, 20580, 98800, 12682, 66532, 17592].includes(node.key.value)) dependencies.set(node.key.value, source.slice(node.start, node.end));
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
	if (!dependencies.get(12682)?.includes('key:"setNoteTagsByTitles"')) throw new Error('Upstream tag model changed.');
	if (!dependencies.get(66532)?.includes('key:"tableName",value:function(){return"folders"}')) throw new Error('Upstream folder model changed.');
	if (!dependencies.get(17592)?.includes('t.itemIsReadOnlySync=function')) throw new Error('Upstream permission checker changed.');
	const position = candidates[0];
	const output = `${source.slice(0, position)}${metadataBridge}${noteListBridge}${source.slice(position)}`;
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
		['app.bundle.js', customizeScreens(customizeNoteList(source))],
		['index.html', customizeIndex(await readFile(new URL('../web/index.html', import.meta.url), 'utf8'))],
		['environment.js', customizeEnvironment(await readFile(new URL('../web/environment.js', import.meta.url), 'utf8'))],
	]);
	await build({
		stdin: { contents: "import { EmojiButton } from '@joeattardi/emoji-button'; window.JoplinEmojiButton = EmojiButton;", resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
		bundle: true,
		format: 'iife',
		minify: true,
		outfile: fileURLToPath(new URL('../web/emoji-picker.js', import.meta.url)),
	});
	const licenses = [];
	const visited = new Set();
	const collectLicenses = async (name, require) => {
		const packagePath = require.resolve(`${name}/package.json`);
		if (visited.has(packagePath)) return;
		visited.add(packagePath);
		const directory = dirname(packagePath);
		const info = JSON.parse(await readFile(packagePath, 'utf8'));
		licenses.push(`${info.name}@${info.version} (${info.license})`);
		for (const path of (await readdir(directory)).filter(path => /^(license|licence|notice|copyright)([-.]|$)/i.test(path)).sort()) licenses.push(await readFile(resolve(directory, path), 'utf8'));
		for (const dependency of Object.keys(info.dependencies || {}).sort()) await collectLicenses(dependency, createRequire(packagePath));
	};
	await collectLicenses('@joeattardi/emoji-button', createRequire(import.meta.url));
	await writeFile(new URL('../web/emoji-picker.LICENSE.txt', import.meta.url), `${licenses.join('\n\n')}\n`);
	for (const path of ['app.bundle.js', 'index.html', 'environment.js']) {
		const bytes = Buffer.from(outputs.get(path));
		await writeFile(new URL(`../web/${path}`, import.meta.url), bytes);
		const entry = manifest.files.find(file => file.path === path);
		entry.sha256 = createHash('sha256').update(bytes).digest('hex');
		entry.bytes = bytes.length;
	}
	manifest.localAssets = [];
	for (const path of ['note-cards.js', 'note-cards.css', 'emoji-picker.js', 'emoji-picker.LICENSE.txt']) {
		const bytes = await readFile(new URL(`../web/${path}`, import.meta.url));
		if (path.endsWith('.js')) parse(bytes.toString('utf8'), { ecmaVersion: 'latest' });
		manifest.localAssets.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
	}
	manifest.customizations = ['Local note cards with excerpts and a compact-list toggle', 'Notebook editor emoji picker, New tag on Tags screen, and note tag editing'];
	await writeFile(manifestUrl, `${JSON.stringify(manifest, null, '\t')}\n`);
	console.log('Customized and syntax-checked the upstream note list; recorded output hashes.');
}