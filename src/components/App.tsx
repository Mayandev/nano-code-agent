import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { MessageList, type DisplayMessage } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { Agent } from "../agent.js";
import { formatConfirmationDetail } from "../permissions.js";
import { renderStreamingMarkdown } from "../utils/markdown.js";
import { createSessionId, saveSession, loadSession, listSessions } from "../session.js";
import { undoCheckpoint } from "../tools/git.js";
import type { Config } from "../types.js";

interface Props {
  config: Config;
}

export function App({ config }: Props) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [agent] = useState(() => new Agent(config));
  const sessionId = useRef(config.resumeSession ?? createSessionId());
  const sessionCreatedAt = useRef<string | undefined>(undefined);
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string;
    args: Record<string, unknown>;
    resolve: (approved: boolean) => void;
  } | null>(null);

  useEffect(() => {
    agent.setConfirmHandler((toolName, args) => {
      return new Promise<boolean>((resolve) => {
        setPendingConfirm({ toolName, args, resolve });
      });
    });

    if (config.resumeSession) {
      const session = loadSession(config.resumeSession);
      if (session) {
        agent.restoreMessages(session.messages);
        sessionCreatedAt.current = session.meta.createdAt;
        const restored: DisplayMessage[] = session.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : "",
          }));
        setMessages(restored);
      }
    }
  }, [agent, config.resumeSession]);

  useInput((input, key) => {
    if (pendingConfirm) {
      if (input === "y" || input === "Y" || key.return) {
        pendingConfirm.resolve(true);
        setPendingConfirm(null);
      } else if (input === "n" || input === "N" || key.escape) {
        pendingConfirm.resolve(false);
        setPendingConfirm(null);
      }
    }
  });

  const addSystemMsg = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (text === "/exit" || text === "/quit") {
        exit();
        return;
      }
      if (text === "/clear") {
        setMessages([]);
        agent.clearHistory();
        return;
      }
      if (text === "/help") {
        addSystemMsg(
          "**Commands:**\n" +
          "- `/clear` — Clear conversation history\n" +
          "- `/model` — Show current model\n" +
          "- `/cost` — Show token usage stats\n" +
          "- `/compact` — Summarize conversation to save context\n" +
          "- `/sessions` — List saved sessions\n" +
          "- `/review` — Ask Agent to review current git diff\n" +
          "- `/undo` — Undo last checkpoint commit\n" +
          "- `/exit` — Quit\n\n" +
          "**CLI flags:** `--resume <id>`, `-c` (continue last session)",
        );
        return;
      }
      if (text === "/undo") {
        const result = undoCheckpoint();
        addSystemMsg(result ?? "Not a git repository.");
        return;
      }
      if (text.startsWith("/review")) {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setLoading(true);
        setStreamText("");
        let currentText = "";
        try {
          for await (const event of agent.run(
            "Review the current git diff. Use the git_diff tool to see changes, then provide a concise code review with: 1) summary of changes, 2) potential issues, 3) suggestions for improvement.",
          )) {
            if (event.type === "text_delta") {
              currentText += event.content ?? "";
              setStreamText(currentText);
            } else if (event.type === "tool_call_start") {
              if (currentText) {
                setMessages((prev) => [...prev, { role: "assistant", content: currentText }]);
                currentText = "";
                setStreamText("");
              }
              setMessages((prev) => [...prev, { role: "tool_call", content: "", toolCall: event.toolCall, toolStatus: "running" }]);
            } else if (event.type === "tool_result") {
              setMessages((prev) => {
                const updated = [...prev];
                const idx = updated.findLastIndex((m) => m.role === "tool_call" && m.toolCall?.id === event.toolCall?.id);
                if (idx >= 0) updated[idx] = { role: "tool_result", content: event.toolResult ?? "", toolCall: event.toolCall, toolStatus: "done" };
                return updated;
              });
            } else if (event.type === "done" && currentText) {
              setMessages((prev) => [...prev, { role: "assistant", content: currentText }]);
              currentText = "";
              setStreamText("");
            }
          }
        } catch (err) {
          addSystemMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setLoading(false);
          setStreamText("");
          saveSession(sessionId.current, agent.getMessages(), agent.getModel(), sessionCreatedAt.current);
        }
        return;
      }
      if (text === "/sessions") {
        const sessions = listSessions();
        if (sessions.length === 0) {
          addSystemMsg("No saved sessions.");
        } else {
          const lines = sessions.slice(0, 10).map((s) => {
            const date = new Date(s.updatedAt).toLocaleString();
            return `- \`${s.id}\` ${date} (${s.messageCount} msgs) — ${s.summary}`;
          });
          addSystemMsg(`**Recent sessions:**\n${lines.join("\n")}\n\nResume with: \`claude-nano --resume <id>\``);
        }
        return;
      }
      if (text === "/model") {
        addSystemMsg(`Current model: \`${agent.getModel()}\``);
        return;
      }
      if (text === "/cost") {
        const stats = agent.getStats();
        addSystemMsg(
          `**Session stats:**\n` +
          `- Messages: ${stats.messages}\n` +
          `- Tokens: ${stats.tokens.toLocaleString()}\n` +
          `- Context limit: ~${config.maxContextTokens.toLocaleString()}`,
        );
        return;
      }
      if (text === "/compact") {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setLoading(true);
        try {
          let summary = "";
          for await (const event of agent.run(
            "Summarize our conversation so far in a concise paragraph. This will replace the conversation history to save context space.",
          )) {
            if (event.type === "text_delta") summary += event.content ?? "";
          }
          agent.clearHistory();
          addSystemMsg(`**Context compacted.** Summary:\n\n${summary}`);
        } finally {
          setLoading(false);
        }
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setLoading(true);
      setStreamText("");

      let currentText = "";

      try {
        for await (const event of agent.run(text)) {
          switch (event.type) {
            case "text_delta":
              currentText += event.content ?? "";
              setStreamText(currentText);
              break;

            case "tool_call_start":
              if (currentText) {
                setMessages((prev) => [...prev, { role: "assistant", content: currentText }]);
                currentText = "";
                setStreamText("");
              }
              setMessages((prev) => [
                ...prev,
                {
                  role: "tool_call",
                  content: "",
                  toolCall: event.toolCall,
                  toolStatus: "running",
                },
              ]);
              break;

            case "tool_result":
              setMessages((prev) => {
                const updated = [...prev];
                const lastToolIdx = updated.findLastIndex(
                  (m) => m.role === "tool_call" && m.toolCall?.id === event.toolCall?.id,
                );
                if (lastToolIdx >= 0) {
                  updated[lastToolIdx] = {
                    role: "tool_result",
                    content: event.toolResult ?? "",
                    toolCall: event.toolCall,
                    toolStatus: "done",
                  };
                }
                return updated;
              });
              break;

            case "done":
              if (currentText) {
                setMessages((prev) => [...prev, { role: "assistant", content: currentText }]);
                currentText = "";
                setStreamText("");
              }
              break;

            case "error":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${event.content}` },
              ]);
              break;
          }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ]);
      } finally {
        setLoading(false);
        setStreamText("");
        saveSession(sessionId.current, agent.getMessages(), agent.getModel(), sessionCreatedAt.current);
      }
    },
    [agent, exit, config],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">⚡ Claude Nano</Text>
        <Text dimColor> — Type /help for commands, /exit to quit</Text>
      </Box>

      <MessageList messages={messages} />

      {streamText && (
        <Box>
          <Text>{renderStreamingMarkdown(streamText)}</Text>
          <Text dimColor>▋</Text>
        </Box>
      )}

      {loading && !streamText && !pendingConfirm && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Thinking...</Text>
        </Box>
      )}

      {pendingConfirm && (
        <Box flexDirection="column" marginY={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">
            ⚠ Confirm: {pendingConfirm.toolName}
          </Text>
          <Text>
            {formatConfirmationDetail(pendingConfirm.toolName, pendingConfirm.args)}
          </Text>
          <Text dimColor>
            Press <Text bold color="green">y</Text> to approve, <Text bold color="red">n</Text> to deny
          </Text>
        </Box>
      )}

      <InputBar onSubmit={handleSubmit} disabled={loading} />
    </Box>
  );
}
