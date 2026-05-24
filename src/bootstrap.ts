// ASSUMPTION: Standard bootstrap lifecycle methods for Zotero 10 (install, startup, shutdown, uninstall)
// Verified via windingwind/zotero-plugin-template structure which applies to 7/8/10.

import { registerPreferences } from './preferences';
import { registerMenu } from './menu';

export function install() {
    Zotero.debug("ReferenceValidator: install");
}

export function startup({ id, version, resourceURI, rootURI }: any) {
    Zotero.debug("ReferenceValidator: startup");
    registerPreferences();
    registerMenu();
}

export function shutdown(reason: any) {
    Zotero.debug("ReferenceValidator: shutdown");
    // Cleanup logic goes here
}

export function uninstall(reason: any) {
    Zotero.debug("ReferenceValidator: uninstall");
}
