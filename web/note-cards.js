(() => {
	const layoutKey = 'joplin-self-hosted-note-layout';
	let markdownParser;
	const excerpt = (note, markdown) => {
		if (!markdownParser) {
			markdownParser = new markdown({ html: false, linkify: false });
			markdownParser.renderer.rules.image = () => '';
			markdownParser.renderer.rules.link_open = () => '';
			markdownParser.renderer.rules.link_close = () => '';
		}
		const body = (note.body || '').slice(0, 6000);
		const template = document.createElement('template');
		template.innerHTML = note.markup_language === 2 ? body : markdownParser.render(body);
		template.content.querySelectorAll('script, style, iframe, object').forEach(element => element.remove());
		if (note.markup_language === 2) template.content.querySelectorAll('p, div, li, h1, h2, h3, h4, br').forEach(element => element.append(document.createTextNode('\n')));
		return template.content.textContent.replace(/\n{3,}/g, '\n\n').trim().slice(0, 420);
	};
	const NoteCard = ({ react, model, item, markdown, note, index, layout }) => {
		const hidden = !!(note.encryption_applied || note.is_locked);
		const [preview, setPreview] = react.useState('');
		react.useEffect(() => {
			let active = true;
			setPreview('');
			if (!hidden && layout === 'cards') {
				model.load(note.id, { fields: ['body', 'markup_language', 'encryption_applied', 'is_locked'] }).then(loaded => {
					if (active && loaded && !loaded.encryption_applied && !loaded.is_locked) setPreview(excerpt(loaded, markdown));
				}).catch(() => { if (active) setPreview('Preview unavailable'); });
			}
			return () => { active = false; };
		}, [model, markdown, note.id, note.updated_time, hidden, layout]);
		const forwardPress = event => {
			if (event.target.closest('button, [role="button"], input, a')) return;
			[...event.currentTarget.querySelectorAll('button, [role="button"]')].at(-1)?.click();
		};
		const forwardContextMenu = event => {
			if (event.target.closest('button, [role="button"], input, a')) return;
			const button = [...event.currentTarget.querySelectorAll('button, [role="button"]')].at(-1);
			if (button) {
				event.preventDefault();
				button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
			}
		};
		return react.createElement('article', { className: 'note-card', onClick: forwardPress, onContextMenu: forwardContextMenu, 'data-note-id': note.id },
			react.createElement(item, { note, index }),
			layout === 'cards' ? react.createElement('p', { className: 'note-card-excerpt' }, hidden ? (note.encryption_applied ? 'Encrypted note' : 'Locked note') : preview) : null);
	};
	const NoteCards = ({ react, item, model, icon, markdown, items, notesSource }) => {
		const [layout, setLayout] = react.useState(() => {
			try { return localStorage.getItem(layoutKey) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; }
		});
		const [limit, setLimit] = react.useState(60);
		react.useEffect(() => { setLimit(60); }, [notesSource]);
		const changeLayout = value => {
			setLayout(value);
			try { localStorage.setItem(layoutKey, value); } catch {}
		};
		return react.createElement('div', { className: 'note-cards-view', 'data-layout': layout },
			react.createElement('header', { className: 'note-cards-toolbar' },
				react.createElement('span', { className: 'note-cards-count' }, `${items.length} ${items.length === 1 ? 'note' : 'notes'}`),
				react.createElement('div', { className: 'note-cards-modes', role: 'group', 'aria-label': 'Note layout' },
					...[['cards', 'Card view', 'ionicon grid-outline'], ['list', 'Compact list', 'ionicon list-outline']].map(([value, label, name]) => react.createElement('button', { key: value, type: 'button', title: label, 'aria-label': label, 'aria-pressed': layout === value, onClick: () => changeLayout(value) }, react.createElement(icon, { name, style: { fontSize: 20, color: '#24332b' }, accessibilityLabel: null }))))),
			react.createElement('section', { className: 'note-cards-grid', 'aria-label': 'Notes' }, ...items.slice(0, limit).map((note, index) => react.createElement(NoteCard, { key: note.id, react, model, item, markdown, note, index, layout }))),
			items.length > limit ? react.createElement('button', { className: 'note-cards-more', type: 'button', onClick: () => setLimit(value => value + 60) }, 'Show more notes') : null);
	};
	window.JoplinNoteCards = { list: (react, item, model, icon, markdown, props) => react.createElement(NoteCards, { react, item, model, icon, markdown, ...props }) };
})();