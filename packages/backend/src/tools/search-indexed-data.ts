import { tool } from "ai";
import { z } from "zod";
import { runSearchIndexedData } from "../db.js";
import type { ToolFactory } from "./registry.js";

export const searchIndexedDataToolFactory: ToolFactory = {
  name: "searchIndexedData",
  create: (deps) =>
    tool({
      description:
        "Search the indexed fraud corpus in Postgres full-text search. Use this first to gather evidence before making claims.",
      inputSchema: z.object({
        query: z.string().min(2).max(300),
        limit: z.number().int().min(1).max(20).default(5),
      }),
      execute: async (input: { query: string; limit: number }) => {
        const rows = await runSearchIndexedData(deps.pool, {
          query: input.query,
          limit: input.limit,
        });

        return {
          query: input.query,
          count: rows.length,
          hits: rows,
        };
      },
    }),
};
