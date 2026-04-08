import type OpenAI from "openai";
import type { ToolDefinition } from "../types.js";
import { readFileTool } from "./read_file.js";
import { writeFileTool } from "./write_file.js";
import { editFileTool } from "./edit_file.js";
import { searchTool } from "./search.js";
import { shellExecTool } from "./shell_exec.js";
import { listDirTool } from "./list_dir.js";
import { gitDiffTool, gitLogTool, gitCommitTool } from "./git.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toOpenAITools(): OpenAI.ChatCompletionTool[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: unknown tool "${name}"`;
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(searchTool);
  registry.register(shellExecTool);
  registry.register(listDirTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  registry.register(gitCommitTool);
  return registry;
}
