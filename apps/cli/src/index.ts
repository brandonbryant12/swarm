#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { DatabaseClient, PostgresDocumentRepository } from "@swarm/db";
import { RedditScraper, S3JsonObjectStore } from "@swarm/scraper";
import { loadConfig } from "./config.js";

const intArg = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
};

async function withServices<T>(fn: (deps: {
  repo: PostgresDocumentRepository;
  scraper: RedditScraper;
  dbClient: DatabaseClient;
}) => Promise<T>): Promise<T> {
  const cfg = loadConfig();
  const dbClient = new DatabaseClient({ databaseUrl: cfg.DATABASE_URL });
  const repo = new PostgresDocumentRepository(dbClient.pool);
  const store = new S3JsonObjectStore({
    endpoint: cfg.S3_ENDPOINT,
    region: cfg.S3_REGION,
    accessKeyId: cfg.S3_ACCESS_KEY,
    secretAccessKey: cfg.S3_SECRET_KEY,
    bucket: cfg.S3_BUCKET_RAW,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
  });
  const scraper = new RedditScraper(repo, store, {
    userAgent: cfg.REDDIT_USER_AGENT,
    requestDelayMs: cfg.SCRAPE_RATE_LIMIT_MS,
    maxRetryAttempts: cfg.SCRAPE_MAX_RETRY_ATTEMPTS,
    retryBaseDelayMs: cfg.SCRAPE_RETRY_BASE_DELAY_MS,
  });

  try {
    await repo.ensureSchema();
    await store.ensureBucket();
    return await fn({ repo, scraper, dbClient });
  } finally {
    await dbClient.close();
  }
}

const program = new Command();
program.name("swarm").description("Fraud signal scraper MVP1");

program
  .command("init")
  .description("Ensure database schema and raw object storage bucket")
  .action(async () => {
    await withServices(async () => {
      console.log("init_complete");
    });
  });

program
  .command("scrape")
  .description("Scrape subreddit submissions and comments into storage + db")
  .requiredOption("--subreddit <name>", "Subreddit name without r/")
  .option("--limit <number>", "Max submissions to scrape", intArg, 100)
  .option("--include-comments", "Include comments for each submission", true)
  .option("--no-include-comments", "Skip comment scraping")
  .option(
    "--max-comments-per-post <number>",
    "Maximum comments captured per submission",
    intArg,
    100,
  )
  .action(async (options: {
    subreddit: string;
    limit: number;
    includeComments: boolean;
    maxCommentsPerPost: number;
  }) => {
    await withServices(async ({ scraper }) => {
      const summary = await scraper.scrape({
        subreddit: options.subreddit,
        limit: options.limit,
        includeComments: options.includeComments,
        maxCommentsPerPost: options.maxCommentsPerPost,
      });
      console.log(JSON.stringify(summary, null, 2));
    });
  });

program
  .command("search")
  .description("Run keyword search against indexed documents")
  .argument("<query>", "Natural language keyword query")
  .option("--limit <number>", "Max search results", intArg, 20)
  .action(async (query: string, options: { limit: number }) => {
    await withServices(async ({ repo }) => {
      const hits = await repo.searchByKeyword(query, options.limit);
      console.log(JSON.stringify({ query, count: hits.length, hits }, null, 2));
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error("cli_error", error);
  process.exitCode = 1;
});
