import { createHash } from "node:crypto";
import type { DocumentRepository, ObjectStore, ScrapeSummary, ScrapeTarget } from "@swarm/types";
import { RetryableError, sleep, withRetry } from "./retry.js";

interface RedditListingChild {
  readonly kind: string;
  readonly data: Record<string, unknown>;
}

interface RedditListingResponse {
  readonly data?: {
    readonly after?: string | null;
    readonly children?: RedditListingChild[];
  };
}

export interface RedditScraperConfig {
  readonly userAgent: string;
  readonly requestDelayMs: number;
  readonly maxRetryAttempts: number;
  readonly retryBaseDelayMs: number;
}

export class RedditScraper {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly store: ObjectStore,
    private readonly config: RedditScraperConfig,
  ) {}

  async scrape(target: ScrapeTarget): Promise<ScrapeSummary> {
    const startedAt = new Date();
    const stats = {
      scannedSubmissions: 0,
      scannedComments: 0,
      insertedItems: 0,
      updatedItems: 0,
      insertedDocuments: 0,
      duplicateDocuments: 0,
      errors: 0,
    };

    let after: string | null | undefined;

    while (stats.scannedSubmissions < target.limit) {
      const remaining = target.limit - stats.scannedSubmissions;
      const pageSize = Math.min(remaining, 100);

      const listing = await this.fetchSubmissions(target.subreddit, pageSize, after);
      const children = listing.data?.children ?? [];

      if (children.length === 0) {
        break;
      }

      for (const child of children) {
        if (child.kind !== "t3") {
          continue;
        }

        stats.scannedSubmissions += 1;

        try {
          await this.processSubmission(target.subreddit, child.data, stats, target);
        } catch (error) {
          stats.errors += 1;
          // Keep scrape resilient; count and continue.
          console.error("submission_processing_error", {
            subreddit: target.subreddit,
            error: String(error),
          });
        }

        if (stats.scannedSubmissions >= target.limit) {
          break;
        }
      }

      after = listing.data?.after;
      if (!after) {
        break;
      }
    }

    const finishedAt = new Date();
    return {
      subreddit: target.subreddit,
      requested: target.limit,
      includeComments: target.includeComments,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      scannedSubmissions: stats.scannedSubmissions,
      scannedComments: stats.scannedComments,
      insertedItems: stats.insertedItems,
      updatedItems: stats.updatedItems,
      insertedDocuments: stats.insertedDocuments,
      duplicateDocuments: stats.duplicateDocuments,
      errors: stats.errors,
    };
  }

  private async processSubmission(
    subreddit: string,
    submission: Record<string, unknown>,
    stats: {
      scannedSubmissions: number;
      scannedComments: number;
      insertedItems: number;
      updatedItems: number;
      insertedDocuments: number;
      duplicateDocuments: number;
      errors: number;
    },
    target: ScrapeTarget,
  ): Promise<void> {
    const id = this.readString(submission.id);
    if (!id) {
      return;
    }

    const sourceItemKey = `reddit:t3_${id}`;
    const permalink = this.readString(submission.permalink) ?? "";
    const sourceUrl = permalink ? `https://www.reddit.com${permalink}` : "https://www.reddit.com";
    const title = this.readString(submission.title) ?? "";
    const selftext = this.readString(submission.selftext) ?? "";
    const externalUrl = this.readString(submission.url) ?? "";
    const body = selftext.trim() || externalUrl.trim() || title.trim();
    const postedAt = this.epochSecondsToDate(submission.created_utc);

    const objectKey = this.makeObjectKey(subreddit, "submission", id, postedAt);
    await this.store.putJson(objectKey, {
      kind: "submission",
      source: "reddit",
      subreddit,
      payload: submission,
      scrapedAt: new Date().toISOString(),
    });

    const itemResult = await this.repo.upsertScrapedItem({
      sourceItemKey,
      sourceUrl,
      sourcePlatform: "reddit",
      sourceKind: "submission",
      subreddit,
      rawObjectKey: objectKey,
      author: this.readString(submission.author),
      title,
      score: this.readNumber(submission.score),
      numComments: this.readNumber(submission.num_comments),
      postedAt,
      metadata: {
        postId: id,
        permalink,
        isSelf: this.readBoolean(submission.is_self),
      },
    });

    if (itemResult.inserted) {
      stats.insertedItems += 1;
    } else {
      stats.updatedItems += 1;
    }

    const docResult = await this.repo.insertDocument({
      sourceItemKey,
      scrapedItemId: itemResult.id,
      title,
      body: body || "[empty]",
      sourceUrl,
      sourcePlatform: "reddit",
      sourceKind: "submission",
      subreddit,
      contentHash: this.hashContent(title, body),
      tags: [],
    });

    if (docResult.inserted) {
      stats.insertedDocuments += 1;
    } else {
      stats.duplicateDocuments += 1;
    }

    if (!target.includeComments) {
      return;
    }

    const comments = await this.fetchComments(permalink, target.maxCommentsPerPost);
    for (const comment of comments) {
      const commentId = this.readString(comment.id);
      if (!commentId) {
        continue;
      }

      const commentBody = (this.readString(comment.body) ?? "").trim();
      if (!commentBody || commentBody === "[deleted]" || commentBody === "[removed]") {
        continue;
      }

      stats.scannedComments += 1;

      const commentSourceItemKey = `reddit:t1_${commentId}`;
      const commentPermalink = this.readString(comment.permalink) ?? permalink;
      const commentSourceUrl = commentPermalink
        ? `https://www.reddit.com${commentPermalink}`
        : sourceUrl;
      const commentPostedAt = this.epochSecondsToDate(comment.created_utc);

      const commentObjectKey = this.makeObjectKey(subreddit, "comment", commentId, commentPostedAt);
      await this.store.putJson(commentObjectKey, {
        kind: "comment",
        source: "reddit",
        subreddit,
        submissionId: id,
        payload: comment,
        scrapedAt: new Date().toISOString(),
      });

      const commentItemResult = await this.repo.upsertScrapedItem({
        sourceItemKey: commentSourceItemKey,
        sourceUrl: commentSourceUrl,
        sourcePlatform: "reddit",
        sourceKind: "comment",
        subreddit,
        rawObjectKey: commentObjectKey,
        author: this.readString(comment.author),
        title: `Comment in r/${subreddit}`,
        score: this.readNumber(comment.score),
        numComments: null,
        parentItemKey: this.readString(comment.parent_id),
        postedAt: commentPostedAt,
        metadata: {
          commentId,
          permalink: commentPermalink,
          parentId: this.readString(comment.parent_id),
          linkId: this.readString(comment.link_id),
        },
      });

      if (commentItemResult.inserted) {
        stats.insertedItems += 1;
      } else {
        stats.updatedItems += 1;
      }

      const commentDoc = await this.repo.insertDocument({
        sourceItemKey: commentSourceItemKey,
        scrapedItemId: commentItemResult.id,
        title: `Comment in r/${subreddit}`,
        body: commentBody,
        sourceUrl: commentSourceUrl,
        sourcePlatform: "reddit",
        sourceKind: "comment",
        subreddit,
        contentHash: this.hashContent(`comment:${commentId}`, commentBody),
        tags: [],
      });

      if (commentDoc.inserted) {
        stats.insertedDocuments += 1;
      } else {
        stats.duplicateDocuments += 1;
      }
    }
  }

  private async fetchSubmissions(
    subreddit: string,
    limit: number,
    after?: string | null,
  ): Promise<RedditListingResponse> {
    const url = new URL(`https://www.reddit.com/r/${subreddit}/new.json`);
    url.searchParams.set("limit", String(limit));
    if (after) {
      url.searchParams.set("after", after);
    }

    return this.fetchJson<RedditListingResponse>(url.toString());
  }

  private async fetchComments(
    permalink: string,
    maxComments: number,
  ): Promise<readonly Record<string, unknown>[]> {
    if (!permalink) {
      return [];
    }

    const url = new URL(`https://www.reddit.com${permalink}.json`);
    url.searchParams.set("limit", "500");
    url.searchParams.set("depth", "5");
    const response = await this.fetchJson<unknown>(url.toString());

    if (!Array.isArray(response) || response.length < 2) {
      return [];
    }

    const commentsListing = response[1] as RedditListingResponse;
    const children = commentsListing.data?.children ?? [];
    const output: Record<string, unknown>[] = [];
    this.collectComments(children, output, maxComments);
    return output;
  }

  private collectComments(
    children: readonly RedditListingChild[],
    output: Record<string, unknown>[],
    maxComments: number,
  ): void {
    for (const child of children) {
      if (output.length >= maxComments) {
        return;
      }

      if (child.kind !== "t1") {
        continue;
      }

      output.push(child.data);
      const replies = child.data.replies;
      if (!replies || typeof replies !== "object") {
        continue;
      }

      const nestedChildren = (replies as RedditListingResponse).data?.children;
      if (!nestedChildren || !Array.isArray(nestedChildren)) {
        continue;
      }

      this.collectComments(nestedChildren, output, maxComments);
      if (output.length >= maxComments) {
        return;
      }
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await withRetry(
      async () => {
        const res = await fetch(url, {
          headers: {
            "user-agent": this.config.userAgent,
            accept: "application/json",
          },
        });

        if (res.status === 429) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
          throw new RetryableError(`Rate limited: ${url}`, retryAfterMs);
        }

        if (res.status >= 500) {
          throw new RetryableError(`Upstream server error ${res.status}: ${url}`);
        }

        if (!res.ok) {
          throw new Error(`Request failed ${res.status}: ${url}`);
        }

        return (await res.json()) as T;
      },
      {
        maxAttempts: this.config.maxRetryAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
      },
    );

    await sleep(this.config.requestDelayMs);
    return response;
  }

  private hashContent(title: string, body: string): string {
    return createHash("sha256")
      .update(`${title.trim()}\n${body.trim()}`.toLowerCase())
      .digest("hex");
  }

  private makeObjectKey(
    subreddit: string,
    kind: "submission" | "comment",
    id: string,
    postedAt: Date | null,
  ): string {
    const dt = postedAt ?? new Date();
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `reddit/${subreddit}/${yyyy}-${mm}-${dd}/${kind}_${id}.json`;
  }

  private epochSecondsToDate(value: unknown): Date | null {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return null;
    }
    return new Date(value * 1000);
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private readNumber(value: unknown): number | null {
    return typeof value === "number" ? value : null;
  }

  private readBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
  }
}
