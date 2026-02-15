import { tool } from "ai";
import { z } from "zod";
import { runPostgresStats } from "../db.js";
import type { ToolFactory } from "./registry.js";

export const postgresStatsToolFactory: ToolFactory = {
  name: "getPostgresStats",
  create: (deps) =>
    tool({
      description:
        "Get operational metrics from Postgres such as document volume, kind distribution, top subreddits, and duplicate estimates.",
      inputSchema: z.object({
        includeTopSubreddits: z.boolean().default(true),
      }),
      execute: async (input: { includeTopSubreddits: boolean }) => {
        const stats = await runPostgresStats(deps.pool);
        return {
          ...stats,
          topSubreddits: input.includeTopSubreddits ? stats.topSubreddits : [],
        };
      },
    }),
};
