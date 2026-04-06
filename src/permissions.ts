import type { ToolDefinition } from "./types.js";

export function needsConfirmation(tool: ToolDefinition | undefined, autoApprove: boolean): boolean {
  if (autoApprove) return false;
  if (!tool) return true;
  return tool.requiresConfirmation;
}

export function formatConfirmationDetail(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "write_file":
      return `Write to: ${args.file_path}`;
    case "edit_file":
      return `Edit: ${args.file_path}\n  Replace: "${truncStr(String(args.old_string))}" → "${truncStr(String(args.new_string))}"`;
    case "shell_exec":
      return `Execute: ${args.command}`;
    default:
      return JSON.stringify(args, null, 2);
  }
}

function truncStr(s: string, max = 80): string {
  const oneLine = s.replace(/\n/g, "\\n");
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}
