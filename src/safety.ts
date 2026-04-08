import path from "node:path";
import os from "node:os";

const PROTECTED_PATHS = [
  ".git",
  ".ssh",
  ".gnupg",
  ".env",
  ".env.local",
  ".env.production",
];

const PROTECTED_DIRS = [
  os.homedir() + "/.ssh",
  os.homedir() + "/.gnupg",
  "/etc",
  "/usr",
  "/System",
  "/var",
];

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+(-\w*f\w*\s+)?(-\w*r\w*\s+)?\/($|\s)/, reason: "recursive delete on root" },
  { pattern: /rm\s+-\w*rf\b/, reason: "recursive force delete" },
  { pattern: /mkfs\b/, reason: "format filesystem" },
  { pattern: /dd\s+.*of=\/dev\//, reason: "write to raw device" },
  { pattern: /:(){ :|:& };:/, reason: "fork bomb" },
  { pattern: /chmod\s+(-R\s+)?777\b/, reason: "world-writable permissions" },
  { pattern: /curl\s+.*\|\s*(ba)?sh/, reason: "piped remote execution" },
  { pattern: /wget\s+.*\|\s*(ba)?sh/, reason: "piped remote execution" },
  { pattern: /git\s+push\s+.*--force(?!-)/, reason: "force push" },
  { pattern: /git\s+push\s+.*-f\b/, reason: "force push" },
  { pattern: /git\s+reset\s+--hard/, reason: "hard reset (destructive)" },
  { pattern: /git\s+clean\s+-\w*f\w*d/, reason: "force clean untracked" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "write to disk device" },
  { pattern: /shutdown|reboot|poweroff|halt/, reason: "system power command" },
];

export type PermissionMode = "default" | "plan" | "auto" | "full";

export function isPathSafe(filePath: string, cwd: string): { safe: boolean; reason?: string } {
  const resolved = path.resolve(filePath);
  const relative = path.relative(cwd, resolved);

  if (relative.startsWith("..") && !resolved.startsWith(cwd)) {
    return { safe: false, reason: `Path escapes project directory: ${resolved}` };
  }

  for (const protectedDir of PROTECTED_DIRS) {
    if (resolved.startsWith(protectedDir + "/") || resolved === protectedDir) {
      return { safe: false, reason: `Protected system path: ${protectedDir}` };
    }
  }

  const basename = path.basename(resolved);
  const relParts = relative.split(path.sep);
  for (const part of relParts) {
    if (PROTECTED_PATHS.includes(part)) {
      return { safe: false, reason: `Protected path component: ${part}` };
    }
  }
  if (PROTECTED_PATHS.includes(basename)) {
    return { safe: false, reason: `Protected file: ${basename}` };
  }

  return { safe: true };
}

export function checkDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason };
    }
  }
  return { dangerous: false };
}

export function resolvePermissionMode(flags: {
  plan?: boolean;
  auto?: boolean;
  fullAccess?: boolean;
  autoApprove?: boolean;
}): PermissionMode {
  if (flags.plan) return "plan";
  if (flags.fullAccess || flags.autoApprove) return "full";
  if (flags.auto) return "auto";
  return "default";
}

export function shouldAutoApprove(mode: PermissionMode, toolName: string, requiresConfirmation: boolean): boolean {
  switch (mode) {
    case "plan":
      return false;
    case "full":
      return true;
    case "auto":
      return !requiresConfirmation || toolName === "edit_file" || toolName === "write_file";
    case "default":
    default:
      return !requiresConfirmation;
  }
}

export function isBlockedInPlanMode(toolName: string): boolean {
  const blocked = ["write_file", "edit_file", "shell_exec", "git_commit"];
  return blocked.includes(toolName);
}
