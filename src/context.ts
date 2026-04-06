import type { ChatMessage } from "./types.js";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ("text" in part && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
      }
    }
    total += 4; // overhead per message (role, etc.)
  }
  return total;
}

export function truncateToolOutput(output: string, maxChars = 8000): string {
  if (output.length <= maxChars) return output;

  const headSize = Math.floor(maxChars * 0.7);
  const tailSize = Math.floor(maxChars * 0.2);
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  const omitted = output.length - headSize - tailSize;

  return `${head}\n\n... (${omitted} characters omitted) ...\n\n${tail}`;
}

export function trimHistory(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const system = messages[0];
  if (!system || system.role !== "system") return messages;

  const currentTokens = estimateMessagesTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  const result: ChatMessage[] = [system];
  const rest = messages.slice(1);

  let tokensUsed = estimateMessagesTokens([system]);
  const keep: ChatMessage[] = [];

  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i]!;
    const msgTokens = estimateMessagesTokens([msg]);
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
