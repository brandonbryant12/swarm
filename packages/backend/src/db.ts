import { Context, Effect, Layer } from "effect";
import type { Pool, QueryResultRow } from "pg";
import type { PostgresStats, SearchIndexedDataInput, SearchIndexedDataRow } from "./types.js";

export class PgPool extends Context.Tag("PgPool")<PgPool, Pool>() {}

const query = <T extends QueryResultRow>(sqlText: string, params: unknown[] = []) =>
  Effect.gen(function* () {
    const pool = yield* PgPool;
    return yield* Effect.tryPromise({
      try: () => pool.query<T>(sqlText, params),
      catch: (cause) => new Error(`database_query_failed: ${String(cause)}`),
    });
  });

const searchIndexedDataEffect = (input: SearchIndexedDataInput) =>
  query<
    SearchIndexedDataRow & {
      rank: string | number;
    }
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
        'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=24, MinWords=8'
      ) AS snippet
    FROM documents d
    WHERE d.search_vector @@ websearch_to_tsquery('english', $1)
    ORDER BY rank DESC, d.created_at DESC
    LIMIT $2
    `,
    [input.query, input.limit],
  ).pipe(
    Effect.map((result) =>
      result.rows.map((row) => ({
        id: row.id,
        sourceItemKey: row.sourceItemKey,
        title: row.title,
        sourceUrl: row.sourceUrl,
        subreddit: row.subreddit,
        rank: typeof row.rank === "string" ? Number(row.rank) : row.rank,
        snippet: row.snippet,
      })),
    ),
  );

const postgresStatsEffect = Effect.gen(function* () {
  const [
    totalDocumentsResult,
    totalScrapedItemsResult,
    documentsByKindResult,
    topSubredditsResult,
    recentDocumentsResult,
    recentScrapedItemsResult,
  ] = yield* Effect.all([
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM documents`),
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM scraped_items`),
    query<{ kind: string; count: string }>(
      `
      SELECT source_kind AS kind, COUNT(*)::text AS count
      FROM documents
      GROUP BY source_kind
      ORDER BY COUNT(*) DESC
      `,
    ),
    query<{ subreddit: string; count: string }>(
      `
      SELECT subreddit, COUNT(*)::text AS count
      FROM documents
      GROUP BY subreddit
      ORDER BY COUNT(*) DESC
      LIMIT 10
      `,
    ),
    query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM documents
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      `,
    ),
    query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM scraped_items
      WHERE scraped_at >= NOW() - INTERVAL '24 hours'
      `,
    ),
  ]);

  const totalDocuments = Number(totalDocumentsResult.rows[0]?.count ?? "0");
  const totalScrapedItems = Number(totalScrapedItemsResult.rows[0]?.count ?? "0");
  const recentDocuments24h = Number(recentDocumentsResult.rows[0]?.count ?? "0");
  const recentScrapedItems24h = Number(recentScrapedItemsResult.rows[0]?.count ?? "0");

  const duplicateRateEstimate =
    totalScrapedItems > 0 ? Number((1 - totalDocuments / totalScrapedItems).toFixed(4)) : 0;

  const stats: PostgresStats = {
    totalDocuments,
    totalScrapedItems,
    documentsByKind: documentsByKindResult.rows.map((row) => ({
      kind: row.kind,
      count: Number(row.count),
    })),
    topSubreddits: topSubredditsResult.rows.map((row) => ({
      subreddit: row.subreddit,
      count: Number(row.count),
    })),
    recentDocuments24h,
    recentScrapedItems24h,
    duplicateRateEstimate,
  };

  return stats;
});

const providePool = <A, E>(pool: Pool, effect: Effect.Effect<A, E, PgPool>) =>
  effect.pipe(Effect.provide(Layer.succeed(PgPool, pool)));

export const runSearchIndexedData = (pool: Pool, input: SearchIndexedDataInput) =>
  Effect.runPromise(providePool(pool, searchIndexedDataEffect(input)));

export const runPostgresStats = (pool: Pool) => Effect.runPromise(providePool(pool, postgresStatsEffect));
