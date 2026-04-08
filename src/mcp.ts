import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDefinition } from "./types.js";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

export class McpManager {
  private connections: McpConnection[] = [];

  async connect(server: McpServerConfig): Promise<string[]> {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
    });

    const client = new Client(
      { name: "claude-nano", version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    this.connections.push({ name: server.name, client, transport });

    const { tools } = await client.listTools();
    return tools.map((t) => t.name);
  }

  getTools(): ToolDefinition[] {
    const result: ToolDefinition[] = [];

    for (const conn of this.connections) {
      const fetchToolsSync = this._cachedTools.get(conn.name) ?? [];
      for (const tool of fetchToolsSync) {
        const serverName = conn.name;
        result.push({
          name: `mcp_${serverName}_${tool.name}`,
          description: `[MCP: ${serverName}] ${tool.description ?? tool.name}`,
          parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
          requiresConfirmation: true,
          execute: async (args: Record<string, unknown>) => {
            return this.callTool(serverName, tool.name, args);
          },
        });
      }
    }

    return result;
  }

  private _cachedTools = new Map<string, Array<{ name: string; description?: string; inputSchema?: unknown }>>();

  async refreshTools(): Promise<void> {
    for (const conn of this.connections) {
      const { tools } = await conn.client.listTools();
      this._cachedTools.set(conn.name, tools);
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const conn = this.connections.find((c) => c.name === serverName);
    if (!conn) return `Error: MCP server "${serverName}" not found`;

    try {
      const result = await conn.client.callTool({ name: toolName, arguments: args });
      if (result.content && Array.isArray(result.content)) {
        return result.content
          .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text ?? "" : JSON.stringify(c)))
          .join("\n");
      }
      return JSON.stringify(result);
    } catch (err) {
      return `MCP tool error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async disconnectAll(): Promise<void> {
    for (const conn of this.connections) {
      try {
        await conn.transport.close();
      } catch {
        // ignore cleanup errors
      }
    }
    this.connections = [];
  }

  get serverCount(): number {
    return this.connections.length;
  }
}

export async function loadMcpConfig(configPath?: string): Promise<McpServerConfig[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");

  const candidates = configPath
    ? [configPath]
    : [
        path.join(process.cwd(), ".claude-nano", "mcp.json"),
        path.join(process.cwd(), "mcp.json"),
        path.join(os.homedir(), ".claude-nano", "mcp.json"),
      ];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, "utf-8");
      const config = JSON.parse(content);
      if (config.servers && Array.isArray(config.servers)) {
        return config.servers;
      }
      if (config.mcpServers && typeof config.mcpServers === "object") {
        return Object.entries(config.mcpServers).map(([name, cfg]: [string, any]) => ({
          name,
          command: cfg.command,
          args: cfg.args,
          env: cfg.env,
        }));
      }
    } catch {
      continue;
    }
  }

  return [];
}
