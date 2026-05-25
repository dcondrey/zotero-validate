import { registerPreferences } from "./preferences";
import { MenuManager } from "./menu";

let menuManager: MenuManager | null = null;
let windowListenerID: string | null = null;

export function install() {
  Zotero.debug("ReferenceValidator: install");
}

export function startup({ id, version, resourceURI, rootURI }: any) {
  Zotero.debug("ReferenceValidator: startup");
  registerPreferences();

  menuManager = new MenuManager();

  const windows = Zotero.getMainWindows();
  for (const win of windows) {
    menuManager.addToWindow(win);
  }

  windowListenerID = Zotero.WindowWatcher.registerCallback(
    (win: any, type: string) => {
      if (type === "load") {
        menuManager?.addToWindow(win);
      }
    },
  );
}

export function shutdown(reason: any) {
  Zotero.debug("ReferenceValidator: shutdown");

  if (windowListenerID) {
    Zotero.WindowWatcher.deregisterCallback(windowListenerID);
    windowListenerID = null;
  }

  const windows = Zotero.getMainWindows();
  for (const win of windows) {
    menuManager?.removeFromWindow(win);
  }
  menuManager = null;
}

export function uninstall(reason: any) {
  Zotero.debug("ReferenceValidator: uninstall");
}
