import { GlobalReferenceLibrary, LibraryEntry } from "./library";

export function showLibraryWindow(
  library: GlobalReferenceLibrary,
  onRevalidate: (entry: LibraryEntry) => Promise<void>,
) {
  if (typeof Zotero === "undefined") return;

  const win = Zotero.getMainWindow();
  if (!win) return;

  const features =
    "chrome,titlebar,toolbar,centerscreen,resizable,scrollbars,width=1000,height=700";
  const libWin = win.openDialog(
    "about:blank",
    "zotero-reference-validator-library",
    features,
  );
  if (!libWin) return;

  libWin.addEventListener(
    "load",
    () => {
      const doc = libWin.document;
      doc.title = "Validated References Library";

      const container = doc.createElement("div");
      container.style.padding = "20px";
      container.style.fontFamily = "system-ui, -apple-system, sans-serif";

      const header = doc.createElement("div");
      header.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px";

      const title = doc.createElement("h1");
      title.style.margin = "0";
      title.textContent = `Validated References Library (${library.size} entries)`;
      header.appendChild(title);
      container.appendChild(header);

      const table = doc.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.marginTop = "12px";
      table.style.fontSize = "13px";

      const thead = doc.createElement("thead");
      const headerRow = doc.createElement("tr");
      headerRow.style.cssText = "border-bottom:2px solid #ccc;text-align:left";
      for (const label of [
        "Status",
        "Title",
        "Identifier",
        "Validated",
        "Uses",
        "Papers",
        "Actions",
      ]) {
        const th = doc.createElement("th");
        th.style.padding = "6px 8px";
        th.textContent = label;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = doc.createElement("tbody");
      const entries = library.getAll();

      for (const entry of entries) {
        const tr = doc.createElement("tr");
        tr.style.borderBottom = "1px solid #eee";

        let statusColor = "#999";
        if (entry.validationResult.status === "VERIFIED") statusColor = "green";
        if (entry.validationResult.status === "VERIFIED_WITH_CORRECTIONS")
          statusColor = "orange";
        if (entry.validationResult.status === "FLAGGED") statusColor = "red";

        const tdStatus = doc.createElement("td");
        tdStatus.style.cssText = "padding:6px 8px;font-weight:bold";
        tdStatus.style.color = statusColor;
        tdStatus.textContent = entry.validationResult.status;
        tr.appendChild(tdStatus);

        const tdTitle = doc.createElement("td");
        tdTitle.style.cssText =
          "padding:6px 8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        tdTitle.textContent = entry.title || entry.canonicalRecord.title || "";
        tr.appendChild(tdTitle);

        const tdId = doc.createElement("td");
        tdId.style.cssText = "padding:6px 8px;font-size:11px;color:#666";
        tdId.textContent = entry.identifierKey;
        tr.appendChild(tdId);

        const tdDate = doc.createElement("td");
        tdDate.style.padding = "6px 8px";
        tdDate.textContent = new Date(entry.validatedAt).toLocaleDateString();
        tr.appendChild(tdDate);

        const tdUses = doc.createElement("td");
        tdUses.style.cssText = "padding:6px 8px;text-align:center";
        tdUses.textContent = String(entry.usageCount);
        tr.appendChild(tdUses);

        const tdPapers = doc.createElement("td");
        tdPapers.style.cssText = "padding:6px 8px;font-size:11px";
        const uniqueCollections = [
          ...new Set(entry.usages.map((u) => u.collectionName).filter(Boolean)),
        ];
        tdPapers.textContent =
          uniqueCollections.length > 0 ? uniqueCollections.join(", ") : "--";
        tr.appendChild(tdPapers);

        const tdActions = doc.createElement("td");
        tdActions.style.padding = "6px 8px";

        const revalidateBtn = doc.createElement("button");
        revalidateBtn.textContent = "Revalidate";
        revalidateBtn.style.cssText = "margin-right:6px;cursor:pointer";
        revalidateBtn.addEventListener("click", async () => {
          revalidateBtn.disabled = true;
          revalidateBtn.textContent = "...";
          await onRevalidate(entry);
          tdStatus.textContent = entry.validationResult.status;
          tdDate.textContent = new Date(entry.validatedAt).toLocaleDateString();
          revalidateBtn.textContent = "Revalidate";
          revalidateBtn.disabled = false;
        });
        tdActions.appendChild(revalidateBtn);

        const removeBtn = doc.createElement("button");
        removeBtn.textContent = "Remove";
        removeBtn.style.cursor = "pointer";
        removeBtn.addEventListener("click", () => {
          library.remove(entry.identifierKey);
          tr.remove();
          title.textContent = `Validated References Library (${library.size} entries)`;
        });
        tdActions.appendChild(removeBtn);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      container.appendChild(table);

      if (entries.length === 0) {
        const empty = doc.createElement("p");
        empty.style.cssText = "text-align:center;color:#999;padding:40px";
        empty.textContent =
          "No validated references yet. Validate items to build your library.";
        container.appendChild(empty);
      }

      doc.body.appendChild(container);
    },
    { once: true },
  );
}
