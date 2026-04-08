import React from "react";
import { Box, Text } from "ink";
import { ToolCallView } from "./ToolCallView.js";
import { renderMarkdown } from "../utils/markdown.js";
import type { ToolCallInfo } from "../types.js";

export interface DisplayMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolCall?: ToolCallInfo;
  toolStatus?: "running" | "done" | "denied";
}

interface Props {
  messages: DisplayMessage[];
}

export function MessageList({ messages }: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((msg, i) => (
        <MessageView key={i} message={msg} />
      ))}
    </Box>
  );
}

function MessageView({ message }: { message: DisplayMessage }) {
  if (message.role === "user") {
    return (
      <Box>
        <Text bold color="green">❯ </Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  if (message.role === "assistant") {
    return (
      <Box>
        <Text>{renderMarkdown(message.content)}</Text>
      </Box>
    );
  }

  if (message.role === "tool_call" && message.toolCall) {
    return (
      <ToolCallView
        toolCall={message.toolCall}
        status={message.toolStatus ?? "done"}
      />
    );
  }

  if (message.role === "tool_result" && message.toolCall) {
    return (
      <ToolCallView
        toolCall={message.toolCall}
        result={message.content}
        status={message.toolStatus ?? "done"}
      />
    );
  }

  return null;
}
