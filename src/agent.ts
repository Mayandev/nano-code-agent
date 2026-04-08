import type { ChatMessage, Config, AgentEvent, ToolCallInfo } from "./types.js";
import { LLMClient } from "./llm.js";
import { ToolRegistry, createDefaultRegistry } from "./tools/index.js";
import { countMessagesTokens, trimHistory, truncateToolOutput } from "./context.js";
import { buildSystemPrompt } from "./system-prompt.js";

export class Agent {
  private llm: LLMClient;
  private registry: ToolRegistry;
  private messages: ChatMessage[] = [];
  private config: Config;
  private systemPrompt: string;
  private confirmHandler: ((toolName: string, args: Record<string, unknown>) => Promise<boolean>) | null = null;

  constructor(config: Config) {
    this.config = config;
    this.llm = new LLMClient(config);
    this.registry = createDefaultRegistry();
    this.systemPrompt = buildSystemPrompt(process.cwd());
    this.messages.push({ role: "system", content: this.systemPrompt });
  }

  setConfirmHandler(handler: (toolName: string, args: Record<string, unknown>) => Promise<boolean>): void {
    this.confirmHandler = handler;
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  clearHistory(): void {
    this.messages = [{ role: "system", content: this.systemPrompt }];
  }

  getModel(): string {
    return this.config.model;
  }

  getStats(): { messages: number; tokens: number } {
    return {
      messages: this.messages.length,
      tokens: countMessagesTokens(this.messages),
    };
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    this.messages.push({ role: "user", content: userMessage });

    while (true) {
      this.messages = trimHistory(this.messages, this.config.maxContextTokens);
      const tools = this.registry.toOpenAITools();
      let assistantContent = "";
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

      for await (const chunk of this.llm.chat(this.messages, tools)) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta.content) {
          assistantContent += delta.content;
          yield { type: "text_delta", content: delta.content };
        }

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

        if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
          break;
        }
      }

      if (toolCalls.size === 0) {
        this.messages.push({ role: "assistant", content: assistantContent });
        yield { type: "done" };
        return;
      }

      const sortedCalls = [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => tc);

      const openaiToolCalls = sortedCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

      this.messages.push({
        role: "assistant",
        content: assistantContent || null,
        tool_calls: openaiToolCalls,
      } as ChatMessage);

      for (const tc of sortedCalls) {
        const toolInfo: ToolCallInfo = {
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        };
        yield { type: "tool_call_start", toolCall: toolInfo };

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          const errResult = `Error: invalid JSON arguments: ${tc.arguments}`;
          this.messages.push({ role: "tool", tool_call_id: tc.id, content: errResult });
          yield { type: "tool_result", toolCall: toolInfo, toolResult: errResult };
          continue;
        }

        const toolDef = this.registry.get(tc.name);
        if (toolDef?.requiresConfirmation && !this.config.autoApprove && this.confirmHandler) {
          const approved = await this.confirmHandler(tc.name, args);
          if (!approved) {
            const denied = "Tool call denied by user.";
            this.messages.push({ role: "tool", tool_call_id: tc.id, content: denied });
            yield { type: "tool_result", toolCall: toolInfo, toolResult: denied };
            continue;
          }
        }

        const rawResult = await this.registry.execute(tc.name, args);
        const result = truncateToolOutput(rawResult, 8000, tc.name);
        this.messages.push({ role: "tool", tool_call_id: tc.id, content: result });

        yield { type: "tool_call_done", toolCall: toolInfo };
        yield { type: "tool_result", toolCall: toolInfo, toolResult: result };
      }
    }
  }
}
