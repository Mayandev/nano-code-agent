import React from "react";
import { Box, Text } from "ink";
import type { ToolCallInfo } from "../types.js";

interface Props {
  toolCall: ToolCallInfo;
  result?: string;
  status: "running" | "done" | "denied";
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

function formatArgs(argsJson: string): string {
  try {
    const args = JSON.parse(argsJson);
    const parts: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      const v = typeof value === "string" ? truncate(value, 60) : JSON.stringify(value);
      parts.push(`${key}=${v}`);
    }
    return parts.join(", ");
  } catch {
    return argsJson;
  }
}

export function ToolCallView({ toolCall, result, status }: Props) {
  const icon = status === "running" ? "⏳" : status === "denied" ? "🚫" : "✅";
  const argsStr = formatArgs(toolCall.arguments);

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        <Text dimColor>{icon} </Text>
        <Text color="yellow" bold>{toolCall.name}</Text>
        <Text dimColor>({truncate(argsStr, 100)})</Text>
      </Text>
      {result && (
        <Box marginLeft={3}>
          <Text dimColor>{truncate(result, 200)}</Text>
        </Box>
      )}
    </Box>
  );
}
