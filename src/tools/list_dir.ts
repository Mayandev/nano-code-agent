import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

export const listDirTool: ToolDefinition = {
  name: "list_dir",
  description:
    "List directory contents. Shows files and subdirectories with their types and sizes.",
  parameters: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Directory path (default: cwd)" },
      recursive: { type: "boolean", description: "List recursively (max 2 levels deep)" },
    },
    required: [],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const dir = path.resolve(String(args.directory || "."));

    async function listLevel(dirPath: string, depth: number): Promise<string[]> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const lines: string[] = [];
      const indent = "  ".repeat(depth);

      const sorted = entries
        .filter((e) => !e.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of sorted) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          lines.push(`${indent}📁 ${entry.name}/`);
          if (args.recursive && depth < 2) {
            lines.push(...(await listLevel(fullPath, depth + 1)));
          }
        } else {
          const stat = await fs.stat(fullPath);
          const size = formatSize(stat.size);
          lines.push(`${indent}📄 ${entry.name} (${size})`);
        }
      }
      return lines;
    }

    const lines = await listLevel(dir, 0);
    return `Directory: ${dir}\n${lines.join("\n")}`;
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
