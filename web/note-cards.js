(() => {
	const layoutKey = 'joplin-self-hosted-note-layout';
	let tagModel;
	let folderModel;
	let connectedList;
	let permissionCheck;
	const assertEditable = (entity, type, context) => {
		if (!entity || entity.encryption_applied || entity.is_locked || entity.deleted_time || permissionCheck(type, 1, entity, context.userId, context.shareService)) throw new Error('This item is read-only, locked, encrypted, or deleted.');
	};
	const tagKey = tags => JSON.stringify(tags.map(tag => tag.title.trim().normalize('NFC').toLowerCase()).sort());
	const metadata = {
		load: async (model, id, context) => {
			const note = await model.load(id);
			assertEditable(note, 1, context);
			const [tags, allTags, folder] = await Promise.all([tagModel.tagsByNoteId(id), tagModel.all(), folderModel.load(note.parent_id)]);
			return { note, tags, allTags: allTags.filter(tag => !tag.encryption_applied && !tag.deleted_time), folder };
		},
		save: async (model, original, changes, context) => {
			const note = await model.load(original.note.id);
			assertEditable(note, 1, context);
			if (note.title !== original.note.title || tagKey(await tagModel.tagsByNoteId(note.id)) !== tagKey(original.tags)) throw new Error('The note changed elsewhere. Cancel and reopen before applying changes.');
			if (!changes.title.trim()) throw new Error('The note title cannot be empty.');
			if (changes.folderIcon !== (original.folder?.icon || '')) {
				if (note.parent_id !== original.note.parent_id) throw new Error('The note moved to another notebook. Cancel and reopen.');
				const folder = await folderModel.load(original.folder?.id);
				assertEditable(folder, 2, context);
				if ((folder.icon || '') !== (original.folder.icon || '')) throw new Error('The notebook icon changed elsewhere. Cancel and reopen.');
				await folderModel.save({ id: folder.id, icon: changes.folderIcon });
			}
			if (changes.title !== original.note.title) await model.save({ id: note.id, title: changes.title }, { userSideValidation: true });
			await tagModel.setNoteTagsByTitles(note.id, changes.tags);
		},
	};
	const MetadataDialog = ({ react, model, icon, note, context, onClose }) => {
		const dialogRef = react.useRef(null);
		const emojiTarget = react.useRef(false);
		const [original, setOriginal] = react.useState(null);
		const [title, setTitle] = react.useState('');
		const [tags, setTags] = react.useState([]);
		const [newTag, setNewTag] = react.useState('');
		const [folderIcon, setFolderIcon] = react.useState('');
		const [busy, setBusy] = react.useState(false);
		const [error, setError] = react.useState('');
		const [picker, setPicker] = react.useState(null);
		react.useEffect(() => {
			let active = true;
			dialogRef.current.showModal();
			metadata.load(model, note.id, context).then(value => {
				if (!active) return;
				setOriginal(value);
				setTitle(value.note.title);
				setTags(value.tags.map(tag => tag.title));
				setFolderIcon(value.folder?.icon || '');
			}).catch(error => { if (active) setError(error.message); });
			return () => { active = false; };
		}, [model, note.id]);
		react.useEffect(() => {
			let instance;
			let active = true;
			import('./emoji-picker.js').then(() => {
				if (!active) return;
				instance = new window.JoplinEmojiButton({ rootElement: dialogRef.current, zIndex: 10000, autoHide: true, emojisPerRow: window.innerWidth < 480 ? 6 : 8, emojiSize: '1.5rem' });
				instance.on('emoji', selection => {
					if (emojiTarget.current) setFolderIcon(folderModel.serializeIcon({ type: 1, emoji: selection.emoji, name: selection.name, dataUrl: '' }));
					else setTitle(value => `${selection.emoji} ${value}`);
				});
				setPicker(instance);
			}).catch(error => { if (active) setError(`Emoji picker unavailable: ${error.message}`); });
			return () => { active = false; instance?.hidePicker(); instance?.destroyPicker(); };
		}, []);
		const chooseEmoji = (event, notebook) => {
			emojiTarget.current = notebook;
			picker.togglePicker(event.currentTarget);
		};
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
				await metadata.save(model, original, { title, tags: pending ? [...tags, pending] : tags, folderIcon }, context);
				onClose();
			} catch (error) { setError(error.message); } finally { setBusy(false); }
		};
		const tool = (label, name, onClick, disabled = false) => react.createElement('button', { type: 'button', title: label, 'aria-label': label, onClick, disabled: busy || disabled }, react.createElement(icon, { name, accessibilityLabel: null }));
		return react.createElement('dialog', { ref: dialogRef, className: 'note-metadata-dialog', 'aria-labelledby': 'note-metadata-heading', onKeyDownCapture: event => { if (event.key === 'Escape' && picker?.isPickerVisible()) { event.preventDefault(); event.stopPropagation(); picker.hidePicker(); } }, onCancel: event => { event.preventDefault(); if (!busy) onClose(); } },
			react.createElement('form', { onSubmit: save },
				react.createElement('h2', { id: 'note-metadata-heading' }, 'Note details'),
				error ? react.createElement('p', { role: 'alert' }, error) : null,
				!original && !error ? react.createElement('p', { role: 'status' }, 'Loading…') : null,
				react.createElement('fieldset', { disabled: !original || busy },
					react.createElement('label', { htmlFor: 'note-metadata-title' }, 'Title'),
					react.createElement('div', { className: 'note-metadata-row' }, react.createElement('input', { id: 'note-metadata-title', value: title, onChange: event => setTitle(event.target.value), required: true }), tool('Insert title emoji', 'ionicon happy-outline', event => chooseEmoji(event, false), !picker)),
					original?.folder ? react.createElement('div', { className: 'note-metadata-notebook' },
						react.createElement('label', null, `Notebook: ${original.folder.title}`),
						react.createElement('div', { className: 'note-metadata-row' },
							react.createElement('span', null, folderIcon ? folderModel.unserializeIcon(folderIcon)?.emoji || 'Custom icon' : 'Default icon'),
							tool('Select notebook emoji', 'ionicon happy-outline', event => chooseEmoji(event, true), !picker || !!original.folder.encryption_applied || permissionCheck(2, 1, original.folder, context.userId, context.shareService)),
							tool('Reset notebook icon', 'ionicon close-outline', () => setFolderIcon(''), !folderIcon || !!original.folder.encryption_applied || permissionCheck(2, 1, original.folder, context.userId, context.shareService)))) : null,
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
			react.createElement('div', { className: 'note-card-actions' }, ...[['Edit tags', 'ionicon pricetags-outline'], ['Emoji and note details', 'ionicon happy-outline']].map(([label, name]) => react.createElement('button', { key: label, type: 'button', title: label, 'aria-label': `${label}: ${note.title}`, disabled: hidden || !!note.deleted_time, onClick: () => onEdit(note) }, react.createElement(icon, { name, accessibilityLabel: null })))));
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
		models: (tags, folders, connect, readOnly) => {
			tagModel = tags;
			folderModel = folders;
			permissionCheck = readOnly;
			if (!connectedList) connectedList = connect(state => ({ permissionContext: { userId: state.settings['sync.userId'], shareService: state.shareService } }))(NoteCards);
		},
		metadata,
		list: (react, item, model, icon, markdown, props) => react.createElement(connectedList || NoteCards, { react, item, model, icon, markdown, ...props }),
	};
})();