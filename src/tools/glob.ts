import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

const execFileAsync = promisify(execFile);

async function globWithFind(pattern: string, dir: string, maxResults: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("find", [dir, "-name", pattern, "-not", "-path", "*/.git/*", "-not", "-path", "*/node_modules/*"], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    const files = stdout.trim().split("\n").filter(Boolean);
    return files.slice(0, maxResults);
  } catch {
    return [];
  }
}

async function walkDir(dir: string, pattern: RegExp, results: string[], maxResults: number, depth = 0): Promise<void> {
  if (depth > 8 || results.length >= maxResults) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, pattern, results, maxResults, depth + 1);
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // permission denied, etc.
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export const globTool: ToolDefinition = {
  name: "glob",
  description:
    "Find files matching a glob pattern (e.g. '*.ts', 'test_*.py'). " +
    "Searches recursively from a directory, skipping .git and node_modules. " +
    "Returns matching file paths.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern to match filenames (e.g. '*.ts', '*.test.js')" },
      directory: { type: "string", description: "Directory to search in (default: cwd)" },
      max_results: { type: "number", description: "Maximum number of results (default: 100)" },
    },
    required: ["pattern"],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const dir = path.resolve(String(args.directory || "."));
    const pattern = String(args.pattern);
    const maxResults = Number(args.max_results) || 100;

    let files: string[];
    try {
      files = await globWithFind(pattern, dir, maxResults);
    } catch {
      const regex = globToRegex(pattern);
      const results: string[] = [];
      await walkDir(dir, regex, results, maxResults);
      files = results;
    }

    if (files.length === 0) return "No files found matching pattern.";

    const relative = files.map((f) => path.relative(dir, f)).sort();
    let output = relative.join("\n");
    if (files.length >= maxResults) {
      output += `\n\n(results capped at ${maxResults})`;
    }
    return output;
  },
};
