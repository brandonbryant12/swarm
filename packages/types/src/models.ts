export type SourcePlatform = "reddit";
export type SourceKind = "submission" | "comment";

export interface ScrapedItemInput {
  readonly sourceItemKey: string;
  readonly sourceUrl: string;
  readonly sourcePlatform: SourcePlatform;
  readonly sourceKind: SourceKind;
  readonly subreddit: string;
  readonly rawObjectKey: string;
  readonly author?: string | null;
  readonly title?: string | null;
  readonly score?: number | null;
  readonly numComments?: number | null;
  readonly parentItemKey?: string | null;
  readonly postedAt?: Date | null;
  readonly metadata: Record<string, unknown>;
}

export interface DocumentInput {
  readonly sourceItemKey: string;
  readonly scrapedItemId: string;
  readonly title: string;
  readonly body: string;
  readonly sourceUrl: string;
  readonly sourcePlatform: SourcePlatform;
  readonly sourceKind: SourceKind;
  readonly subreddit: string;
  readonly contentHash: string;
  readonly tags?: readonly string[];
}

export interface UpsertResult {
  readonly id: string;
  readonly inserted: boolean;
}

export interface DocumentInsertResult {
  readonly id: string | null;
  readonly inserted: boolean;
}

export interface ScrapeTarget {
  readonly subreddit: string;
  readonly limit: number;
  readonly includeComments: boolean;
  readonly maxCommentsPerPost: number;
}

export interface ScrapeSummary {
  readonly subreddit: string;
  readonly requested: number;
  readonly includeComments: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly scannedSubmissions: number;
  readonly scannedComments: number;
  readonly insertedItems: number;
  readonly updatedItems: number;
  readonly insertedDocuments: number;
  readonly duplicateDocuments: number;
  readonly errors: number;
}

export interface SearchHit {
  readonly id: string;
  readonly sourceItemKey: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly subreddit: string;
  readonly rank: number;
  readonly snippet: string;
}
