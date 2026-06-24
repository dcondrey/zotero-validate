# Adding a New Adapter

This guide explains how to add a new validation source adapter to `zotero-validate`.

---

## Interface

Every adapter must implement the `SourceAdapter` interface from `src/types.ts`:

```typescript
import { SourceAdapter, Identifier, SearchQuery, PluginPrefs, CanonicalRecord } from "../types";

export class MySourceAdapter implements SourceAdapter {
  readonly id = "mysource";           // unique lowercase string
  readonly displayName = "My Source"; // shown in UI
  readonly tier = 2 as const;         // 1 = primary, 2 = secondary
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 5, concurrent: 3 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.mysource.enabled"] !== false;
  }

  async getById(identifier: Identifier, prefs: PluginPrefs = {}): Promise<CanonicalRecord | null> {
    // lookup by DOI or other identifier
  }

  async search(query: SearchQuery, prefs: PluginPrefs = {}): Promise<CanonicalRecord[]> {
    // search by title/author
  }
}
```

**Input:** `Identifier` (contains `doi`, `isbn`, etc.) and `SearchQuery` (contains `title`, `authors`, `year`)

**Output:** `CanonicalRecord | null` for `getById`, `CanonicalRecord[]` for `search`

---

## Rate Limiting

Use the `rateLimit` property to declare your adapter's limits. The orchestrator reads this automatically via `http.ts`:

```typescript
readonly rateLimit = { perSecond: 10, concurrent: 5 };
```

Pass `prefs["behavior.timeout_sec"]` as the timeout to `fetchJSON`:

```typescript
const timeout = prefs["behavior.timeout_sec"] || 10;
const data = await fetchJSON(url, {}, timeout);
```

Do not implement your own throttle — `http.ts` handles it.

---

## Error Handling

- Return `null` (not throw) when a record is not found
- Wrap API calls in `try/catch` and log via `Zotero.debug()`
- Return `[]` from `search()` on failure

```typescript
try {
  const data = await fetchJSON(url, {}, timeout);
  return this.normalize(data, 1.0);
} catch (e) {
  Zotero.debug(`ReferenceValidator: MySource getById failed - ${e}`);
  return null;
}
```

---

## Registering the Adapter

Open `src/orchestrator.ts` and import + add your adapter to the adapters array:

```typescript
import { MySourceAdapter } from "./adapters/mysource";

const adapters: SourceAdapter[] = [
  new DataCiteAdapter(),
  new CrossrefAdapter(),
  // ...existing adapters...
  new MySourceAdapter(), // add here
];
```

---

## Minimal Stub Example

A stub adapter that always returns no result — useful as a starting template:

```typescript
import { SourceAdapter, Identifier, SearchQuery, PluginPrefs, CanonicalRecord } from "../types";
import { fetchJSON } from "../http";

export class StubAdapter implements SourceAdapter {
  readonly id = "stub";
  readonly displayName = "Stub";
  readonly tier = 2 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(_prefs: PluginPrefs): boolean {
    return true;
  }

  async getById(_identifier: Identifier, _prefs: PluginPrefs = {}): Promise<CanonicalRecord | null> {
    return null;
  }

  async search(_query: SearchQuery, _prefs: PluginPrefs = {}): Promise<CanonicalRecord[]> {
    return [];
  }
}
```

---

## Checklist

- [ ] File created at `src/adapters/mysource.ts`
- [ ] Implements all `SourceAdapter` methods
- [ ] Uses `fetchJSON` from `../http` with timeout from prefs
- [ ] Returns `null`/`[]` on error, never throws
- [ ] Registered in `src/orchestrator.ts`
