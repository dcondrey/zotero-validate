# Zotero Reference Validator

A Zotero 10 plugin that validates reference metadata against multiple scholarly sources to ensure your library is accurate. It cross-references each item against authoritative databases, flags discrepancies, suggests corrections, and optionally uses LLM-based semantic adjudication for ambiguous cases.

## Features

- **Multi-source verification** -- validates against up to 9 scholarly databases simultaneously
- **Tiered classification** -- items are marked VERIFIED, VERIFIED WITH CORRECTIONS, or FLAGGED based on cross-source consensus
- **Smart comparison** -- order-agnostic author matching, Levenshtein title similarity, ISBN-10/13 normalization, arXiv version handling
- **Polymorphic field validation** -- checks volume/issue/pages for journal articles, publisher for books
- **LLM fallback** -- optional semantic adjudication via OpenAI, Anthropic, or Google Gemini for flagged items
- **Batch processing** -- validate entire collections with native progress feedback and fault-tolerant execution
- **Per-adapter rate limiting** -- token bucket algorithm respects each API's rate limits
- **In-flight deduplication** -- duplicate items in a batch share a single network request
- **Freshness caching** -- skips recently validated items (configurable window)

## Installation

1. Download the latest `.xpi` from the [Releases](../../releases) page.
2. In Zotero, go to **Tools > Add-ons**.
3. Click the gear icon and select **Install Add-on From File**, then choose the `.xpi`.

## Quick Start

1. Open **Zotero Preferences** and find the **Reference Validator** pane.
2. (Optional) Enter your email for Crossref/OpenAlex polite pools, or add API keys for Semantic Scholar and LLM providers.
3. Right-click any item (or select multiple) and choose **Validate Reference**.
4. View results in the validation summary window. The **Details** column shows diagnostic information including any source errors.

## Supported Sources

| Source | Tier | Credentials | Notes |
|--------|------|-------------|-------|
| Crossref | 1 | Email (polite pool) | DOI lookup and title search |
| OpenAlex | 1 | Email (polite pool) | DOI, PMID lookup and title search |
| Semantic Scholar | 1 | API key | DOI, arXiv, PMID lookup and title search |
| arXiv | 1 | None | arXiv ID lookup and title search |
| PubMed | 1 | None | PMID, DOI lookup and title search |
| DBLP | 2 | None | DBLP key, DOI lookup and title search |
| ACL Anthology | 2 | None | ACL ID lookup and DOI-based search |
| OpenReview | 2 | None | OpenReview ID lookup and title search |
| Open Library | 2 | None | ISBN lookup and title search (books) |

**Tier 1** and **Tier 2** sources contribute to the verification threshold. The default minimum is 2 agreeing sources.

## Classification Logic

| Status | Meaning |
|--------|---------|
| **VERIFIED** | 2+ authoritative sources confirm all critical fields match |
| **VERIFIED WITH CORRECTIONS** | Sources confirm the item but found field discrepancies (corrections available) |
| **FLAGGED** | Insufficient matches or conflicting data across sources |

When an item is FLAGGED and LLM adjudication is enabled, the plugin sends the item metadata and candidate records to the configured LLM for semantic comparison. The LLM returns a structured JSON verdict with match status, explanation, and suggested corrections.

## Configuration

All settings are accessible from **Zotero Preferences > Reference Validator**.

| Setting | Default | Description |
|---------|---------|-------------|
| Source emails | (empty) | Email for Crossref/OpenAlex polite pool access |
| API keys | (empty) | Semantic Scholar, OpenAI, Anthropic, or Gemini keys |
| Minimum sources | 2 | Number of agreeing Tier 1/2 sources required for VERIFIED |
| Freshness window | 90 days | Skip re-validation if checked within this period |
| Request timeout | 10 seconds | Per-request timeout for source API calls |
| LLM adjudication | Off | Enable LLM fallback for FLAGGED items |

## Development

### Prerequisites

- Node.js 20+
- npm

### Build

```sh
npm install
npm run build
```

### Package

```sh
npm run package
```

This creates `zotero-reference-validator.xpi` in the project root.

### Test

```sh
npm test
```

63 tests across 5 test suites covering the orchestrator, LLM client, source adapters, comparison engine, and classifier.

### Type Check

```sh
npx tsc --noEmit
```

### Project Structure

```
src/
  bootstrap.ts          Plugin lifecycle (startup, shutdown) with window observer
  orchestrator.ts       Validation pipeline: rate limiting, deduplication, caching, persistence
  classifier.ts         Tiered classification logic
  comparison.ts         Field comparison: titles, authors, identifiers, venue fields
  llm.ts                LLM adjudication client (OpenAI, Anthropic, Gemini)
  menu.ts               MenuManager class with per-window add/remove
  preferences.ts        Preference pane registration
  ui.ts                 Validation results window
  types.ts              Shared type definitions
  zotero.d.ts           Zotero runtime type declarations
  adapters/
    crossref.ts         Crossref API adapter
    openalex.ts         OpenAlex API adapter
    semanticscholar.ts  Semantic Scholar API adapter
    arxiv.ts            arXiv API adapter
    pubmed.ts           PubMed E-utilities adapter
    dblp.ts             DBLP API adapter
    aclanthology.ts     ACL Anthology adapter
    openreview.ts       OpenReview API adapter
    openlibrary.ts      Open Library API adapter
defaults/
  preferences.xhtml     Preference pane UI
  preferences.js        Preference binding logic
  preferences.css       Preference pane styles
  preferences/
    prefs.js            Default preference values
tests/
  orchestrator.test.ts  Orchestrator validation flow tests
  llm.test.ts           LLM client response parsing tests
  adapters.test.ts      Adapter normalization and error handling tests
  comparison.test.ts    Title, author, identifier comparison tests
  classifier.test.ts    Classification logic tests
```

## Architecture

The validation pipeline follows this flow:

1. **Freshness check** -- return cached result if within configured window
2. **Identifier extraction** -- extract and validate DOI, ISBN, PMID, arXiv ID from item
3. **Parallel adapter queries** -- each adapter runs through its own token bucket rate limiter; duplicate queries across items are coalesced via in-flight deduplication
4. **Field comparison** -- compare title (Levenshtein), authors (set-based), year, and type-specific venue fields against each source record
5. **Classification** -- aggregate diffs across sources using tiered consensus logic
6. **LLM adjudication** (optional) -- if flagged, send to LLM for structured JSON verdict
7. **Persistence** -- apply validation tags and store report, wrapped in a mutation shield to prevent notifier loops

## Security and Privacy

See [SECURITY.md](SECURITY.md) for the full threat model and data handling details.

**Summary**: The plugin sends item metadata (titles, authors, identifiers) to configured scholarly APIs. If LLM adjudication is enabled, flagged item metadata is also sent to the configured LLM provider. No data is sent to any telemetry, tracking, or author-controlled services.

## License

[MIT](LICENSE)
