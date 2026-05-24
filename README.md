# Zotero Reference Validator

A Zotero 10 plugin that validates reference metadata against scholarly sources (Crossref, OpenAlex, Semantic Scholar, etc.) to ensure your library is accurate.

## Installation

1. Download the latest `.xpi` from the releases page (or build it yourself).
2. In Zotero, go to Tools -> Add-ons.
3. Drag and drop the `.xpi` file into the Add-ons window, or use the gear icon and select "Install Add-on From File...".

## Quick Start

1. Open Zotero Preferences and find the "Reference Validator" pane.
2. (Optional) Configure your email for Crossref/OpenAlex, or add API keys for Semantic Scholar.
3. Right-click any item in your Zotero library and select "Validate Reference".

## Supported Sources

**Tier 1:**
- Crossref (Polite pool supported)
- OpenAlex (Polite pool supported)
- Semantic Scholar (API key supported)
- arXiv
- PubMed E-utilities

**Tier 2:**
- DBLP
- ACL Anthology
- OpenReview
- OpenCitations

**Tier 3:**
- Unpaywall
- CORE
- Internet Archive Scholar

## Security

See `SECURITY.md` for information on our threat model and data privacy.

## Development

Build the plugin:

```sh
npm install
npm run build
```

Package the release artifact (`.xpi`):

```sh
npm run package
```

Run tests:

```sh
npm test
```
