// ASSUMPTION: Zotero 10 UI methods
// Using basic browser window creation for the results UI as standard in Zotero extensions.

export function showResultsWindow(results: Array<{ item: any; result: any }>) {
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

  // We populate the DOM dynamically after load
  resultWin.addEventListener("load", () => {
    const doc = resultWin.document;
    doc.title = "Validation Results";

    const container = doc.createElement("div");
    container.style.padding = "20px";
    container.style.fontFamily = "system-ui, -apple-system, sans-serif";

    const title = doc.createElement("h1");
    title.textContent = "Validation Results";
    container.appendChild(title);

    const table = doc.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginTop = "20px";

    const thead = doc.createElement("thead");
    const headerRow = doc.createElement("tr");
    headerRow.style.cssText =
      "border-bottom: 2px solid #ccc; text-align: left;";
    for (const label of [
      "Status",
      "Title",
      "Matches",
      "Corrections",
      "Details",
    ]) {
      const th = doc.createElement("th");
      th.style.padding = "8px";
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    for (const { item, result } of results) {
      const tr = doc.createElement("tr");
      tr.style.borderBottom = "1px solid #eee";

      let statusColor = "#999";
      if (result.status === "VERIFIED") statusColor = "green";
      if (result.status === "VERIFIED_WITH_CORRECTIONS") statusColor = "orange";
      if (result.status === "FLAGGED") statusColor = "red";

      const itemTitle = item.getField ? item.getField("title") : "Unknown";

      const tdStatus = doc.createElement("td");
      tdStatus.style.cssText = "padding: 8px; font-weight: bold;";
      tdStatus.style.color = statusColor;
      tdStatus.textContent = result.status;
      tr.appendChild(tdStatus);

      const tdTitle = doc.createElement("td");
      tdTitle.style.padding = "8px";
      tdTitle.textContent = itemTitle;
      tr.appendChild(tdTitle);

      const tdMatches = doc.createElement("td");
      tdMatches.style.padding = "8px";
      tdMatches.textContent = String(result.primaryMatches);
      tr.appendChild(tdMatches);

      const tdCorrections = doc.createElement("td");
      tdCorrections.style.padding = "8px";
      tdCorrections.textContent = `${result.corrections.length} available`;
      tr.appendChild(tdCorrections);

      const tdDetails = doc.createElement("td");
      tdDetails.style.padding = "8px";
      tdDetails.style.fontSize = "0.85em";
      tdDetails.style.color = "#666";
      tdDetails.textContent = result.diagnostic || "";
      tr.appendChild(tdDetails);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    doc.body.appendChild(container);
  });
}
