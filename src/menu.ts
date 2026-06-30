import { Orchestrator } from "./orchestrator";
import { showResultsWindow } from "./ui";
import { showLibraryWindow, syncLibraryCollection } from "./library-ui";

const PREF_BRANCH = "extensions.zotero.reference-validator.";
const PREF_KEYS = [
  "sources.crossref.enabled",
  "sources.crossref.email",
  "sources.openalex.enabled",
  "sources.openalex.email",
  "sources.semanticscholar.enabled",
  "sources.semanticscholar.key",
  "sources.arxiv.enabled",
  "sources.pubmed.enabled",
  "sources.dblp.enabled",
  "sources.openreview.enabled",
  "sources.aclanthology.enabled",
  "sources.openlibrary.enabled",
  "sources.datacite.enabled",
  "sources.europepmc.enabled",
  "sources.orcid.enabled",
  "sources.opencitations.enabled",
  "sources.unpaywall.enabled",
  "sources.iascholar.enabled",
  "sources.googlescholar.enabled",
  "behavior.min_sources",
  "behavior.use_llm",
  "behavior.freshness_days",
  "behavior.timeout_sec",
  "behavior.max_concurrent",
  "llm.openai.key",
  "llm.openai.model",
  "llm.anthropic.key",
  "llm.anthropic.model",
  "llm.gemini.key",
  "llm.gemini.model",
];

export class MenuManager {
  private orchestrator: Orchestrator;

  constructor() {
    this.orchestrator = new Orchestrator(() => {
      const prefs: Record<string, any> = {};
      for (const key of PREF_KEYS) {
        prefs[key] = Zotero.Prefs.get(PREF_BRANCH + key);
      }
      return prefs;
    });
  }

  async init(): Promise<void> {
    await this.orchestrator.init();
  }

  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
  }

  getOrchestrator(): Orchestrator {
    return this.orchestrator;
  }

  addToWindow(win: any) {
    const doc = win.document;
    const menuPopup = doc.getElementById("zotero-itemmenu");
    if (
      !menuPopup ||
      doc.getElementById("zotero-reference-validator-menu-item")
    )
      return;

    const menuItem = doc.createXULElement("menuitem");
    menuItem.setAttribute("id", "zotero-reference-validator-menu-item");
    menuItem.setAttribute("label", "Validate Reference");
    menuItem.addEventListener("command", async () => {
      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      if (items.length > 0) {
        Zotero.debug(
          "Validate Reference invoked for " + items.length + " items",
        );
        this.runValidation(items, false);
      }
    });
    menuPopup.appendChild(menuItem);

    const forceMenuItem = doc.createXULElement("menuitem");
    forceMenuItem.setAttribute(
      "id",
      "zotero-reference-validator-force-menu-item",
    );
    forceMenuItem.setAttribute("label", "Validate Reference (Force Re-check)");
    forceMenuItem.addEventListener("command", async () => {
      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      if (items.length > 0) {
        Zotero.debug("Force Validate Reference invoked");
        this.runValidation(items, true);
      }
    });
    menuPopup.appendChild(forceMenuItem);

    const libraryMenuItem = doc.createXULElement("menuitem");
    libraryMenuItem.setAttribute(
      "id",
      "zotero-reference-validator-library-menu-item",
    );
    libraryMenuItem.setAttribute("label", "View Validated References Library");
    libraryMenuItem.addEventListener("command", () => {
      const library = this.orchestrator.getLibrary();
      showLibraryWindow(library);
    });
    menuPopup.appendChild(libraryMenuItem);

    // Collection context menu
    const collectionMenu = doc.getElementById("zotero-collectionmenu");
    if (
      collectionMenu &&
      !doc.getElementById("zotero-reference-validator-collection-menu-item")
    ) {
      const collMenuItem = doc.createXULElement("menuitem");
      collMenuItem.setAttribute(
        "id",
        "zotero-reference-validator-collection-menu-item",
      );
      collMenuItem.setAttribute(
        "label",
        "Validate All References in Collection",
      );
      collMenuItem.addEventListener("command", async () => {
        const zp = Zotero.getActiveZoteroPane();
        const collection = zp.getSelectedCollection();
        if (!collection) return;
        const items = collection.getChildItems(false);
        const validatable = items.filter((item: any) => {
          const hasStrongId =
            item.getField("DOI") ||
            item.getField("ISBN") ||
            item.getField("extra")?.includes("PMID");
          const hasTitleAndAuthor =
            item.getField("title") && item.getCreators().length > 0;
          return hasStrongId || hasTitleAndAuthor;
        });
        if (validatable.length > 0) {
          this.runValidation(validatable, false);
        }
      });
      collectionMenu.appendChild(collMenuItem);
    }

    menuPopup.addEventListener("popupshowing", () => {
      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      const canValidate =
        items.length > 0 &&
        items.every((item: any) => {
          const hasStrongId =
            item.getField("DOI") ||
            item.getField("ISBN") ||
            item.getField("extra")?.includes("PMID");
          const hasTitleAndAuthor =
            item.getField("title") && item.getCreators().length > 0;
          return hasStrongId || hasTitleAndAuthor;
        });

      if (canValidate) {
        menuItem.removeAttribute("disabled");
        menuItem.removeAttribute("tooltiptext");
        forceMenuItem.removeAttribute("disabled");
      } else {
        menuItem.setAttribute("disabled", "true");
        menuItem.setAttribute(
          "tooltiptext",
          "Minimum metadata (DOI/ISBN or Title+Author) required.",
        );
        forceMenuItem.setAttribute("disabled", "true");
      }
    });
  }

  removeFromWindow(win: any) {
    const doc = win.document;
    doc.getElementById("zotero-reference-validator-menu-item")?.remove();
    doc.getElementById("zotero-reference-validator-force-menu-item")?.remove();
    doc
      .getElementById("zotero-reference-validator-library-menu-item")
      ?.remove();
    doc
      .getElementById("zotero-reference-validator-collection-menu-item")
      ?.remove();
  }

  private async runValidation(items: any[], force: boolean) {
    const pw = new Zotero.ProgressWindow({ closeOnClick: false });
    pw.changeHeadline("Validating References...");
    const progress = new pw.ItemProgress(
      "chrome://zotero/skin/tick.png",
      `0 / ${items.length} items`,
    );
    progress.setProgress(0);
    pw.show();

    const batchSize = 10;
    const results: Array<{ item: any; result: any }> = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map(async (item) => ({
          item,
          result: await this.orchestrator.validateItem(item, force),
        })),
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          results.push(outcome.value);
        } else {
          Zotero.debug(
            `ReferenceValidator: Item validation failed - ${outcome.reason}`,
          );
        }
      }

      const pct = Math.round(
        (Math.min(i + batchSize, items.length) / items.length) * 100,
      );
      progress.setProgress(pct);
      progress.setText(`${results.length} / ${items.length} items`);
    }

    progress.setProgress(100);
    progress.setText(`Done: ${results.length} items validated`);
    pw.startCloseTimer(4000);
    showResultsWindow(results);
    syncLibraryCollection(this.orchestrator.getLibrary());
  }
}
