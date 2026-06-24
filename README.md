# Zotero Reference Validator
[![CI](https://github.com/dcondrey/zotero-validate/actions/workflows/ci.yml/badge.svg)](https://github.com/dcondrey/zotero-validate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)


A Zotero 10 plugin that validates reference metadata against 16 scholarly sources to ensure your library is accurate. Cross-references each item against authoritative databases, flags discrepancies, suggests corrections, and optionally uses LLM-based semantic adjudication for ambiguous cases.

## Features

- **Multi-source verification** -- validates against up to 16 scholarly databases simultaneously
- **Global reference library** -- validated references are cached locally with compressed storage, usage tracking, and a dedicated viewer UI
- **Tiered classification** -- items are marked VERIFIED, VERIFIED WITH CORRECTIONS, or FLAGGED based on cross-source consensus
- **Smart comparison** -- order-agnostic author matching, two-row Levenshtein title similarity, ISBN-10/13 normalization, arXiv version handling
- **Polymorphic field validation** -- checks volume/issue/pages for journal articles, publisher for books, based on item type
- **LLM fallback** -- optional semantic adjudication via OpenAI, Anthropic, or Google Gemini with structured JSON output
- **Batch processing** -- validate entire collections with native Zotero progress feedback and fault-tolerant execution
- **Per-adapter rate limiting** -- token bucket algorithm with FIFO queue and processing lock respects each API's rate limits
- **In-flight deduplication** -- duplicate items in a batch share a single network request
- **Freshness caching** -- skips recently validated items (configurable window, default 90 days)
- **Auto-updates** -- plugin checks for new versions automatically via GitHub releases

## Installation

1. Download the latest `.xpi` from the [Releases](../../releases) page.
2. In Zotero, go to **Tools > Add-ons**.
3. Click the gear icon and select **Install Add-on From File**, then choose the `.xpi`.

The plugin will check for updates automatically.

## Quick Start

1. Open **Zotero Preferences** and find the **Reference Validator** pane.
2. (Optional) Enter your email for Crossref/OpenAlex polite pools, or add API keys for Semantic Scholar and LLM providers.
3. Right-click any item (or select multiple) and choose **Validate Reference**.
4. View results in the validation summary window. The **Details** column shows diagnostic information including any source errors.
5. Access the **Validated References Library** from the right-click menu to browse all validated items, revalidate, or remove entries.

## Supported Sources

### Tier 1 (Authoritative)

| Source | Credentials | Lookup | Search |
|--------|-------------|--------|--------|
| [Crossref](https://www.crossref.org/) | Email (polite pool) | DOI | Title + Author |
| [OpenAlex](https://openalex.org/) | Email (polite pool) | DOI, PMID, arXiv | Title |
| [Semantic Scholar](https://www.semanticscholar.org/) | API key (optional) | DOI, arXiv, PMID, ISBN | Title + Author |
| [arXiv](https://arxiv.org/) | None | arXiv ID | Title + Author |
| [PubMed](https://pubmed.ncbi.nlm.nih.gov/) | None | PMID, DOI | Title + Author |
| [DataCite](https://datacite.org/) | None | DOI | Title |
| [Europe PMC](https://europepmc.org/) | None | DOI, PMID, arXiv | Title |

### Tier 2 (Supplementary)

| Source | Credentials | Lookup | Search |
|--------|-------------|--------|--------|
| [DBLP](https://dblp.org/) | None | DBLP key, DOI | Title + Author |
| [ACL Anthology](https://aclanthology.org/) | None | ACL ID | Title (via Crossref) |
| [OpenReview](https://openreview.net/) | None | OpenReview ID | Title |
| [Open Library](https://openlibrary.org/) | None | ISBN | Title + Author |
| [ORCID](https://orcid.org/) | None | DOI | -- |

### Tier 3 (Supporting)

| Source | Credentials | Lookup | Search |
|--------|-------------|--------|--------|
| [OpenCitations](https://opencitations.net/) | None | DOI | -- |
| [Unpaywall](https://unpaywall.org/) | Email (reused) | DOI | -- |
| [Internet Archive Scholar](https://scholar.archive.org/) | None | DOI, PMID, arXiv | Title |
| [Google Scholar](https://scholar.google.com/) | -- | -- | -- (stub, no public API) |

**Tier 1** and **Tier 2** sources contribute to the verification threshold. The default minimum is 2 agreeing sources. Tier 3 sources provide supplementary metadata.

## Global Reference Library

Validated references are automatically saved to a local library stored in your Zotero data directory. The library:

- **Caches validation results** -- subsequent validations of the same reference skip remote API calls entirely if the cached result is fresh
- **Compresses automatically** -- uses gzip compression when the library exceeds 500 entries
- **Tracks usage** -- records how many times each reference has been used and in which collections/papers
- **Supports manual management** -- view, revalidate, or remove entries from the library viewer (right-click menu > "View Validated References Library")

The library viewer displays each entry's validation status, title, identifier, validation date, usage count, associated papers, and provides Revalidate and Remove buttons.

## How It Works

### Classification

| Status | Tag Applied | Meaning |
|--------|------------|---------|
| **VERIFIED** | `validated` | 2+ sources confirm all critical fields match |
| **VERIFIED WITH CORRECTIONS** | `validated-with-corrections` | Sources confirm the item but found field discrepancies |
| **FLAGGED** | `validation-flagged` | Insufficient matches or conflicting data |

The classifier distinguishes between **conflicting data** (active mismatches that block verification) and **missing data** (fields a source doesn't return, which generate corrections but don't penalize the match). This prevents a strong DOI match from being downgraded just because a source omits a year.

### LLM Adjudication

When an item is FLAGGED and LLM adjudication is enabled, the plugin sends item metadata and candidate records to the configured LLM. The LLM returns a structured JSON verdict:

```json
{
  "match": true,
  "explanation": "Same paper, preprint vs published version",
  "corrections": [{"field": "year", "suggested": "2024"}]
}
```

Corrections from the LLM flow through to the results UI alongside source-derived corrections. The prompt includes injection defenses (newline stripping, length caps, instruction boundary).

### Validation Pipeline

```
Item selected
  |
  v
Global library check --> cached & fresh? --> return cached result
  |
  v
Freshness check (extra field) --> cached? --> return cached result
  |
  v
Extract & validate identifiers (DOI, ISBN, PMID, arXiv ID)
  |
  v
Parallel adapter queries (per-adapter token bucket rate limiting)
  |  - In-flight deduplication coalesces identical queries
  |  - Fault-tolerant: individual adapter failures don't kill the batch
  |  - Cross-identifier extraction enriches downstream lookups
  |
  v
Field comparison (polymorphic by item type)
  |  - Titles: two-row Levenshtein similarity >= 0.95
  |  - Authors: order-agnostic set matching with initials support
  |  - Year: exact match
  |  - Journal: volume, issue, pages
  |  - Book: publisher
  |
  v
Tiered classification (Tier 1+2 consensus)
  |
  v
LLM adjudication (optional, for FLAGGED items only)
  |
  v
Persist: tags + report in extra field (mutation-shielded)
  |
  v
Add to global reference library (with usage tracking)
```

## Configuration

All settings are accessible from **Zotero Preferences > Reference Validator**.

| Setting | Default | Description |
|---------|---------|-------------|
| Source emails | -- | Email for Crossref/OpenAlex polite pool access. Also used by Unpaywall. |
| Semantic Scholar API key | -- | Optional. Increases rate limits from 100/5min to 1000/5min. |
| Minimum sources | 2 | Number of agreeing Tier 1/2 sources required for VERIFIED status. |
| Freshness window | 90 days | Skip re-validation if item was checked within this period. |
| Request timeout | 10 seconds | Per-request timeout for source API calls. |
| LLM adjudication | Off | Enable LLM fallback for FLAGGED items. Requires an API key. |
| LLM API keys | -- | OpenAI, Anthropic, or Gemini. First configured key is used. |

### Recommended Configuration

- **General use**: Enter your email for Crossref and OpenAlex. Leave other defaults.
- **CS/ML researchers**: DBLP, ACL Anthology, and OpenReview are enabled by default.
- **Biomedical researchers**: PubMed and Europe PMC are enabled by default. Consider adding a Semantic Scholar API key.
- **Book-heavy libraries**: Open Library is enabled by default for ISBN lookups.
- **Dataset/software citations**: DataCite is enabled by default for non-journal DOIs.
- **Large batch validation**: Increase the request timeout if you experience rate limiting.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| All items FLAGGED | Only 1 adapter returning results | Check network; add email for polite pool; lower min_sources to 1 |
| Validation hangs | API timeout | Increase `behavior.timeout_sec` in preferences |
| "Errors: Crossref: AbortError" | Request timed out | Increase timeout or reduce batch size |
| Duplicate menu items | Plugin re-enabled without restart | Restart Zotero (fixed in v0.1.0+) |
| Preferences don't save | Missing preference binding | Update to latest version |
| Library file growing large | Many validated references | Library auto-compresses above 500 entries |

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

Creates `zotero-reference-validator.xpi` in the project root.

### Test

```sh
npm test
```

91 tests across 5 suites covering all adapters, the orchestrator, LLM client, comparison engine, and classifier.

### Type Check

```sh
npx tsc --noEmit
```

### Project Structure

```
src/
  bootstrap.ts          Plugin lifecycle with window observer pattern
  orchestrator.ts       Validation pipeline: rate limiting, deduplication, caching
  classifier.ts         Tiered consensus classification
  comparison.ts         Field comparison with LaTeX parser and set-based author matching
  llm.ts                LLM adjudication (OpenAI, Anthropic, Gemini)
  library.ts            Global validated references library with compressed storage
  library-ui.ts         Library viewer window
  http.ts               Shared fetch wrapper with timeout and Content-Type validation
  menu.ts               MenuManager with per-window lifecycle
  preferences.ts        Preference pane registration and teardown
  ui.ts                 Validation results window
  types.ts              Shared type definitions
  zotero.d.ts           Zotero runtime type declarations
  adapters/
    utils.ts            Shared author name parsing and date utilities
    crossref.ts         Crossref (Tier 1)
    openalex.ts         OpenAlex (Tier 1)
    semanticscholar.ts  Semantic Scholar (Tier 1)
    arxiv.ts            arXiv (Tier 1)
    pubmed.ts           PubMed E-utilities (Tier 1)
    datacite.ts         DataCite (Tier 1)
    europepmc.ts        Europe PMC (Tier 1)
    dblp.ts             DBLP (Tier 2)
    aclanthology.ts     ACL Anthology (Tier 2)
    openreview.ts       OpenReview (Tier 2)
    openlibrary.ts      Open Library (Tier 2)
    orcid.ts            ORCID (Tier 2)
    opencitations.ts    OpenCitations (Tier 3)
    unpaywall.ts        Unpaywall (Tier 3)
    iascholar.ts        Internet Archive Scholar (Tier 3)
    googlescholar.ts    Google Scholar (Tier 3, stub)
tests/
  orchestrator.test.ts  Validation flow, caching, persistence
  llm.test.ts           Response parsing, structured output, prompt safety
  adapters.test.ts      Adapter normalize/transform methods and shared utils
  comparison.test.ts    Title, author, identifier, venue comparison
  classifier.test.ts    Classification thresholds and edge cases
```

## Architecture

### Rate Limiting

Each adapter has its own token bucket rate limiter with configurable `perSecond` and `concurrent` limits. The limiter uses a FIFO promise queue with a processing lock to prevent timer storms under burst load. When a slot opens (via `release()`), queued requests are drained immediately with dynamically calculated delays based on token deficit.

### In-Flight Deduplication

When validating a batch containing duplicate items (common in messy libraries), the orchestrator generates a deterministic cache key per adapter + identifier. If an identical query is already in flight, subsequent items hook into the same promise rather than issuing redundant network requests.

### Mutation Shield

To prevent infinite loops when background notifiers observe item changes, the orchestrator tracks item IDs in a `programmaticMutations` set during persistence. External observers can check `Orchestrator.isShielded(itemId)` to skip programmatic modifications.

### Confidence Calibration

Each adapter returns a confidence score with its results. ID-based lookups (DOI, PMID) return 1.0 confidence. Title-based searches return 0.8-0.85. This prevents the classifier from treating fuzzy title matches with the same weight as exact DOI lookups.

### Cross-Identifier Extraction

When an adapter fetches a record by DOI, it also extracts secondary identifiers (PMID, arXiv ID, ISBN) from the response. These enriched identifiers enable downstream adapters to perform their own direct lookups rather than falling back to title search.

## Security and Privacy

See [SECURITY.md](SECURITY.md) for the full threat model and data handling details.

**Summary**: The plugin sends item metadata (titles, authors, identifiers) to configured scholarly APIs. If LLM adjudication is enabled, flagged item metadata is also sent to the configured LLM provider. No data is sent to any telemetry, tracking, or author-controlled services. API keys are stored locally in Zotero's preferences. The global reference library is stored locally in your Zotero data directory.

## License

[MIT](LICENSE)