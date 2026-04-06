import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

const execFileAsync = promisify(execFile);

async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function searchWithRg(
  pattern: string,
  dir: string,
  fileGlob?: string,
  caseInsensitive?: boolean,
): Promise<string> {
  const args = ["--line-number", "--no-heading", "--color=never", "--max-count=50"];
  if (caseInsensitive) args.push("--ignore-case");
  if (fileGlob) args.push("--glob", fileGlob);
  args.push(pattern, dir);

  const { stdout } = await execFileAsync("rg", args, {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

async function searchWithGrep(
  pattern: string,
  dir: string,
  fileGlob?: string,
  caseInsensitive?: boolean,
): Promise<string> {
  const args = ["-rn", "--color=never"];
  if (caseInsensitive) args.push("-i");
  if (fileGlob) args.push("--include", fileGlob);
  args.push(pattern, dir);

  const { stdout } = await execFileAsync("grep", args, {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

export const searchTool: ToolDefinition = {
  name: "search",
  description:
    "Search for a pattern in files using ripgrep or grep. " +
    "Returns matching lines with file paths and line numbers. " +
    "Supports regex patterns.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Search pattern (regex)" },
      directory: { type: "string", description: "Directory to search in (default: cwd)" },
      file_glob: { type: "string", description: "File glob filter, e.g. '*.ts'" },
      case_insensitive: { type: "boolean", description: "Case-insensitive search" },
    },
    required: ["pattern"],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const dir = path.resolve(String(args.directory || "."));
    const pattern = String(args.pattern);
    const fileGlob = args.file_glob ? String(args.file_glob) : undefined;
    const caseInsensitive = Boolean(args.case_insensitive);

    try {
      const useRg = await hasCommand("rg");
      const stdout = useRg
        ? await searchWithRg(pattern, dir, fileGlob, caseInsensitive)
        : await searchWithGrep(pattern, dir, fileGlob, caseInsensitive);

      const trimmed = stdout.trim();
      if (!trimmed) return "No matches found.";

      const lines = trimmed.split("\n");
      if (lines.length >= 50) {
        return `${trimmed}\n\n(results capped at 50 matches)`;
      }
      return trimmed;
    } catch (err: unknown) {
      const error = err as { code?: number };
      if (error.code === 1) return "No matches found.";
      throw err;
    }
  },
};
