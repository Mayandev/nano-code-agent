import dotenv from "dotenv";
import type { Config } from "./types.js";

dotenv.config();

export function loadConfig(): Config {
  const args = process.argv.slice(2);
  const hasFlag = (flag: string) => args.includes(flag);

  return {
    apiKey: process.env.OPENAI_API_KEY ?? process.env.ARK_API_KEY ?? "",
    baseURL: process.env.OPENAI_BASE_URL ?? process.env.ARK_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.CLAUDE_NANO_MODEL ?? process.env.ARK_MODEL ?? "gpt-4o",
    maxTokens: parseInt(process.env.CLAUDE_NANO_MAX_TOKENS ?? "4096", 10),
    maxContextTokens: parseInt(process.env.CLAUDE_NANO_MAX_CONTEXT ?? "120000", 10),
    autoApprove: hasFlag("--auto-approve") || hasFlag("-y") || process.env.CLAUDE_NANO_AUTO_APPROVE === "true",
  };
}
