import React from "react";
import { Box, Text } from "ink";
import { DiffView } from "./DiffView.js";
import type { ToolCallInfo } from "../types.js";

interface Props {
  toolCall: ToolCallInfo;
  result?: string;
  status: "running" | "done" | "denied";
}

const DIFF_MARKER = "@@DIFF@@";

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

  let summary = result ?? "";
  let diffPatch: string | null = null;

  if (result && result.includes(DIFF_MARKER)) {
    const idx = result.indexOf(DIFF_MARKER);
    summary = result.slice(0, idx).trim();
    diffPatch = result.slice(idx + DIFF_MARKER.length).trim();
  }

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        <Text dimColor>{icon} </Text>
        <Text color="yellow" bold>{toolCall.name}</Text>
        <Text dimColor>({truncate(argsStr, 100)})</Text>
      </Text>
      {summary && (
        <Box marginLeft={3}>
          <Text dimColor>{truncate(summary, 200)}</Text>
        </Box>
      )}
      {diffPatch && <DiffView patch={diffPatch} />}
    </Box>
  );
}
