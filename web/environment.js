// Change to enable or disable React Native dev mode.
window.__DEV__ = false;

// Silences errors related to generated code.
window.exports = {};

// Expo libraries expect window.process variable to be defined.
window.process = {
	platform: 'web',
	env: {
		EXPO_OS: 'web',
	},
};

if (__DEV__) {
	document.title = 'Joplin DEV';
}
