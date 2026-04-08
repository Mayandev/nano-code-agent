import { exec } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../types.js";

const execAsync = promisify(exec);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectLinter(dir: string): Promise<{ cmd: string; args: string[] } | null> {
  const pkgPath = path.join(dir, "package.json");
  if (await fileExists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};

    if (scripts.lint) {
      return { cmd: "npm", args: ["run", "lint", "--"] };
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.eslint || (await fileExists(path.join(dir, ".eslintrc.js"))) || (await fileExists(path.join(dir, "eslint.config.js")))) {
      return { cmd: "npx", args: ["eslint"] };
    }
  }

  if (await fileExists(path.join(dir, "pyproject.toml")) || await fileExists(path.join(dir, "setup.py"))) {
    try {
      await execAsync("which ruff", { timeout: 3000 });
      return { cmd: "ruff", args: ["check"] };
    } catch {
      try {
        await execAsync("which flake8", { timeout: 3000 });
        return { cmd: "flake8", args: [] };
      } catch {
        return null;
      }
    }
  }

  return null;
}

export const lintTool: ToolDefinition = {
  name: "lint",
  description:
    "Run the project's linter on specific files or the whole project. " +
    "Auto-detects ESLint, Ruff, or Flake8 based on project config. " +
    "Returns linter output with errors and warnings.",
  parameters: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to lint (default: lint entire project)",
      },
      fix: { type: "boolean", description: "Attempt to auto-fix issues (default: false)" },
    },
    required: [],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    const dir = process.cwd();
    const linter = await detectLinter(dir);
    if (!linter) {
      return "No linter detected. Install ESLint, Ruff, or Flake8 and try again.";
    }

    const cmdParts = [linter.cmd, ...linter.args];
    if (args.fix) cmdParts.push("--fix");

    const files = args.files as string[] | undefined;
    if (files && files.length > 0) {
      cmdParts.push(...files.map((f) => path.resolve(String(f))));
    }

    const command = cmdParts.join(" ");

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: dir,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      const output = (stdout + (stderr ? "\n" + stderr : "")).trim();
      return output || "No lint issues found.";
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      const output = ((error.stdout ?? "") + "\n" + (error.stderr ?? "")).trim();
      if (output) return output;
      return `Linter exited with code ${error.code ?? "unknown"}`;
    }
  },
};
