# Claude Nano

A terminal-based code agent powered by LLMs. Similar to Claude Code / Codex CLI.

## Quick Start

```bash
# Set your API key
export OPENAI_API_KEY="sk-..."

# Optional: use a custom endpoint (e.g. together.ai, groq, local vLLM)
export OPENAI_BASE_URL="https://api.openai.com/v1"

# Optional: choose a model
export CLAUDE_NANO_MODEL="gpt-4o"

# Run
npx tsx src/index.tsx
```

## Features

- **Agent Loop**: ReAct-style loop with streaming LLM output + tool calling
- **6 Built-in Tools**: read_file, write_file, edit_file, search, shell_exec, list_dir
- **Ink UI**: React-based terminal interface with colored output and spinners
- **Permission System**: Dangerous operations (write, exec) require confirmation
- **Context Management**: Auto-trims conversation history to fit token limits

## Tools

| Tool | Description | Needs Confirm |
|------|-------------|:---:|
| `read_file` | Read file contents (with line range) | No |
| `write_file` | Create/overwrite files | Yes |
| `edit_file` | Search & replace editing | Yes |
| `search` | Grep/ripgrep code search | No |
| `shell_exec` | Execute shell commands | Yes |
| `list_dir` | List directory contents | No |

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | (required) | API key |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `CLAUDE_NANO_MODEL` | `gpt-4o` | Model name |
| `CLAUDE_NANO_MAX_TOKENS` | `4096` | Max response tokens |
| `CLAUDE_NANO_MAX_CONTEXT` | `120000` | Max context tokens |

## CLI Flags

```bash
npx tsx src/index.tsx --auto-approve  # Skip confirmation prompts
npx tsx src/index.tsx -y              # Same as above
```

## Commands

Type these in the chat:

- `/help` — Show available commands
- `/clear` — Clear conversation history
- `/exit` — Quit

## Development

```bash
npm run dev      # Run with tsx
npm run build    # Build with tsup
npm start        # Run built version
```
