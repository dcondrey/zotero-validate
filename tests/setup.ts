import { DOMParser } from "@xmldom/xmldom";

// Zotero runs in a Gecko context where DOMParser is a global. Node/vitest has
// none, so adapters that parse XML (arXiv, PubMed) need a polyfill in tests.
(globalThis as any).DOMParser = DOMParser;
