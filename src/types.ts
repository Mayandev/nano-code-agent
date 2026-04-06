import type OpenAI from "openai";

export type ChatMessage = OpenAI.ChatCompletionMessageParam;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentEvent {
  type: "text_delta" | "tool_call_start" | "tool_call_done" | "tool_result" | "error" | "done";
  content?: string;
  toolCall?: ToolCallInfo;
  toolResult?: string;
}

export interface Config {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  maxContextTokens: number;
  autoApprove: boolean;
}
