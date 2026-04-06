import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "../types.js";

const execAsync = promisify(exec);

const MAX_OUTPUT = 20000;

export const shellExecTool: ToolDefinition = {
  name: "shell_exec",
  description:
    "Execute a shell command and return its output. " +
    "Commands run in the current working directory. " +
    "Timeout after 30 seconds by default.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      timeout_ms: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
    },
    required: ["command"],
  },
  requiresConfirmation: true,
  execute: async (args) => {
    const timeout = Number(args.timeout_ms) || 30000;
    try {
      const { stdout, stderr } = await execAsync(String(args.command), {
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env },
      });

      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += (output ? "\n--- stderr ---\n" : "") + stderr;
      if (!output) output = "(no output)";

      if (output.length > MAX_OUTPUT) {
        output = output.slice(0, MAX_OUTPUT) + `\n... (truncated, ${output.length} total chars)`;
      }
      return output;
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean };
      if (error.killed) {
        return `Command timed out after ${timeout}ms`;
      }
      let result = `Exit code: ${error.code ?? "unknown"}`;
      if (error.stdout) result += `\n${error.stdout}`;
      if (error.stderr) result += `\n--- stderr ---\n${error.stderr}`;
      return result;
    }
  },
};
