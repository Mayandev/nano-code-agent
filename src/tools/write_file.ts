import fs from "node:fs/promises";
import path from "node:path";
import { createPatch } from "diff";
import type { ToolDefinition } from "../types.js";

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Create or overwrite a file with the given content. " +
    "Parent directories are created automatically.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to the file" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["file_path", "content"],
  },
  requiresConfirmation: true,
  execute: async (args) => {
    const filePath = path.resolve(String(args.file_path));
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let oldContent = "";
    try {
      oldContent = await fs.readFile(filePath, "utf-8");
    } catch {
      // new file
    }

    const newContent = String(args.content);
    await fs.writeFile(filePath, newContent, "utf-8");
    const lines = newContent.split("\n").length;

    const patch = createPatch(filePath, oldContent, newContent, "", "", { context: 3 });
    return `Written ${lines} lines to ${filePath}\n\n@@DIFF@@\n${patch}`;
  },
};
