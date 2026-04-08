import dotenv from "dotenv";
import type { Config, PermissionMode } from "./types.js";
import { getLastSessionId } from "./session.js";

dotenv.config();

export function loadConfig(): Config {
  const args = process.argv.slice(2);
  const hasFlag = (flag: string) => args.includes(flag);
  const getFlagValue = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1]! : null;
  };

  let resumeSession: string | null = null;
  if (hasFlag("-c") || hasFlag("--continue")) {
    resumeSession = getLastSessionId();
  } else if (hasFlag("--resume")) {
    resumeSession = getFlagValue("--resume");
  }

  const autoApprove = hasFlag("--auto-approve") || hasFlag("-y") || process.env.CLAUDE_NANO_AUTO_APPROVE === "true";
  let permissionMode: PermissionMode = "default";
  if (hasFlag("--plan")) permissionMode = "plan";
  else if (hasFlag("--auto")) permissionMode = "auto";
  else if (hasFlag("--full-access") || autoApprove) permissionMode = "full";

  let prompt: string | null = null;
  if (hasFlag("-p") || hasFlag("--prompt")) {
    prompt = getFlagValue("-p") ?? getFlagValue("--prompt");
  }

  return {
    apiKey: process.env.OPENAI_API_KEY ?? process.env.ARK_API_KEY ?? "",
    baseURL: process.env.OPENAI_BASE_URL ?? process.env.ARK_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.CLAUDE_NANO_MODEL ?? process.env.ARK_MODEL ?? "gpt-4o",
    maxTokens: parseInt(process.env.CLAUDE_NANO_MAX_TOKENS ?? "4096", 10),
    maxContextTokens: parseInt(process.env.CLAUDE_NANO_MAX_CONTEXT ?? "120000", 10),
    autoApprove,
    permissionMode,
    resumeSession,
    prompt,
    jsonOutput: hasFlag("--json"),
  };
}
