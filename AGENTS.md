# Claude Nano — Agent Guide

Terminal-based code agent, built with TypeScript + Ink (React for CLI) + Bun runtime. Uses OpenAI-compatible API with ReAct-style agent loop and streaming tool calls.

## Architecture

```
src/
├── index.tsx           # Entry — loads config, headless or interactive mode
├── agent.ts            # Core agent loop (ReAct: LLM → tool calls → loop)
├── llm.ts              # OpenAI streaming client wrapper
├── config.ts           # Env vars + CLI flags → Config object
├── context.ts          # Precise token counting (gpt-tokenizer), history trimming, smart truncation
├── types.ts            # Shared types: ChatMessage, ToolDefinition, AgentEvent, Config
├── permissions.ts      # Confirmation logic for dangerous tools
├── safety.ts           # Path restrictions, dangerous command detection, permission modes
├── session.ts          # Session persistence (save/restore/list to ~/.claude-nano/sessions/)
├── system-prompt.ts    # Dynamic system prompt: base + project instructions + git context
├── headless.ts         # Non-interactive mode runner (pipe/prompt/JSON output)
├── mcp.ts              # MCP (Model Context Protocol) client — connect stdio MCP servers
├── utils/
│   └── markdown.ts     # Markdown → ANSI terminal rendering (marked + marked-terminal)
├── components/
│   ├── App.tsx          # Top-level Ink component, orchestrates agent + UI
│   ├── InputBar.tsx     # User text input with slash command auto-completion
│   ├── MessageList.tsx  # Renders conversation messages (with Markdown)
│   ├── ToolCallView.tsx # Renders tool call status + inline diff
│   └── DiffView.tsx     # Colored unified diff display (red/green)
└── tools/
    ├── index.ts         # ToolRegistry class + createDefaultRegistry()
    ├── read_file.ts     # Read file contents (safe)
    ├── write_file.ts    # Create/overwrite files + diff output (requires confirmation)
    ├── edit_file.ts     # Search & replace editing + diff + auto lint check (requires confirmation)
    ├── search.ts        # Grep/ripgrep code search (safe)
    ├── shell_exec.ts    # Shell command execution (requires confirmation)
    ├── list_dir.ts      # List directory contents (safe)
    ├── glob.ts          # Find files by glob pattern (safe)
    ├── lint.ts          # Auto-detect and run project linter (safe)
    ├── git.ts           # Git tools: diff, log, commit + checkpoint/undo
    └── sub_agent.ts     # Spawn sub-agents for parallel task execution
```

## Key Design Decisions

- **Bun runtime** for fast startup (~50ms vs ~500ms with Node+tsx). Bun natively handles TypeScript, `.env` loading, and package management.
- **ESM-only** (`"type": "module"` in package.json). All imports use `.js` extension.
- **Ink 5 + React 18** for terminal UI. Components are functional with hooks.
- **OpenAI SDK v6** — `LLMClient` wraps streaming `chat.completions.create()`. Works with any OpenAI-compatible endpoint (Together, Groq, vLLM, ARK).
- **Tool system** uses a `ToolRegistry` with `ToolDefinition` interface (Registry + Strategy + Factory patterns). Each tool declares `requiresConfirmation`. Adding a tool = create file in `src/tools/`, register in `createDefaultRegistry()`.
- **Diff display** — `edit_file` and `write_file` generate unified diffs via the `diff` library, embedded in tool results with `@@DIFF@@` marker. `DiffView.tsx` renders colored diffs.
- **Markdown rendering** — Assistant messages are rendered with `marked` + `marked-terminal`. Streaming output uses `closeUnclosed()` to auto-close incomplete Markdown constructs (code fences, bold, italic) before rendering.
- **Precise token counting** — Uses `gpt-tokenizer` instead of character heuristics. Smart truncation strategies per tool type (shell favors tail, search limits lines).
- **Safety & sandboxing** — Path restrictions prevent writes outside project dir and to protected paths (.git, .ssh, .env). Dangerous shell commands (rm -rf, force push, etc.) are blocked. Permission modes: `default`, `plan` (read-only), `auto` (approve safe ops), `full` (approve all).
- **Session persistence** — Conversations auto-save to `~/.claude-nano/sessions/`. Resume with `--resume <id>` or `-c` (continue last).
- **Git integration** — System prompt includes current branch, uncommitted changes, recent commits. Git tools for diff/log/commit. Checkpoint/undo via `/review` and `/undo` commands.
- **MCP protocol** — Connects to MCP servers via stdio transport. Configure in `.claude-nano/mcp.json` or `mcp.json`. MCP tools are registered alongside built-in tools.
- **Sub-agents** — `sub_agent` tool spawns independent agent instances for parallel task execution with access to all tools.
- **Headless mode** — `claude-nano -p "task"` or pipe via stdin for non-interactive use. `--json` for structured output.

## Conventions

- TypeScript strict mode. Prefer `type` imports for type-only usage.
- No class inheritance — flat composition. `Agent` owns `LLMClient` + `ToolRegistry` + `McpManager`.
- Agent events are yielded via `AsyncGenerator<AgentEvent>` — the UI consumes the stream.
- Config comes from env vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CLAUDE_NANO_MODEL`, etc.) with fallbacks to `ARK_*` variants.
- Build: `bun build` for production, `bun run` for dev.

## CLI Flags

| Flag | Description |
|------|-------------|
| `-y`, `--auto-approve` | Auto-approve all tool calls |
| `--plan` | Read-only mode, no write operations |
| `--auto` | Auto-approve safe operations (edits, writes) |
| `--full-access` | Full auto-approve (same as `-y`) |
| `-c`, `--continue` | Resume last session |
| `--resume <id>` | Resume specific session |
| `-p "prompt"`, `--prompt "prompt"` | Non-interactive mode |
| `--json` | Output structured JSON (with `-p`) |

## Adding a New Tool

1. Create `src/tools/my_tool.ts` exporting a `ToolDefinition`.
2. Import and register it in `src/tools/index.ts` → `createDefaultRegistry()`.
3. Set `requiresConfirmation: true` if the tool has side effects.
4. Parameters schema follows OpenAI function calling JSON Schema format.

## MCP Configuration

Create `.claude-nano/mcp.json` or `mcp.json` in project root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@my/mcp-server"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

## Development

```bash
bun run dev      # bun run src/index.tsx
bun run build    # bun build → dist/
bun run start    # bun dist/index.js
```

Required env: `OPENAI_API_KEY` (or `ARK_API_KEY`). Bun auto-loads `.env`.

## Skills

Available skills are installed under `.agents/skills/`:

| Skill | Path | Purpose |
|-------|------|---------|
| **skill-creator** | `.agents/skills/skill-creator/SKILL.md` | Create, test, and iterate on new agent skills with eval loops and benchmarking |

Skill lock file: `skills-lock.json` tracks installed skills and their source hashes.
