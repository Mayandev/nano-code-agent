import fs from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Edit a file by replacing an exact string match with new content. " +
    "The old_string must match exactly (including whitespace/indentation). " +
    "Set replace_all to true to replace all occurrences.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file" },
      old_string: { type: "string", description: "Exact string to find and replace" },
      new_string: { type: "string", description: "Replacement string" },
      replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  requiresConfirmation: true,
  execute: async (args) => {
    const filePath = path.resolve(String(args.file_path));
    const content = await fs.readFile(filePath, "utf-8");
    const oldStr = String(args.old_string);
    const newStr = String(args.new_string);

    if (!content.includes(oldStr)) {
      return `Error: old_string not found in ${filePath}. Make sure it matches exactly.`;
    }

    let updated: string;
    let count: number;
    if (args.replace_all) {
      count = content.split(oldStr).length - 1;
      updated = content.replaceAll(oldStr, newStr);
    } else {
      const occurrences = content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return `Error: old_string has ${occurrences} occurrences. Use replace_all or provide more context to make it unique.`;
      }
      count = 1;
      updated = content.replace(oldStr, newStr);
    }

    await fs.writeFile(filePath, updated, "utf-8");
    return `Replaced ${count} occurrence(s) in ${filePath}`;
  },
};
