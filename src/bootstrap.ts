import { registerPreferences, unregisterPreferences } from "./preferences";
import { MenuManager } from "./menu";

let menuManager: MenuManager | null = null;
const PLUGIN_ID = "reference-validator@example.com";

export function install() {
  Zotero.debug("ReferenceValidator: install");
}

export function startup({ id, version, resourceURI, rootURI }: any) {
  Zotero.debug("ReferenceValidator: startup");
  registerPreferences();

  menuManager = new MenuManager();
  menuManager.init();

  const windows = Zotero.getMainWindows();
  for (const win of windows) {
    if (win.ZoteroPane) {
      menuManager.addToWindow(win);
    }
  }

  Zotero.WindowWatcher.registerCallback(PLUGIN_ID, (win: any, type: string) => {
    if (type === "load" && win.ZoteroPane) {
      menuManager?.addToWindow(win);
    }
  });
}

export function shutdown(reason: any) {
  Zotero.debug("ReferenceValidator: shutdown");

  Zotero.WindowWatcher.deregisterCallback(PLUGIN_ID);

  const windows = Zotero.getMainWindows();
  for (const win of windows) {
    if (win.ZoteroPane) {
      menuManager?.removeFromWindow(win);
    }
  }

  menuManager?.shutdown();
  menuManager = null;
  unregisterPreferences();
}

export function uninstall(reason: any) {
  Zotero.debug("ReferenceValidator: uninstall");
}
