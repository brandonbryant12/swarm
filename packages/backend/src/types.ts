import type { UIMessage } from "ai";
import type { Pool } from "pg";

export interface SearchIndexedDataInput {
  readonly query: string;
  readonly limit: number;
}

export interface SearchIndexedDataRow {
  readonly id: string;
  readonly sourceItemKey: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly subreddit: string;
  readonly rank: number;
  readonly snippet: string;
}

export interface PostgresStats {
  readonly totalDocuments: number;
  readonly totalScrapedItems: number;
  readonly documentsByKind: ReadonlyArray<{ kind: string; count: number }>;
  readonly topSubreddits: ReadonlyArray<{ subreddit: string; count: number }>;
  readonly recentDocuments24h: number;
  readonly recentScrapedItems24h: number;
  readonly duplicateRateEstimate: number;
}

export interface AgentDependencies {
  readonly pool: Pool;
  readonly model: string;
  readonly openAiApiKey?: string;
}

export interface AgentChatInput {
  readonly chatId: string;
  readonly messages: readonly UIMessage[];
}
