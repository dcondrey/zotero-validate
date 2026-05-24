// ASSUMPTION: Zotero 10 PreferencePane API.
// Based on Zotero 7/8 preference pane API documented at zotero.org/support/dev/zotero_7_for_developers

export function registerPreferences() {
    if (typeof Zotero === 'undefined' || !Zotero.PreferencePanes) {
        return; // Avoid crashing in test environment
    }

    Zotero.PreferencePanes.register({
        pluginID: 'reference-validator@example.com',
        src: 'chrome://zotero-reference-validator/content/preferences.xhtml',
        scripts: ['chrome://zotero-reference-validator/content/preferences.js'],
        stylesheets: ['chrome://zotero-reference-validator/content/preferences.css'],
        defaultXUL: true
    });
}
