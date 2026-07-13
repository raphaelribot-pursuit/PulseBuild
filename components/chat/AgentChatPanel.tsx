"use client";

import { useState } from "react";
import { useAgentStore } from "@/store/useAgentStore";
import { EmptyState } from "@/components/layout/EmptyState";
import { VoiceStatusBadge } from "@/components/chat/VoiceStatusBadge";
import { buildChatContext } from "@/lib/chatContext";
import { seedProject } from "@/data";

/**
 * AgentChatPanel
 * Source: SoT v2.0 Section 11 / 13 — chat history, suggested prompts,
 * voice status. Grounded in project data; structured response format.
 * Technical Architecture v1.0 Section 14 — Chat and Voice Integration.
 *
 * Phase 7: live chat. Every question is sent to /api/chat along with a
 * ChatContext built entirely from real engine output (lib/chatContext.ts)
 * — the LLM is only ever allowed to talk about what's in that context
 * (see the route's system prompt). If ANTHROPIC_API_KEY isn't configured,
 * the panel surfaces the route's error clearly rather than failing
 * silently.
 */

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTED_PROMPTS = [
  "What's blocking work right now?",
  "What's our project health and drift?",
  "What happens if we do nothing about the top blocker?",
];

export function AgentChatPanel() {
  const analyses = useAgentStore((s) => s.analyses);
  const health = useAgentStore((s) => s.health);
  const drift = useAgentStore((s) => s.drift);
  const approvals = useAgentStore((s) => s.approvals);
  const verifications = useAgentStore((s) => s.verifications);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string) {
    if (!message.trim() || loading) return;
    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: message }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const context = buildChatContext(
      seedProject.name,
      health,
      drift,
      analyses,
      approvals,
      verifications
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context,
          history: nextMessages.slice(0, -1).slice(-6), // last few turns, excluding the message just sent
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the chat API.");
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setInput("");
    setError(null);
    setLoading(false);
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Agent Chat</h2>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={resetChat}
              className="text-[10px] font-medium text-muted-text border border-white/10 rounded-md px-2 py-1 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              New chat
            </button>
          )}
          <VoiceStatusBadge />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-[200px]">
        {messages.length === 0 && (
          <>
            <EmptyState
              title="Ask about the project"
              description="Ask what's blocking work, why something is prioritized, or what happens if a signal goes unaddressed — answers are grounded in real project data, never invented."
            />
            <div className="flex flex-col gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="text-left text-xs text-muted-text border border-white/10 rounded-md px-3 py-2 hover:bg-white/5 hover:text-white/90 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-md px-3 py-2 whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-white/10 text-white/90 self-end max-w-[85%]"
                : "bg-build-green/10 text-white/90 self-start max-w-[90%]"
            }`}
          >
            {m.text}
          </div>
        ))}

        {loading && <p className="text-xs text-muted-text">Thinking…</p>}
        {error && (
          <p className="text-xs text-safety-red border border-safety-red/30 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the project…"
          className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 placeholder:text-muted-text focus:outline-none focus:border-build-green/50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="text-xs font-medium px-3 py-2 rounded-md bg-build-green/20 text-build-green hover:bg-build-green/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
