import { registerPreferences, unregisterPreferences } from "./preferences";
import { MenuManager } from "./menu";
import { setHttpIdentity } from "./http";

let menuManager: MenuManager | null = null;

export function install() {
  Zotero.debug("ReferenceValidator: install");
}

export async function startup({ id, version, resourceURI, rootURI }: any) {
  Zotero.debug("ReferenceValidator: startup");

  await Zotero.uiReadyPromise;

  let mailto: string | undefined;
  try {
    mailto =
      Zotero.Prefs.get(
        "extensions.zotero.reference-validator.sources.crossref.email",
      ) || undefined;
  } catch (e) {
    mailto = undefined;
  }
  setHttpIdentity({ version: version || "0.1.0", mailto });

  registerPreferences(rootURI);

  menuManager = new MenuManager();
  menuManager.init();

  const win = Zotero.getMainWindow();
  if (win) {
    menuManager.addToWindow(win);
  }
}

export function shutdown(reason: any) {
  Zotero.debug("ReferenceValidator: shutdown");

  const win = Zotero.getMainWindow();
  if (win) {
    menuManager?.removeFromWindow(win);
  }

  menuManager?.shutdown();
  menuManager = null;
  unregisterPreferences();
}

export function uninstall(reason: any) {
  Zotero.debug("ReferenceValidator: uninstall");
}
