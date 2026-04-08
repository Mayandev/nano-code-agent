import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createPatch } from "diff";
import type { ToolDefinition } from "../types.js";

const execAsync = promisify(exec);

async function quickLintCheck(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath);
  try {
    if (ext === ".ts" || ext === ".tsx") {
      await execAsync(`npx tsc --noEmit --pretty ${filePath}`, { timeout: 15000, cwd: path.dirname(filePath) });
    } else if (ext === ".py") {
      await execAsync(`python3 -c "import py_compile; py_compile.compile('${filePath}', doraise=True)"`, { timeout: 5000 });
    } else {
      return null;
    }
    return null;
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    const output = ((error.stdout ?? "") + "\n" + (error.stderr ?? "")).trim();
    return output || null;
  }
}

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

    const patch = createPatch(filePath, content, updated, "", "", { context: 3 });
    await fs.writeFile(filePath, updated, "utf-8");

    let result = `Replaced ${count} occurrence(s) in ${filePath}`;
    const lintErrors = await quickLintCheck(filePath);
    if (lintErrors) {
      result += `\n\n⚠ Lint/compile issues:\n${lintErrors}`;
    }
    return `${result}\n\n@@DIFF@@\n${patch}`;
  },
};
