import type { Config, AgentEvent } from "./types.js";
import { Agent } from "./agent.js";

interface HeadlessResult {
  success: boolean;
  response: string;
  tool_calls: Array<{ name: string; result: string }>;
  tokens: number;
}

export async function runHeadless(config: Config, prompt: string): Promise<HeadlessResult> {
  const agent = new Agent(config);
  await agent.initMcp();

  let response = "";
  const toolCalls: Array<{ name: string; result: string }> = [];

  try {
    for await (const event of agent.run(prompt)) {
      switch (event.type) {
        case "text_delta":
          response += event.content ?? "";
          if (!config.jsonOutput) {
            process.stdout.write(event.content ?? "");
          }
          break;
        case "tool_result":
          toolCalls.push({
            name: event.toolCall?.name ?? "unknown",
            result: event.toolResult ?? "",
          });
          break;
        case "error":
          if (!config.jsonOutput) {
            process.stderr.write(`Error: ${event.content}\n`);
          }
          break;
        case "done":
          break;
      }
    }
  } finally {
    await agent.destroy();
  }

  if (!config.jsonOutput && response && !response.endsWith("\n")) {
    process.stdout.write("\n");
  }

  const stats = agent.getStats();
  return {
    success: true,
    response,
    tool_calls: toolCalls,
    tokens: stats.tokens,
  };
}

export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data.trim() || null));
    setTimeout(() => resolve(data.trim() || null), 1000);
  });
}
