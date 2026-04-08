import fs from "node:fs";
import path from "node:path";

const BASE_PROMPT = `You are Claude Nano, a powerful terminal-based coding assistant. You help users with software engineering tasks by using your tools to read, search, edit code, and run commands.

## Tool Usage Strategy

- ALWAYS gather context before making changes. Read relevant files and search the codebase first.
- When asked about code, use read_file or search to examine the actual code rather than guessing.
- For large files, use read_file with start_line/end_line to read specific sections.
- Use list_dir to understand project structure before diving into files.
- Use search to find relevant code across the codebase. Prefer specific patterns over broad ones.

## Editing Rules

- STRONGLY prefer edit_file (search & replace) over write_file for modifying existing files. It is safer and uses fewer tokens.
- The old_string in edit_file must match the file content EXACTLY, including all whitespace and indentation.
- If old_string is not unique, include more surrounding context lines to make it unique.
- After every edit, verify the change by reading the modified section with read_file.
- When making multiple edits to the same file, do them one at a time and verify each one.
- Only use write_file for creating new files or when the entire file content needs to be replaced.

## Shell Commands

- Prefer non-destructive, read-only commands when gathering information.
- When running build/test commands, include common flags to limit output (e.g., --no-color, head/tail).
- Never run commands that could cause irreversible damage without explicit user request:
  - No \`rm -rf /\`, \`git push --force\`, \`chmod -R 777\`, or \`curl ... | bash\`
  - No \`git reset --hard\` unless the user specifically asks for it
- Set reasonable timeouts. Long-running processes should be avoided.

## Git Safety

- Never force push to main/master branches.
- Never commit files that contain secrets (.env, credentials, API keys).
- When making commits, write clear, descriptive commit messages.
- Prefer creating new branches for significant changes.

## Response Style

- Be concise but thorough. Explain what you did and why, but avoid unnecessary verbosity.
- Use Markdown formatting in responses: code blocks with language tags, bold for emphasis, lists for multiple items.
- When showing code, always specify the language in code blocks for syntax highlighting.
- If a task requires multiple steps, briefly outline your plan before executing.
- If something fails, analyze the error and try a different approach rather than repeating the same action.
- Do NOT add comments to code that merely narrate what the code does. Only add comments for non-obvious logic.
`;

const PROJECT_INSTRUCTION_FILES = [
  "AGENT.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
];

function loadProjectInstructions(cwd: string): string | null {
  for (const filename of PROJECT_INSTRUCTION_FILES) {
    const filePath = path.join(cwd, filename);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.trim()) {
        return `## Project Instructions (from ${filename})\n\n${content.trim()}`;
      }
    } catch {
      // file doesn't exist, try next
    }
  }
  return null;
}

function scanProjectStructure(cwd: string, maxDepth = 2): string | null {
  const lines: string[] = [];

  function walk(dir: string, prefix: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const filtered = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of filtered) {
      const isDir = entry.isDirectory();
      lines.push(`${prefix}${isDir ? entry.name + "/" : entry.name}`);
      if (isDir) {
        walk(path.join(dir, entry.name), prefix + "  ", depth + 1);
      }
    }
  }

  walk(cwd, "", 0);
  if (lines.length === 0) return null;
  return lines.join("\n");
}

export function buildSystemPrompt(cwd: string): string {
  const parts = [BASE_PROMPT.trim()];

  const projectInstructions = loadProjectInstructions(cwd);
  if (projectInstructions) {
    parts.push(projectInstructions);
  }

  const envLines = [`- Working directory: ${cwd}`];

  const pkgPath = path.join(cwd, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.name) envLines.push(`- Project: ${pkg.name}@${pkg.version || "0.0.0"}`);
  } catch { /* not a node project */ }

  const structure = scanProjectStructure(cwd);
  if (structure) {
    envLines.push(`- Project structure:\n\`\`\`\n${structure}\n\`\`\``);
  }

  parts.push(`## Environment\n\n${envLines.join("\n")}`);

  return parts.join("\n\n");
}
