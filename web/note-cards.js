(() => {
	const layoutKey = 'joplin-self-hosted-note-layout';
	let tagModel;
	let connectedList;
	let permissionCheck;
	const NotebookEmoji = ({ react, icon, model, screen }) => {
		const [picker, setPicker] = react.useState(null);
		const [error, setError] = react.useState('');
		const folder = screen.state.folder;
		react.useEffect(() => {
			let active = true;
			let instance;
			import('./emoji-picker.js').then(() => {
				if (!active) return;
				instance = new window.JoplinEmojiButton({ rootElement: document.body, zIndex: 10000, autoHide: true, emojisPerRow: window.innerWidth < 480 ? 6 : 8, emojiSize: '1.5rem' });
				instance.on('emoji', selection => screen.folderComponent_change('icon', model.serializeIcon({ type: 1, emoji: selection.emoji, name: selection.name, dataUrl: '' })));
				setPicker(instance);
			}).catch(error => { if (active) setError(error.message); });
			return () => { active = false; instance?.hidePicker(); instance?.destroyPicker(); };
		}, [model, screen]);
		let emoji = '';
		try { emoji = model.unserializeIcon(folder.icon)?.emoji || ''; } catch {}
		const disabled = !!folder.encryption_applied || !!folder.deleted_time;
		return react.createElement('section', { className: 'notebook-emoji-editor', 'aria-label': 'Notebook icon' },
			react.createElement('span', { className: 'notebook-emoji-preview', 'aria-label': 'Current notebook icon' }, emoji || react.createElement(icon, { name: 'ionicon folder-outline', accessibilityLabel: null })),
			react.createElement('button', { type: 'button', disabled: disabled || !picker, onClick: event => picker.togglePicker(event.currentTarget) }, react.createElement(icon, { name: 'ionicon happy-outline', accessibilityLabel: null }), 'Select notebook emoji'),
			react.createElement('button', { type: 'button', title: 'Reset notebook icon', 'aria-label': 'Reset notebook icon', disabled: disabled || !folder.icon, onClick: () => screen.folderComponent_change('icon', '') }, react.createElement(icon, { name: 'ionicon close-outline', accessibilityLabel: null })),
			error ? react.createElement('p', { role: 'alert' }, error) : null);
	};
	const createTag = async (model, title) => {
		const trimmed = title.trim();
		if (!trimmed) throw new Error('Enter a tag name.');
		const existing = await model.loadByTitle(trimmed);
		if (existing) throw new Error('A tag with this name already exists.');
		return model.save({ title: trimmed }, { userSideValidation: true });
	};
	const NewTag = ({ react, icon, model, onCreated }) => {
		const dialog = react.useRef(null);
		const input = react.useRef(null);
		const [title, setTitle] = react.useState('');
		const [error, setError] = react.useState('');
		const [busy, setBusy] = react.useState(false);
		const save = async event => {
			event.preventDefault();
			setBusy(true);
			setError('');
			try {
				await createTag(model, title);
				onCreated();
				dialog.current.close();
			} catch (error) { setError(error.message); } finally { setBusy(false); }
		};
		return react.createElement('div', { className: 'tags-create-toolbar' },
			react.createElement('button', { type: 'button', onClick: () => { setTitle(''); setError(''); dialog.current.showModal(); input.current.focus(); } }, react.createElement(icon, { name: 'ionicon add-outline', accessibilityLabel: null }), 'New tag'),
			react.createElement('dialog', { ref: dialog, className: 'note-metadata-dialog', 'aria-labelledby': 'new-tag-heading', onCancel: event => { if (busy) event.preventDefault(); } },
				react.createElement('form', { onSubmit: save },
					react.createElement('h2', { id: 'new-tag-heading' }, 'New tag'),
					error ? react.createElement('p', { role: 'alert' }, error) : null,
					react.createElement('label', { htmlFor: 'new-tag-title' }, 'Tag name'),
					react.createElement('div', { className: 'note-metadata-row' }, react.createElement('input', { id: 'new-tag-title', ref: input, value: title, onChange: event => setTitle(event.target.value), required: true, disabled: busy })),
					react.createElement('footer', null, react.createElement('button', { type: 'button', disabled: busy, onClick: () => dialog.current.close() }, 'Cancel'), react.createElement('button', { type: 'submit', disabled: busy || !title.trim() }, busy ? 'Creating...' : 'Create tag')))));
	};
	const assertEditable = (entity, type, context) => {
		if (!entity || entity.encryption_applied || entity.is_locked || entity.deleted_time || permissionCheck(type, 1, entity, context.userId, context.shareService)) throw new Error('This item is read-only, locked, encrypted, or deleted.');
	};
	const tagKey = tags => JSON.stringify(tags.map(tag => tag.title.trim().normalize('NFC').toLowerCase()).sort());
	const metadata = {
		load: async (model, id, context) => {
			const note = await model.load(id);
			assertEditable(note, 1, context);
			const [tags, allTags] = await Promise.all([tagModel.tagsByNoteId(id), tagModel.all()]);
			return { note, tags, allTags: allTags.filter(tag => !tag.encryption_applied && !tag.deleted_time) };
		},
		save: async (model, original, changes, context) => {
			const note = await model.load(original.note.id);
			assertEditable(note, 1, context);
			if (tagKey(await tagModel.tagsByNoteId(note.id)) !== tagKey(original.tags)) throw new Error('The note tags changed elsewhere. Cancel and reopen before applying changes.');
			await tagModel.setNoteTagsByTitles(note.id, changes.tags);
		},
	};
	const MetadataDialog = ({ react, model, icon, note, context, onClose }) => {
		const dialogRef = react.useRef(null);
		const [original, setOriginal] = react.useState(null);
		const [tags, setTags] = react.useState([]);
		const [newTag, setNewTag] = react.useState('');
		const [busy, setBusy] = react.useState(false);
		const [error, setError] = react.useState('');
		react.useEffect(() => {
			let active = true;
			dialogRef.current.showModal();
			metadata.load(model, note.id, context).then(value => {
				if (!active) return;
				setOriginal(value);
				setTags(value.tags.map(tag => tag.title));
			}).catch(error => { if (active) setError(error.message); });
			return () => { active = false; };
		}, [model, note.id]);
		const addTag = () => {
			const value = newTag.trim();
			if (value && !tags.some(tag => tag.normalize('NFC').toLowerCase() === value.normalize('NFC').toLowerCase())) setTags([...tags, value]);
			setNewTag('');
		};
		const save = async event => {
			event.preventDefault();
			setBusy(true);
			setError('');
			try {
				const pending = newTag.trim();
				await metadata.save(model, original, { tags: pending ? [...tags, pending] : tags }, context);
				onClose();
			} catch (error) { setError(error.message); } finally { setBusy(false); }
		};
		const tool = (label, name, onClick, disabled = false) => react.createElement('button', { type: 'button', title: label, 'aria-label': label, onClick, disabled: busy || disabled }, react.createElement(icon, { name, accessibilityLabel: null }));
		return react.createElement('dialog', { ref: dialogRef, className: 'note-metadata-dialog', 'aria-labelledby': 'note-metadata-heading', onCancel: event => { event.preventDefault(); if (!busy) onClose(); } },
			react.createElement('form', { onSubmit: save },
				react.createElement('h2', { id: 'note-metadata-heading' }, 'Edit tags'),
				error ? react.createElement('p', { role: 'alert' }, error) : null,
				!original && !error ? react.createElement('p', { role: 'status' }, 'Loading…') : null,
				react.createElement('fieldset', { disabled: !original || busy },
					react.createElement('label', { htmlFor: 'note-metadata-tag' }, 'Tags'),
					react.createElement('ul', { className: 'note-metadata-tags' }, ...tags.map(tag => react.createElement('li', { key: tag }, react.createElement('span', null, tag), tool(`Remove tag ${tag}`, 'ionicon close-outline', () => setTags(tags.filter(value => value !== tag)))))),
					react.createElement('div', { className: 'note-metadata-row' }, react.createElement('input', { id: 'note-metadata-tag', list: 'note-metadata-suggestions', value: newTag, onChange: event => setNewTag(event.target.value), onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } } }), tool('Add tag', 'ionicon add-outline', addTag, !newTag.trim())),
					react.createElement('datalist', { id: 'note-metadata-suggestions' }, ...(original?.allTags || []).map(tag => react.createElement('option', { key: tag.id, value: tag.title })))),
				react.createElement('footer', null, react.createElement('button', { type: 'button', disabled: busy, onClick: onClose }, 'Cancel'), react.createElement('button', { type: 'submit', disabled: !original || busy }, busy ? 'Saving…' : 'Apply'))));
	};
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
	const NoteCard = ({ react, model, item, icon, markdown, note, index, layout, onEdit }) => {
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
			[...event.currentTarget.querySelectorAll('.note-card-original button, .note-card-original [role="button"]')].at(-1)?.click();
		};
		const forwardContextMenu = event => {
			if (event.target.closest('button, [role="button"], input, a')) return;
			const button = [...event.currentTarget.querySelectorAll('.note-card-original button, .note-card-original [role="button"]')].at(-1);
			if (button) {
				event.preventDefault();
				button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
			}
		};
		return react.createElement('article', { className: 'note-card', onClick: forwardPress, onContextMenu: forwardContextMenu, 'data-note-id': note.id },
			react.createElement('div', { className: 'note-card-original' }, react.createElement(item, { note, index })),
			layout === 'cards' ? react.createElement('p', { className: 'note-card-excerpt' }, hidden ? (note.encryption_applied ? 'Encrypted note' : 'Locked note') : preview) : null,
			react.createElement('div', { className: 'note-card-actions' }, react.createElement('button', { type: 'button', title: 'Edit tags', 'aria-label': `Edit tags: ${note.title}`, disabled: hidden || !!note.deleted_time, onClick: () => onEdit(note) }, react.createElement(icon, { name: 'ionicon pricetags-outline', accessibilityLabel: null }))));
	};
	const NoteCards = ({ react, item, model, icon, markdown, items, notesSource, permissionContext }) => {
		const [editing, setEditing] = react.useState(null);
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
			react.createElement('section', { className: 'note-cards-grid', 'aria-label': 'Notes' }, ...items.slice(0, limit).map((note, index) => react.createElement(NoteCard, { key: note.id, react, model, item, icon, markdown, note, index, layout, onEdit: setEditing }))),
			items.length > limit ? react.createElement('button', { className: 'note-cards-more', type: 'button', onClick: () => setLimit(value => value + 60) }, 'Show more notes') : null,
			editing ? react.createElement(MetadataDialog, { key: editing.id, react, model, icon, note: editing, context: permissionContext, onClose: () => setEditing(null) }) : null);
	};
	window.JoplinNoteCards = {
		folder: (react, icon, model, screen) => react.createElement(NotebookEmoji, { react, icon, model, screen }),
		tags: (react, icon, model, onCreated) => react.createElement(NewTag, { react, icon, model, onCreated }),
		createTag,
		models: (tags, folders, connect, readOnly) => {
			tagModel = tags;
			permissionCheck = readOnly;
			if (!connectedList) connectedList = connect(state => ({ permissionContext: { userId: state.settings['sync.userId'], shareService: state.shareService } }))(NoteCards);
		},
		metadata,
		list: (react, item, model, icon, markdown, props) => react.createElement(connectedList || NoteCards, { react, item, model, icon, markdown, ...props }),
	};
})();