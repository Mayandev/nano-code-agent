import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a file. Returns the file content with line numbers. " +
    "Optionally specify start_line and end_line to read a range.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file (absolute or relative to cwd)" },
      start_line: { type: "number", description: "Start line number (1-indexed, inclusive)" },
      end_line: { type: "number", description: "End line number (1-indexed, inclusive)" },
    },
    required: ["file_path"],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const filePath = path.resolve(String(args.file_path));
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const start = Math.max(1, Number(args.start_line) || 1);
    const end = Math.min(lines.length, Number(args.end_line) || lines.length);

    const numbered = lines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(6)}|${line}`)
      .join("\n");

    return `File: ${filePath} (${lines.length} lines)\n${numbered}`;
  },
};
