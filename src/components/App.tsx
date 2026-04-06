import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { MessageList, type DisplayMessage } from "./MessageList.js";
import { InputBar } from "./InputBar.js";
import { Agent } from "../agent.js";
import { formatConfirmationDetail } from "../permissions.js";
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
  }, [agent]);

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
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Commands: /exit, /clear, /help" },
        ]);
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
      }
    },
    [agent, exit],
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
          <Text color="cyan">{streamText}</Text>
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
