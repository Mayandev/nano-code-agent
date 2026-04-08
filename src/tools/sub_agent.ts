import OpenAI from "openai";
import type { ToolDefinition, ChatMessage } from "../types.js";
import { ToolRegistry } from "./index.js";

interface SubAgentContext {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  registry: ToolRegistry;
}

let _subAgentContext: SubAgentContext | null = null;

export function setSubAgentContext(ctx: SubAgentContext): void {
  _subAgentContext = ctx;
}

async function runSubAgent(task: string, maxIterations: number): Promise<string> {
  if (!_subAgentContext) {
    return "Error: sub-agent context not initialized";
  }

  const { apiKey, baseURL, model, maxTokens, registry } = _subAgentContext;
  const client = new OpenAI({ apiKey, baseURL });
  const tools = registry.toOpenAITools();

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a focused sub-agent. Complete the given task efficiently using available tools. " +
        "Be concise. Return a clear summary of what you did and the result.",
    },
    { role: "user", content: task },
  ];

  for (let iter = 0; iter < maxIterations; iter++) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
      ...(tools.length > 0 ? { tools } : {}),
    });

    let assistantContent = "";
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) assistantContent += delta.content;

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" });
          }
          const entry = toolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.arguments += tc.function.arguments;
        }
      }
    }

    if (toolCalls.size === 0) {
      return assistantContent || "(sub-agent returned empty response)";
    }

    const sortedCalls = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => tc);

    const openaiToolCalls = sortedCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));

    messages.push({
      role: "assistant",
      content: assistantContent || null,
      tool_calls: openaiToolCalls,
    } as ChatMessage);

    for (const tc of sortedCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        messages.push({ role: "tool", tool_call_id: tc.id, content: "Error: invalid JSON arguments" });
        continue;
      }
      const result = await registry.execute(tc.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return "(sub-agent reached max iterations without completing)";
}

export const subAgentTool: ToolDefinition = {
  name: "sub_agent",
  description:
    "Spawn a sub-agent to handle a focused task independently. " +
    "The sub-agent has access to all the same tools. " +
    "Use for tasks that can run in isolation (research, search, file analysis). " +
    "Returns the sub-agent's final summary.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Clear description of the task for the sub-agent to perform",
      },
      max_iterations: {
        type: "number",
        description: "Maximum tool-use iterations (default: 10)",
      },
    },
    required: ["task"],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const task = String(args.task);
    const maxIterations = Number(args.max_iterations) || 10;
    return runSubAgent(task, maxIterations);
  },
};
