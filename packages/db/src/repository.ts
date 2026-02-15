import type { Pool } from "pg";
import type {
  DocumentInput,
  DocumentInsertResult,
  DocumentRepository,
  ScrapedItemInput,
  SearchHit,
  UpsertResult,
} from "@swarm/types";
import { SCHEMA_SQL } from "./schema.js";

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async upsertScrapedItem(input: ScrapedItemInput): Promise<UpsertResult> {
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `
      INSERT INTO scraped_items (
        source_item_key,
        source_url,
        source_platform,
        source_kind,
        subreddit,
        raw_object_key,
        author,
        title,
        score,
        num_comments,
        parent_item_key,
        posted_at,
        metadata,
        scraped_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13::jsonb, NOW()
      )
      ON CONFLICT (source_item_key)
      DO UPDATE SET
        source_url = EXCLUDED.source_url,
        raw_object_key = EXCLUDED.raw_object_key,
        author = EXCLUDED.author,
        title = EXCLUDED.title,
        score = EXCLUDED.score,
        num_comments = EXCLUDED.num_comments,
        parent_item_key = EXCLUDED.parent_item_key,
        posted_at = EXCLUDED.posted_at,
        metadata = EXCLUDED.metadata,
        scraped_at = NOW()
      RETURNING id, (xmax = 0) AS inserted
      `,
      [
        input.sourceItemKey,
        input.sourceUrl,
        input.sourcePlatform,
        input.sourceKind,
        input.subreddit,
        input.rawObjectKey,
        input.author ?? null,
        input.title ?? null,
        input.score ?? null,
        input.numComments ?? null,
        input.parentItemKey ?? null,
        input.postedAt ?? null,
        JSON.stringify(input.metadata),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to upsert scraped item");
    }

    return { id: row.id, inserted: row.inserted };
  }

  async insertDocument(input: DocumentInput): Promise<DocumentInsertResult> {
    const result = await this.pool.query<{ id: string }>(
      `
      INSERT INTO documents (
        source_item_key,
        scraped_item_id,
        title,
        body,
        source_url,
        source_platform,
        source_kind,
        subreddit,
        content_hash,
        tags
      ) VALUES (
        $1, $2::uuid, $3, $4, $5,
        $6, $7, $8, $9, $10::text[]
      )
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [
        input.sourceItemKey,
        input.scrapedItemId,
        input.title,
        input.body,
        input.sourceUrl,
        input.sourcePlatform,
        input.sourceKind,
        input.subreddit,
        input.contentHash,
        input.tags ?? [],
      ],
    );

    if (!result.rows[0]) {
      return { id: null, inserted: false };
    }

    return { id: result.rows[0].id, inserted: true };
  }

  async searchByKeyword(query: string, limit: number): Promise<readonly SearchHit[]> {
    const result = await this.pool.query<
      SearchHit & { rank: string | number; snippet: string }
    >(
      `
      SELECT
        d.id,
        d.source_item_key AS "sourceItemKey",
        d.title,
        d.source_url AS "sourceUrl",
        d.subreddit,
        ts_rank_cd(d.search_vector, websearch_to_tsquery('english', $1)) AS rank,
        ts_headline(
          'english',
          d.body,
          websearch_to_tsquery('english', $1),
          'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=8'
        ) AS snippet
      FROM documents d
      WHERE d.search_vector @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, d.created_at DESC
      LIMIT $2
      `,
      [query, limit],
    );

    return result.rows.map((row: SearchHit & { rank: string | number; snippet: string }) => ({
      id: row.id,
      sourceItemKey: row.sourceItemKey,
      title: row.title,
      sourceUrl: row.sourceUrl,
      subreddit: row.subreddit,
      rank: typeof row.rank === "string" ? Number(row.rank) : row.rank,
      snippet: row.snippet,
    }));
  }
}
