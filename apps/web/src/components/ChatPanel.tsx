import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { eventIteratorToUnproxiedDataStream } from "@orpc/client";
import { authClient } from "../lib/auth-client";
import { orpc } from "../lib/orpc";

export function ChatPanel() {
  const { data: session } = authClient.useSession();
  const [input, setInput] = useState("");

  const chatId = useMemo(() => crypto.randomUUID(), []);

  const { messages, sendMessage, status, error } = useChat({
    transport: {
      sendMessages: async (options: any) => {
        const eventIterator = await orpc.ai.chat(
          {
            chatId,
            messages: options.messages,
          },
          {
            signal: options.abortSignal,
          },
        );

        return eventIteratorToUnproxiedDataStream(eventIterator);
      },
      reconnectToStream: async () => {
        throw new Error("Stream reconnect not implemented in MVP.");
      },
    },
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }

    await sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="card stack">
      <h2>Agent Chat</h2>
      {!session?.user ? (
        <div>Sign in to chat. The agent can query indexed documents and Postgres stats via tools.</div>
      ) : null}

      <div className="chat-log">
        {messages.map((message: any) => (
          <div key={message.id} className={`msg ${message.role}`}>
            <div className="role">{message.role}</div>
            <pre>
              {message.parts
                .map((part: any) => {
                  if (part.type === "text") {
                    return part.text;
                  }
                  return `[[${part.type}]]`;
                })
                .join("\n")}
            </pre>
          </div>
        ))}
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <textarea
          className="textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about fraud patterns, top subreddits, or indexed keyword evidence..."
          disabled={!session?.user || status === "streaming"}
        />
        <button className="button" disabled={!session?.user || !input.trim() || status === "streaming"}>
          {status === "streaming" ? "Streaming..." : "Send"}
        </button>
      </form>

      {error ? <div className="error">{String(error)}</div> : null}
    </div>
  );
}
