// ASSUMPTION: Zotero 10 PreferencePane API.
// Based on Zotero 7/8 preference pane API documented at zotero.org/support/dev/zotero_7_for_developers

export function registerPreferences(rootURI: string) {
  if (typeof Zotero === "undefined" || !Zotero.PreferencePanes) {
    return; // Avoid crashing in test environment
  }

  Zotero.PreferencePanes.register({
    pluginID: "reference-validator@example.com",
    src: rootURI + "preferences.xhtml",
    scripts: [rootURI + "preferences.js"],
    stylesheets: [rootURI + "preferences.css"],
  });
}

export function unregisterPreferences() {
  if (typeof Zotero === "undefined" || !Zotero.PreferencePanes) {
    return;
  }
  Zotero.PreferencePanes.unregister("reference-validator@example.com");
}
