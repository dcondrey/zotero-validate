import { FieldDiff } from "./types";
import { ClassificationResult } from "./classifier";

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "#2e7d32",
  VERIFIED_WITH_CORRECTIONS: "#e65100",
  FLAGGED: "#c62828",
};

const STATUS_LABELS: Record<string, string> = {
  VERIFIED: "Verified",
  VERIFIED_WITH_CORRECTIONS: "Corrections",
  FLAGGED: "Flagged",
};

export function fieldToZoteroField(field: string): string | null {
  const map: Record<string, string> = {
    title: "title",
    year: "date",
    volume: "volume",
    issue: "issue",
    journal: "publicationTitle",
    pages: "pages",
    publisher: "publisher",
  };
  return map[field] || null;
}

// The string value to write for a correction, or null if it cannot be applied
// (no source value, or a field with no Zotero equivalent such as authors).
export function correctionValueFor(correction: FieldDiff): string | null {
  if (correction.sourceValue === undefined || correction.sourceValue === null) {
    return null;
  }
  if (!fieldToZoteroField(correction.field)) return null;
  return String(correction.sourceValue);
}

// Apply every applicable correction to an item with a single saveTx, so a
// multi-field fix is one atomic write rather than one transaction per field.
// A field the item type rejects is skipped without aborting the others.
// Returns the number of fields actually written (0 means nothing was saved).
export async function applyCorrections(
  item: any,
  corrections: FieldDiff[],
): Promise<number> {
  let count = 0;
  for (const correction of corrections) {
    const zField = fieldToZoteroField(correction.field);
    const value = correctionValueFor(correction);
    if (!zField || value === null) continue;
    try {
      item.setField(zField, value);
      count++;
    } catch {
      // Item type does not accept this field; skip it.
    }
  }
  if (count === 0) return 0;
  try {
    await item.saveTx();
    return count;
  } catch {
    return 0;
  }
}

function injectStyles(doc: Document) {
  const style = doc.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; color: #222; }
    .container { max-width: 960px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .summary-bar { display: flex; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; }
    .summary-stat { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .summary-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .summary-count { font-weight: 600; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
    .toolbar button { padding: 5px 12px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
    .toolbar button:hover { background: #f0f0f0; }
    .toolbar button:disabled { opacity: 0.5; cursor: default; }
    .result-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
    .result-header { display: flex; align-items: center; padding: 10px 14px; cursor: pointer; gap: 10px; }
    .result-header:hover { background: #f8f8f8; }
    .status-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; color: #fff; white-space: nowrap; }
    .result-title { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result-meta { font-size: 11px; color: #888; white-space: nowrap; }
    .expand-icon { font-size: 11px; color: #999; transition: transform 0.15s; }
    .expand-icon.open { transform: rotate(90deg); }
    .result-details { display: none; padding: 0 14px 12px; border-top: 1px solid #f0f0f0; }
    .result-details.open { display: block; }
    .detail-section { margin-top: 10px; }
    .detail-label { font-size: 11px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .correction-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
    .correction-field { font-weight: 600; min-width: 70px; }
    .correction-arrow { color: #999; }
    .correction-old { color: #c62828; text-decoration: line-through; }
    .correction-new { color: #2e7d32; }
    .apply-btn { font-size: 11px; padding: 2px 8px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; }
    .apply-btn:hover { background: #e8f5e9; border-color: #4caf50; }
    .apply-btn.applied { background: #e8f5e9; border-color: #4caf50; color: #2e7d32; cursor: default; }
    .diagnostic { font-size: 12px; color: #666; margin-top: 6px; line-height: 1.4; }
    .empty-state { text-align: center; color: #999; padding: 60px 20px; }
  `;
  doc.head.appendChild(style);
}

export function showResultsWindow(
  results: Array<{ item: any; result: ClassificationResult }>,
) {
  if (typeof Zotero === "undefined") return;

  const win = Zotero.getMainWindow();
  if (!win) return;

  const features =
    "chrome,titlebar,toolbar,centerscreen,resizable,scrollbars,width=800,height=600";
  const resultWin = win.openDialog(
    "about:blank",
    "zotero-reference-validator-results",
    features,
  );

  if (!resultWin) return;

  resultWin.addEventListener("load", () => {
    const doc = resultWin.document;
    doc.title = "Validation Results";
    injectStyles(doc);

    const container = doc.createElement("div");
    container.className = "container";

    const title = doc.createElement("h1");
    title.textContent = `Validation Results (${results.length} items)`;
    container.appendChild(title);

    // Summary bar
    const verified = results.filter(
      (r) => r.result.status === "VERIFIED",
    ).length;
    const corrected = results.filter(
      (r) => r.result.status === "VERIFIED_WITH_CORRECTIONS",
    ).length;
    const flagged = results.filter((r) => r.result.status === "FLAGGED").length;

    const summaryBar = doc.createElement("div");
    summaryBar.className = "summary-bar";
    for (const [label, count, color] of [
      ["Verified", verified, STATUS_COLORS.VERIFIED],
      ["With Corrections", corrected, STATUS_COLORS.VERIFIED_WITH_CORRECTIONS],
      ["Flagged", flagged, STATUS_COLORS.FLAGGED],
    ] as [string, number, string][]) {
      const stat = doc.createElement("div");
      stat.className = "summary-stat";
      const dot = doc.createElement("span");
      dot.className = "summary-dot";
      dot.style.background = color;
      const text = doc.createElement("span");
      const countEl = doc.createElement("span");
      countEl.className = "summary-count";
      countEl.textContent = String(count);
      text.appendChild(countEl);
      text.appendChild(doc.createTextNode(` ${label}`));
      stat.appendChild(dot);
      stat.appendChild(text);
      summaryBar.appendChild(stat);
    }
    container.appendChild(summaryBar);

    // Toolbar
    const correctableResults = results.filter(
      (r) => r.result.corrections.length > 0,
    );
    const toolbar = doc.createElement("div");
    toolbar.className = "toolbar";

    const applyAllBtn = doc.createElement("button");
    applyAllBtn.textContent = `Apply All Corrections (${correctableResults.length})`;
    applyAllBtn.disabled = correctableResults.length === 0;
    toolbar.appendChild(applyAllBtn);

    const copyBtn = doc.createElement("button");
    copyBtn.textContent = "Copy Summary";
    toolbar.appendChild(copyBtn);

    container.appendChild(toolbar);

    // Result cards
    const cardsContainer = doc.createElement("div");
    const applyButtons: HTMLButtonElement[] = [];

    for (const { item, result } of results) {
      const card = doc.createElement("div");
      card.className = "result-card";

      const header = doc.createElement("div");
      header.className = "result-header";

      const expandIcon = doc.createElement("span");
      expandIcon.className = "expand-icon";
      expandIcon.textContent = "\u25B6";
      header.appendChild(expandIcon);

      const badge = doc.createElement("span");
      badge.className = "status-badge";
      badge.style.background = STATUS_COLORS[result.status] || "#999";
      badge.textContent = STATUS_LABELS[result.status] || result.status;
      header.appendChild(badge);

      const titleEl = doc.createElement("span");
      titleEl.className = "result-title";
      titleEl.textContent = item.getField ? item.getField("title") : "Unknown";
      header.appendChild(titleEl);

      const meta = doc.createElement("span");
      meta.className = "result-meta";
      const parts: string[] = [];
      parts.push(
        `${result.primaryMatches} match${result.primaryMatches !== 1 ? "es" : ""}`,
      );
      if (result.corrections.length > 0) {
        parts.push(
          `${result.corrections.length} correction${result.corrections.length !== 1 ? "s" : ""}`,
        );
      }
      meta.textContent = parts.join(" \u00B7 ");
      header.appendChild(meta);

      card.appendChild(header);

      // Details panel
      const details = doc.createElement("div");
      details.className = "result-details";

      // Corrections
      if (result.corrections.length > 0) {
        const corrSection = doc.createElement("div");
        corrSection.className = "detail-section";
        const corrLabel = doc.createElement("div");
        corrLabel.className = "detail-label";
        corrLabel.textContent = "Corrections";
        corrSection.appendChild(corrLabel);

        for (const correction of result.corrections) {
          const row = doc.createElement("div");
          row.className = "correction-row";

          const fieldEl = doc.createElement("span");
          fieldEl.className = "correction-field";
          fieldEl.textContent = correction.field;
          row.appendChild(fieldEl);

          if (correction.zoteroValue) {
            const oldEl = doc.createElement("span");
            oldEl.className = "correction-old";
            oldEl.textContent = String(correction.zoteroValue);
            row.appendChild(oldEl);
          }

          const arrow = doc.createElement("span");
          arrow.className = "correction-arrow";
          arrow.textContent = "\u2192";
          row.appendChild(arrow);

          if (correction.sourceValue) {
            const newEl = doc.createElement("span");
            newEl.className = "correction-new";
            newEl.textContent = String(correction.sourceValue);
            row.appendChild(newEl);
          }

          if (correction.sourceValue && fieldToZoteroField(correction.field)) {
            const btn = doc.createElement("button") as HTMLButtonElement;
            btn.className = "apply-btn";
            btn.textContent = "Apply";
            btn.addEventListener("click", async () => {
              const applied = await applyCorrections(item, [correction]);
              if (applied > 0) {
                btn.textContent = "Applied";
                btn.classList.add("applied");
                btn.disabled = true;
              }
            });
            applyButtons.push(btn);
            row.appendChild(btn);
          }

          corrSection.appendChild(row);
        }
        details.appendChild(corrSection);
      }

      // Diagnostic
      if (result.diagnostic) {
        const diagSection = doc.createElement("div");
        diagSection.className = "detail-section";
        const diagLabel = doc.createElement("div");
        diagLabel.className = "detail-label";
        diagLabel.textContent = "Diagnostic";
        diagSection.appendChild(diagLabel);
        const diagText = doc.createElement("div");
        diagText.className = "diagnostic";
        diagText.textContent = result.diagnostic;
        diagSection.appendChild(diagText);
        details.appendChild(diagSection);
      }

      card.appendChild(details);

      // Toggle expand
      header.addEventListener("click", () => {
        const isOpen = details.classList.toggle("open");
        expandIcon.classList.toggle("open", isOpen);
      });

      cardsContainer.appendChild(card);
    }

    container.appendChild(cardsContainer);

    if (results.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No items were validated.";
      container.appendChild(empty);
    }

    // Apply All handler
    applyAllBtn.addEventListener("click", async () => {
      applyAllBtn.disabled = true;
      applyAllBtn.textContent = "Applying...";
      let applied = 0;
      for (const { item, result } of correctableResults) {
        applied += await applyCorrections(item, result.corrections);
      }
      applyAllBtn.textContent = `Applied ${applied} correction${applied !== 1 ? "s" : ""}`;
      for (const btn of applyButtons) {
        if (!btn.disabled) {
          btn.textContent = "Applied";
          btn.classList.add("applied");
          btn.disabled = true;
        }
      }
    });

    // Copy summary handler
    copyBtn.addEventListener("click", () => {
      const lines = results.map(({ item, result }) => {
        const t = item.getField ? item.getField("title") : "Unknown";
        return `${result.status}\t${t}\t${result.primaryMatches} matches\t${result.corrections.length} corrections`;
      });
      const header = `Status\tTitle\tMatches\tCorrections`;
      const text = [header, ...lines].join("\n");
      resultWin.navigator.clipboard.writeText(text).catch(() => {
        Zotero.debug("ReferenceValidator: Clipboard write failed");
      });
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy Summary";
      }, 2000);
    });

    doc.body.appendChild(container);
  });
}
