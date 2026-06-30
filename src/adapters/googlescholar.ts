import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";

/**
 * Google Scholar adapter (stub).
 *
 * Google Scholar does not provide a public API, and scraping is prohibited
 * by their Terms of Service. This adapter exists as an architectural
 * placeholder so the plugin can support Google Scholar results in the future
 * via a user-configured compatible search proxy (e.g., SerpAPI, scholarly
 * metadata proxy, or similar service).
 *
 * Until a proxy is configured, this adapter reports itself as unconfigured
 * and returns no results for all queries.
 */
export class GoogleScholarAdapter implements SourceAdapter {
  readonly id = "googlescholar";
  readonly displayName = "Google Scholar";
  readonly tier = 3 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(_prefs: PluginPrefs): boolean {
    // Always disabled until a compatible search proxy is configured.
    return false;
  }

  async getById(
    _identifier: Identifier,
    _prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    return null;
  }

  async search(
    _query: SearchQuery,
    _prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    return [];
  }
}
