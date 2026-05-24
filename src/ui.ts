// ASSUMPTION: Zotero 10 UI methods
// Using basic browser window creation for the results UI as standard in Zotero extensions.

export function showResultsWindow(results: Array<{ item: any, result: any }>) {
    if (typeof Zotero === 'undefined') return;

    const win = Zotero.getMainWindow();
    if (!win) return;

    const features = "chrome,titlebar,toolbar,centerscreen,resizable,scrollbars,width=800,height=600";
    const resultWin = win.openDialog('about:blank', 'zotero-reference-validator-results', features);
    
    // We populate the DOM dynamically after load
    resultWin.addEventListener('load', () => {
        const doc = resultWin.document;
        doc.title = "Validation Results";

        const container = doc.createElement('div');
        container.style.padding = '20px';
        container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

        const title = doc.createElement('h1');
        title.textContent = 'Validation Results';
        container.appendChild(title);

        const table = doc.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '20px';

        const thead = doc.createElement('thead');
        thead.innerHTML = `
            <tr style="border-bottom: 2px solid #ccc; text-align: left;">
                <th style="padding: 8px;">Status</th>
                <th style="padding: 8px;">Title</th>
                <th style="padding: 8px;">Matches</th>
                <th style="padding: 8px;">Corrections</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = doc.createElement('tbody');
        for (const { item, result } of results) {
            const tr = doc.createElement('tr');
            tr.style.borderBottom = '1px solid #eee';

            let statusColor = '#999';
            if (result.status === 'VERIFIED') statusColor = 'green';
            if (result.status === 'VERIFIED_WITH_CORRECTIONS') statusColor = 'orange';
            if (result.status === 'FLAGGED') statusColor = 'red';

            const itemTitle = item.getField ? item.getField('title') : 'Unknown';

            tr.innerHTML = `
                <td style="padding: 8px; color: ${statusColor}; font-weight: bold;">${result.status}</td>
                <td style="padding: 8px;">${itemTitle}</td>
                <td style="padding: 8px;">${result.primaryMatches}</td>
                <td style="padding: 8px;">${result.corrections.length} available</td>
            `;
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);

        doc.body.appendChild(container);
    });
}
