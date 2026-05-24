# Security and Privacy

## Threat Model

This plugin operates entirely locally within your Zotero application. It communicates with third-party scholarly databases to validate your reference metadata.

## Data Privacy

The plugin sends the metadata of the items you choose to validate (titles, authors, identifiers like DOIs) to the configured external scholarly sources (e.g., Crossref, OpenAlex, Semantic Scholar). 

If you configure and enable an LLM provider for semantic adjudication, the metadata of flagged items and the candidates retrieved from scholarly sources will be sent to the configured LLM API.

**No data is sent to any other third-party telemetry, tracking, or author-controlled services.**

## Credential Storage

API keys and identifiers configured in the preferences are stored locally in Zotero's `prefs.js` configuration file in plain text, standard for Zotero extensions. We recommend relying on full-disk encryption (like macOS FileVault) and secure file permissions to protect this data.
