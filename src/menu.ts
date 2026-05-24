import { Orchestrator } from './orchestrator';
import { showResultsWindow } from './ui';

export function registerMenu() {
    if (typeof Zotero === 'undefined') return;

    // ASSUMPTION: Zotero 10 menu registration. Using Zotero.getMainWindow().document
    const win = Zotero.getMainWindow();
    if (!win) return;

    const doc = win.document;
    const menuPopup = doc.getElementById('zotero-itemmenu');
    if (!menuPopup) return;

    const orchestrator = new Orchestrator(() => {
        // ASSUMPTION: Preferences getter
        return {
            'sources.crossref.enabled': Zotero.Prefs.get('extensions.zotero.reference-validator.sources.crossref.enabled'),
            'sources.openalex.enabled': Zotero.Prefs.get('extensions.zotero.reference-validator.sources.openalex.enabled'),
            'behavior.min_sources': Zotero.Prefs.get('extensions.zotero.reference-validator.behavior.min_sources')
        };
    });

    const runValidation = async (items: any[], force: boolean) => {
        const results = [];
        for (const item of items) {
            const result = await orchestrator.validateItem(item, force);
            results.push({ item, result });
        }
        showResultsWindow(results);
    };

    const menuItem = doc.createXULElement('menuitem');
    menuItem.setAttribute('id', 'zotero-reference-validator-menu-item');
    menuItem.setAttribute('label', 'Validate Reference');
    
    // Disable if not enough metadata
    menuItem.addEventListener('command', async (e: Event) => {
        const items = Zotero.getActiveZoteroPane().getSelectedItems();
        if (items.length > 0) {
            Zotero.debug('Validate Reference invoked for ' + items.length + ' items');
            runValidation(items, false);
        }
    });

    menuPopup.appendChild(menuItem);

    // Force Validate Menu Item
    const forceMenuItem = doc.createXULElement('menuitem');
    forceMenuItem.setAttribute('id', 'zotero-reference-validator-force-menu-item');
    forceMenuItem.setAttribute('label', 'Validate Reference (Force Re-check)');
    
    forceMenuItem.addEventListener('command', async (e: Event) => {
        const items = Zotero.getActiveZoteroPane().getSelectedItems();
        if (items.length > 0) {
            Zotero.debug('Force Validate Reference invoked');
            runValidation(items, true);
        }
    });

    menuPopup.appendChild(forceMenuItem);

    // Update disabled state when menu opens
    menuPopup.addEventListener('popupshowing', () => {
        const items = Zotero.getActiveZoteroPane().getSelectedItems();
        const canValidate = items.every((item: any) => {
            const hasStrongId = item.getField('DOI') || item.getField('ISBN') || item.getField('extra')?.includes('PMID');
            const hasTitleAndAuthor = item.getField('title') && item.getCreators().length > 0;
            return hasStrongId || hasTitleAndAuthor;
        });

        if (canValidate) {
            menuItem.removeAttribute('disabled');
            menuItem.removeAttribute('tooltiptext');
            forceMenuItem.removeAttribute('disabled');
        } else {
            menuItem.setAttribute('disabled', 'true');
            menuItem.setAttribute('tooltiptext', 'Minimum metadata (DOI/ISBN or Title+Author) required.');
            forceMenuItem.setAttribute('disabled', 'true');
        }
    });
}
