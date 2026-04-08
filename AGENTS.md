# Claude Nano — Agent Guide

Terminal-based code agent, built with TypeScript + Ink (React for CLI) + Bun runtime. Uses OpenAI-compatible API with ReAct-style agent loop and streaming tool calls.

## Architecture

```
src/
├── index.tsx           # Entry — loads config, renders Ink <App>
├── agent.ts            # Core agent loop (ReAct: LLM → tool calls → loop)
├── llm.ts              # OpenAI streaming client wrapper
├── config.ts           # Env vars + CLI flags → Config object
├── context.ts          # Token estimation, history trimming, output truncation
├── types.ts            # Shared types: ChatMessage, ToolDefinition, AgentEvent, Config
├── permissions.ts      # Confirmation logic for dangerous tools
├── utils/
│   └── markdown.ts     # Markdown → ANSI terminal rendering (marked + marked-terminal)
├── components/
│   ├── App.tsx          # Top-level Ink component, orchestrates agent + UI
│   ├── InputBar.tsx     # User text input
│   ├── MessageList.tsx  # Renders conversation messages (with Markdown)
│   ├── ToolCallView.tsx # Renders tool call status + inline diff
│   └── DiffView.tsx     # Colored unified diff display (red/green)
└── tools/
    ├── index.ts         # ToolRegistry class + createDefaultRegistry()
    ├── read_file.ts     # Read file contents (safe)
    ├── write_file.ts    # Create/overwrite files + diff output (requires confirmation)
    ├── edit_file.ts     # Search & replace editing + diff output (requires confirmation)
    ├── search.ts        # Grep/ripgrep code search (safe)
    ├── shell_exec.ts    # Shell command execution (requires confirmation)
    └── list_dir.ts      # List directory contents (safe)
```

## Key Design Decisions

- **Bun runtime** for fast startup (~50ms vs ~500ms with Node+tsx). Bun natively handles TypeScript, `.env` loading, and package management.
- **ESM-only** (`"type": "module"` in package.json). All imports use `.js` extension.
- **Ink 5 + React 18** for terminal UI. Components are functional with hooks.
- **OpenAI SDK v6** — `LLMClient` wraps streaming `chat.completions.create()`. Works with any OpenAI-compatible endpoint (Together, Groq, vLLM, ARK).
- **Tool system** uses a `ToolRegistry` with `ToolDefinition` interface (Registry + Strategy + Factory patterns). Each tool declares `requiresConfirmation`. Adding a tool = create file in `src/tools/`, register in `createDefaultRegistry()`.
- **Diff display** — `edit_file` and `write_file` generate unified diffs via the `diff` library, embedded in tool results with `@@DIFF@@` marker. `DiffView.tsx` renders colored diffs.
- **Markdown rendering** — Assistant messages are rendered with `marked` + `marked-terminal`. Streaming output uses `closeUnclosed()` to auto-close incomplete Markdown constructs (code fences, bold, italic) before rendering.
- **Context management** trims oldest messages when exceeding `maxContextTokens`, keeps system prompt intact. Token estimation uses 4 chars/token heuristic.
- **Permission model** — tools flagged `requiresConfirmation: true` prompt the user (y/n) unless `--auto-approve` / `-y` is set.

## Conventions

- TypeScript strict mode. Prefer `type` imports for type-only usage.
- No class inheritance — flat composition. `Agent` owns `LLMClient` + `ToolRegistry`.
- Agent events are yielded via `AsyncGenerator<AgentEvent>` — the UI consumes the stream.
- Config comes from env vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CLAUDE_NANO_MODEL`, etc.) with fallbacks to `ARK_*` variants.
- Build: `bun build` for production, `bun run` for dev.

## Adding a New Tool

1. Create `src/tools/my_tool.ts` exporting a `ToolDefinition`.
2. Import and register it in `src/tools/index.ts` → `createDefaultRegistry()`.
3. Set `requiresConfirmation: true` if the tool has side effects.
4. Parameters schema follows OpenAI function calling JSON Schema format.

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
