import { CanonicalRecord, Identifier } from "./types";
import { ClassificationResult } from "./classifier";

export interface LibraryEntry {
  identifierKey: string;
  identifiers: Identifier;
  title: string;
  canonicalRecord: CanonicalRecord;
  validationResult: ClassificationResult;
  validatedAt: number;
  usageCount: number;
  usages: Array<{
    itemId: number;
    collectionName: string;
    usedAt: number;
  }>;
}

export class GlobalReferenceLibrary {
  private entries = new Map<string, LibraryEntry>();
  private dirty = false;
  private flushTimer: any = null;
  private dbPath: string;

  constructor() {
    this.dbPath = this.getStoragePath();
  }

  private getStoragePath(): string {
    const dir = Zotero.DataDirectory?.dir || "";
    return `${dir}/reference-validator-library.json`;
  }

  async load(): Promise<void> {
    try {
      const file = this.dbPath;
      if (!(await IOUtils.exists(file))) return;

      const bytes = await IOUtils.read(file);
      const text = new TextDecoder().decode(bytes);

      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch {
        const decompressed = await this.decompress(bytes);
        raw = JSON.parse(decompressed);
      }

      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry.identifierKey) {
            this.entries.set(entry.identifierKey, entry);
          }
        }
      }
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Failed to load library - ${e}`);
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      const data = JSON.stringify(Array.from(this.entries.values()));
      const bytes =
        this.entries.size > 500
          ? await this.compress(data)
          : new TextEncoder().encode(data);
      await IOUtils.write(this.dbPath, bytes);
      this.dirty = false;
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Failed to save library - ${e}`);
    }
  }

  private scheduleSave(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.save(), 5000);
  }

  private async compress(text: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const stream = new Blob([encoder.encode(text) as any])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private async decompress(bytes: Uint8Array): Promise<string> {
    const stream = new Blob([bytes as any])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(result);
  }

  static buildKey(identifier: Identifier, title?: string): string {
    if (identifier.doi) return `doi:${identifier.doi.toLowerCase()}`;
    if (identifier.pmid) return `pmid:${identifier.pmid}`;
    if (identifier.arxivId) return `arxiv:${identifier.arxivId.toLowerCase()}`;
    if (identifier.isbn) return `isbn:${identifier.isbn.replace(/-/g, "")}`;
    if (identifier.dblpKey) return `dblp:${identifier.dblpKey}`;
    if (identifier.semanticScholarId)
      return `s2:${identifier.semanticScholarId}`;
    if (identifier.aclAnthologyId) return `acl:${identifier.aclAnthologyId}`;
    if (identifier.openReviewId) return `or:${identifier.openReviewId}`;
    if (title) return `title:${title.toLowerCase().trim().slice(0, 100)}`;
    return "";
  }

  lookup(identifier: Identifier, title?: string): LibraryEntry | null {
    const key = GlobalReferenceLibrary.buildKey(identifier, title);
    if (!key) return null;
    return this.entries.get(key) || null;
  }

  add(
    identifier: Identifier,
    title: string,
    canonicalRecord: CanonicalRecord,
    validationResult: ClassificationResult,
  ): void {
    const key = GlobalReferenceLibrary.buildKey(identifier, title);
    if (!key) return;

    const existing = this.entries.get(key);
    if (existing) {
      existing.canonicalRecord = canonicalRecord;
      existing.validationResult = validationResult;
      existing.validatedAt = Date.now();
    } else {
      this.entries.set(key, {
        identifierKey: key,
        identifiers: identifier,
        title,
        canonicalRecord,
        validationResult,
        validatedAt: Date.now(),
        usageCount: 0,
        usages: [],
      });
    }

    this.dirty = true;
    this.scheduleSave();
  }

  recordUsage(
    identifier: Identifier,
    title: string,
    itemId: number,
    collectionName: string,
  ): void {
    const key = GlobalReferenceLibrary.buildKey(identifier, title);
    if (!key) return;

    const entry = this.entries.get(key);
    if (!entry) return;

    const alreadyUsed = entry.usages.some(
      (u) => u.itemId === itemId && u.collectionName === collectionName,
    );
    if (!alreadyUsed) {
      entry.usageCount++;
      entry.usages.push({
        itemId,
        collectionName,
        usedAt: Date.now(),
      });
      this.dirty = true;
      this.scheduleSave();
    }
  }

  remove(identifierKey: string): boolean {
    const deleted = this.entries.delete(identifierKey);
    if (deleted) {
      this.dirty = true;
      this.scheduleSave();
    }
    return deleted;
  }

  getAll(): LibraryEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => b.validatedAt - a.validatedAt,
    );
  }

  get size(): number {
    return this.entries.size;
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.save();
  }
}
