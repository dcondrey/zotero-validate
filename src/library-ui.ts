import { GlobalReferenceLibrary } from "./library";

const COLLECTION_NAME = "Validated References";

// Given the item IDs that should be in the managed collection and the IDs
// currently in it, return which to add and which to remove. Pure set logic,
// extracted so the collection-mutation decision can be tested in isolation.
export function computeCollectionDelta(
  trackedItemIds: Iterable<number>,
  existingItemIds: number[],
): { toAdd: number[]; toRemove: number[] } {
  const tracked = new Set(trackedItemIds);
  const existing = new Set(existingItemIds);
  return {
    toAdd: [...tracked].filter((id) => !existing.has(id)),
    toRemove: existingItemIds.filter((id) => !tracked.has(id)),
  };
}

async function getOrCreateCollection(): Promise<any> {
  const collections = Zotero.Collections.getByLibrary(
    Zotero.Libraries.userLibraryID,
  );
  for (const col of collections) {
    if (col.name === COLLECTION_NAME) {
      return col;
    }
  }

  const col = new Zotero.Collection();
  col.name = COLLECTION_NAME;
  col.libraryID = Zotero.Libraries.userLibraryID;
  await col.saveTx();
  return col;
}

export async function syncLibraryCollection(
  library: GlobalReferenceLibrary,
): Promise<void> {
  const collection = await getOrCreateCollection();
  const entries = library.getAll();

  const existingItemIDs = collection.getChildItems(true);
  const trackedItemIDs = new Set<number>();

  for (const entry of entries) {
    for (const usage of entry.usages) {
      if (usage.itemId) {
        trackedItemIDs.add(usage.itemId);
      }
    }
  }

  const { toAdd, toRemove } = computeCollectionDelta(
    trackedItemIDs,
    existingItemIDs,
  );

  // Add items that should be in the collection
  for (const itemId of toAdd) {
    const item = await Zotero.Items.getAsync(itemId);
    if (item) {
      await collection.addItem(item.id);
    }
  }

  // Remove items no longer validated
  for (const itemId of toRemove) {
    await collection.removeItem(itemId);
  }
}

export function showLibraryWindow(library: GlobalReferenceLibrary) {
  syncLibraryCollection(library).then(() => {
    // Select the collection in the tree
    const zp = Zotero.getActiveZoteroPane();
    if (!zp) return;

    const collections = Zotero.Collections.getByLibrary(
      Zotero.Libraries.userLibraryID,
    );
    for (const col of collections) {
      if (col.name === COLLECTION_NAME) {
        zp.collectionsView.selectCollection(col.id);
        break;
      }
    }
  });
}
