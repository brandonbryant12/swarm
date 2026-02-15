import type {
  DocumentInput,
  DocumentInsertResult,
  ScrapedItemInput,
  SearchHit,
  UpsertResult,
} from "./models.js";

export interface DocumentRepository {
  ensureSchema(): Promise<void>;
  upsertScrapedItem(input: ScrapedItemInput): Promise<UpsertResult>;
  insertDocument(input: DocumentInput): Promise<DocumentInsertResult>;
  searchByKeyword(query: string, limit: number): Promise<readonly SearchHit[]>;
}

export interface ObjectStore {
  ensureBucket(): Promise<void>;
  putJson(key: string, value: unknown): Promise<void>;
}
