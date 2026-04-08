import { execSync } from "node:child_process";
import type { ToolDefinition } from "../types.js";

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { encoding: "utf-8", timeout: 10000 }).trim();
}

function isGitRepo(): boolean {
  try {
    git("rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description:
    "Show git diff. Without arguments, shows unstaged changes. " +
    "Use target='staged' for staged changes, or target='branch_name' to diff against a branch.",
  parameters: {
    type: "object",
    properties: {
      target: { type: "string", description: "Optional: 'staged', branch name, or commit ref" },
      file_path: { type: "string", description: "Optional: limit diff to a specific file" },
    },
    required: [],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    if (!isGitRepo()) return "Error: not a git repository.";

    let cmd = "diff";
    const target = args.target ? String(args.target) : "";
    if (target === "staged") {
      cmd += " --cached";
    } else if (target) {
      cmd += ` ${target}`;
    }
    if (args.file_path) {
      cmd += ` -- ${String(args.file_path)}`;
    }

    const result = git(cmd);
    return result || "(no changes)";
  },
};

export const gitLogTool: ToolDefinition = {
  name: "git_log",
  description:
    "Show recent git commit history. Returns the last N commits (default 10).",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "Number of commits to show (default: 10)" },
      oneline: { type: "boolean", description: "One-line format (default: true)" },
      file_path: { type: "string", description: "Optional: show commits for a specific file" },
    },
    required: [],
  },
  requiresConfirmation: false,
  execute: async (args) => {
    if (!isGitRepo()) return "Error: not a git repository.";

    const count = Number(args.count) || 10;
    const oneline = args.oneline !== false;
    let cmd = `log -${count}`;
    if (oneline) cmd += " --oneline";
    if (args.file_path) cmd += ` -- ${String(args.file_path)}`;

    return git(cmd) || "(no commits)";
  },
};

export const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description:
    "Stage and commit changes. By default stages all changes. " +
    "Provide files array to stage specific files only.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message" },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to stage (default: all changes)",
      },
    },
    required: ["message"],
  },
  requiresConfirmation: true,
  execute: async (args) => {
    if (!isGitRepo()) return "Error: not a git repository.";

    const message = String(args.message);
    const files = Array.isArray(args.files) ? args.files.map(String) : null;

    if (files && files.length > 0) {
      git(`add ${files.join(" ")}`);
    } else {
      git("add -A");
    }

    git(`commit -m "${message.replace(/"/g, '\\"')}"`);
    const result = git("log -1 --oneline");
    return `Committed: ${result}`;
  },
};

export function createCheckpoint(label: string): string | null {
  if (!isGitRepo()) return null;
  try {
    const status = git("status --porcelain");
    if (!status) return null;
    git("add -A");
    git(`commit -m "checkpoint: ${label}" --no-verify`);
    return git("rev-parse --short HEAD");
  } catch {
    return null;
  }
}

export function undoCheckpoint(): string | null {
  if (!isGitRepo()) return null;
  try {
    const lastMsg = git("log -1 --format=%s");
    if (!lastMsg.startsWith("checkpoint:")) {
      return "Error: last commit is not a checkpoint, refusing to undo.";
    }
    git("reset --soft HEAD~1");
    git("reset HEAD .");
    return "Checkpoint undone. Changes are back as unstaged.";
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
