import { encode } from "gpt-tokenizer";
import type { ChatMessage } from "./types.js";

export function countTokens(text: string): number {
  return encode(text).length;
}

export function countMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += countTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          total += countTokens(part.text);
        }
      }
    }
    total += 4; // per-message overhead (role, separators)
  }
  return total;
}

export function truncateToolOutput(output: string, maxChars = 8000, toolName?: string): string {
  if (output.length <= maxChars) return output;

  const omitted = output.length - maxChars;
  const note = `\n\n... (${omitted} characters omitted) ...\n\n`;

  if (toolName === "shell_exec") {
    const tailSize = Math.floor(maxChars * 0.8);
    const headSize = maxChars - tailSize;
    return output.slice(0, headSize) + note + output.slice(-tailSize);
  }

  if (toolName === "search") {
    const lines = output.split("\n");
    const maxLines = 50;
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join("\n") + `\n\n... (${lines.length - maxLines} more lines) ...`;
    }
  }

  const headSize = Math.floor(maxChars * 0.7);
  const tailSize = Math.floor(maxChars * 0.2);
  return output.slice(0, headSize) + note + output.slice(-tailSize);
}

export function trimHistory(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const system = messages[0];
  if (!system || system.role !== "system") return messages;

  const currentTokens = countMessagesTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  const result: ChatMessage[] = [system];
  const rest = messages.slice(1);

  let tokensUsed = countMessagesTokens([system]);
  const keep: ChatMessage[] = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i]!;
    const msgTokens = countMessagesTokens([msg]);
    if (tokensUsed + msgTokens > maxTokens) break;
    tokensUsed += msgTokens;
    keep.unshift(msg);
  }

  if (keep.length < rest.length) {
    const dropped = rest.length - keep.length;
    result.push({
      role: "system",
      content: `[Context trimmed: ${dropped} earlier messages removed to fit context window]`,
    });
  }

  result.push(...keep);
  return result;
}
