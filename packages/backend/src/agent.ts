import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { streamToEventIterator } from "@orpc/server";
import { AgentToolRegistry } from "./tools/registry.js";
import { postgresStatsToolFactory } from "./tools/postgres-stats.js";
import { searchIndexedDataToolFactory } from "./tools/search-indexed-data.js";
import type { AgentChatInput, AgentDependencies } from "./types.js";

const SYSTEM_PROMPT = `
You are a fraud-intelligence assistant.

Rules:
1. Use tools to gather evidence before conclusions.
2. Cite source URLs or sourceItemKey values when making claims.
3. If evidence is incomplete, say exactly what is unknown.
4. Keep outputs concise and structured.
`.trim();

const registry = new AgentToolRegistry([
  searchIndexedDataToolFactory,
  postgresStatsToolFactory,
]);

export const createChatEventIterator = async (
  input: AgentChatInput,
  deps: AgentDependencies,
) => {
  if (deps.openAiApiKey) {
    process.env.OPENAI_API_KEY = deps.openAiApiKey;
  }

  const messagesWithoutId = input.messages.map(({ id: _id, ...message }) => message);

  const result = streamText({
    model: openai(deps.model),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messagesWithoutId),
    tools: registry.createToolMap(deps) as any,
    stopWhen: stepCountIs(6),
  });

  return streamToEventIterator(result.toUIMessageStream());
};
