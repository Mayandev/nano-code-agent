import OpenAI from "openai";
import type { ChatMessage, Config } from "./types.js";

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(config: Config) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
  }

  async *chat(
    messages: ChatMessage[],
    tools?: OpenAI.ChatCompletionTool[],
  ): AsyncGenerator<OpenAI.ChatCompletionChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
