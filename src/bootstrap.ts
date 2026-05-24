// ASSUMPTION: Standard bootstrap lifecycle methods for Zotero 10 (install, startup, shutdown, uninstall)
// Verified via windingwind/zotero-plugin-template structure which applies to 7/8/10.

export function install() {
    Zotero.debug("ReferenceValidator: install");
}

export function startup({ id, version, resourceURI, rootURI }: any) {
    Zotero.debug("ReferenceValidator: startup");
    // Initialization logic goes here
}

export function shutdown(reason: any) {
    Zotero.debug("ReferenceValidator: shutdown");
    // Cleanup logic goes here
}

export function uninstall(reason: any) {
    Zotero.debug("ReferenceValidator: uninstall");
}
