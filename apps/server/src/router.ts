import { os, ORPCError, type as orpcType } from "@orpc/server";
import type { Pool } from "pg";
import { z } from "zod";
import { createChatEventIterator, runPostgresStats, runSearchIndexedData } from "@swarm/backend";
import type { AgentChatInput } from "@swarm/backend";
import type { createAuth } from "./auth.js";
import type { ServerConfig } from "./config.js";

export interface AppContext {
  readonly headers: Headers;
  readonly pool: Pool;
  readonly config: ServerConfig;
  readonly auth: ReturnType<typeof createAuth>;
}

const base = os.$context<AppContext>();

const authMiddleware = base.middleware(async ({ context, next }) => {
  const session = await context.auth.api.getSession({
    headers: context.headers,
  });

  if (!session?.user || !session?.session) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "You must sign in before using this endpoint.",
    });
  }

  return next({
    context: {
      ...context,
      user: session.user,
      session: session.session,
    },
  });
});

const protectedProcedure = base.use(authMiddleware);

const searchIndexed = protectedProcedure
  .input(
    z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(50).default(10),
    }),
  )
  .handler(async ({ input, context }) => {
    return runSearchIndexedData(context.pool, {
      query: input.query,
      limit: input.limit,
    });
  });

const postgresOverview = protectedProcedure.handler(async ({ context }) => {
  return runPostgresStats(context.pool);
});

const whoAmI = protectedProcedure.handler(async ({ context }) => {
  return {
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
    },
    session: {
      id: context.session.id,
      createdAt: context.session.createdAt,
      expiresAt: context.session.expiresAt,
    },
  };
});

const chat = protectedProcedure
  .input(
    orpcType<{
      chatId: string;
      messages: AgentChatInput["messages"];
    }>(),
  )
  .handler(async ({ input, context }) => {
    if (!context.config.OPENAI_API_KEY) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "OPENAI_API_KEY is required for chat streaming.",
      });
    }

    return createChatEventIterator(
      {
        chatId: input.chatId,
        messages: input.messages,
      },
      {
        pool: context.pool,
        model: context.config.AI_MODEL,
        openAiApiKey: context.config.OPENAI_API_KEY,
      },
    );
  });

export const appRouter = {
  auth: {
    me: whoAmI,
  },
  search: {
    indexed: searchIndexed,
  },
  stats: {
    overview: postgresOverview,
  },
  ai: {
    chat,
  },
};

export type AppRouter = typeof appRouter;
