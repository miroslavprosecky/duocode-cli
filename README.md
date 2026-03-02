# DuoCode

**AI Pair Programming CLI — Claude implements, Codex supervises.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org)
[![Windows](https://img.shields.io/badge/Platform-Windows-blue)](https://github.com/miroslavprosecky/duocode-cli/releases)

DuoCode pairs two AI models to write better code. **Claude** (Anthropic) acts as the implementor — it analyzes your codebase, writes code, and uses tools. **Codex/GPT** (OpenAI) acts as the supervisor — it reviews every step and catches issues before they land.

## Features

- **Dual AI workflow** — Claude writes code, Codex reviews it in real time
- **Interactive REPL** — persistent conversation with slash commands
- **One-shot mode** — `duocode ask "..."` for quick tasks
- **3 supervision levels** — issues-only, always, or never
- **Smart tool use** — Claude can read, write, edit files and run shell commands
- **Git integration** — status, diff, commit from within the session
- **Change rollback** — undo all changes from the current session (even without git)
- **Token budget** — respects context window limits automatically
- **Setup wizard** — interactive configuration on first run
- **Standalone .exe** — no Node.js installation required

## Installation

### Windows Installer (recommended)

Download `duocode-installer.exe` from the [latest release](https://github.com/miroslavprosecky/duocode-cli/releases) and run it. It installs to Program Files and adds `duocode` to your PATH.

Or via PowerShell:

```powershell
irm https://www.prosecky.cz/duocode-installer.exe -OutFile "$env:TEMP\duocode-installer.exe"
& "$env:TEMP\duocode-installer.exe"
```

### Standalone executable

Download `duocode.exe` from [releases](https://github.com/miroslavprosecky/duocode-cli/releases) and place it anywhere in your PATH.

### From source

```bash
git clone https://github.com/miroslavprosecky/duocode-cli.git
cd duocode-cli
npm install
npm run build
npm start
```

## Prerequisites

- **Git** installed and in PATH
- **Anthropic API key** ([get one here](https://console.anthropic.com/))
- **OpenAI API key** ([get one here](https://platform.openai.com/api-keys))
- Internet connection

## Quick Start

### First run

```bash
duocode
```

On first launch, the setup wizard will ask for your API keys and preferences. Configuration is saved to `~/.duocode/config.json`.

### One-shot mode

```bash
duocode ask "Add input validation to the signup form"
duocode ask "Fix the memory leak in worker.ts" --supervision always
duocode ask "Explain the authentication flow" --no-implement
```

**Options:**
| Flag | Description |
|------|-------------|
| `-s, --supervision <mode>` | `issues-only` (default), `always`, or `never` |
| `--no-implement` | Analyze only, skip implementation |

### Interactive REPL

```bash
duocode          # start REPL
duocode -v       # verbose mode (debug logging)
```

Type your prompt and DuoCode will analyze, plan, implement, and review — all in one flow.

## REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/config` | View current configuration |
| `/config set` | Edit a config value interactively |
| `/model` | Change Claude or OpenAI model |
| `/mode` | Switch supervision mode |
| `/status` | Show session status |
| `/context` | Rescan project files |
| `/review` | Review current git diff |
| `/commit` | Commit current changes |
| `/rollback` | Undo changes from this session |
| `/clear` | Clear conversation history |
| `/exit` | Exit DuoCode |

## Supervision Modes

| Mode | Behavior |
|------|----------|
| **issues-only** (default) | Codex reviews and comments only when it finds problems |
| **always** | Full Codex review after every implementation step |
| **never** | No supervision — Claude works alone |

## Available Models

### Implementor (Claude)

| Model | ID |
|-------|----|
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Opus 4.6 | `claude-opus-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` |

### Supervisor (OpenAI)

| Model | ID |
|-------|----|
| GPT-5.3 Codex | `gpt-5.3-codex` |
| GPT-5.2 | `gpt-5.2` |
| GPT-5.2 Pro | `gpt-5.2-pro` |
| GPT-4o | `gpt-4o` |
| o3 | `o3` |

## Configuration

**Config file:** `~/.duocode/config.json`

**Environment variables** (override config file):
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

**Settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeModel` | `claude-sonnet-4-6` | Claude model for implementation |
| `codexModel` | `gpt-5.3-codex` | OpenAI model for supervision |
| `supervisionMode` | `issues-only` | When Codex reviews |
| `maxSteps` | `20` | Max implementation steps per prompt |
| `tokenBudget` | `100000` | Max tokens for project context |
| `autoCommit` | `false` | Auto-commit after implementation |
| `theme` | `dark` | Terminal theme (`dark` / `light`) |
| `forwardAnalysis` | `confirm` | Forward Codex feedback to Claude (`auto` / `confirm`) |

## How It Works

```
 You type a prompt
       │
       ▼
 ┌─────────────┐     ┌─────────────┐
 │   Claude     │     │  Codex/GPT  │
 │ (implement)  │◄───►│ (supervise) │
 └──────┬───────┘     └─────────────┘
        │
        ▼
  Tool calls:
  file_read, file_write, file_edit,
  file_list, shell_exec,
  git_status, git_diff, git_commit
        │
        ▼
  Supervisor reviews each step
        │
        ▼
  Issues? ──yes──► Feedback → Claude retries
        │
        no
        │
        ▼
  Summary + offer to commit
```

1. **You** type a prompt (REPL or one-shot)
2. **Claude** analyzes the codebase and creates a plan
3. **Codex** optionally reviews the plan
4. **Implementation loop** — Claude calls tools, Codex reviews each step
5. If issues are found, feedback goes back to Claude (up to `maxSteps` iterations)
6. **Summary** of changes + option to commit

## Building from Source

| Script | Description |
|--------|-------------|
| `npm run build` | TypeScript → `dist/` |
| `npm run bundle` | esbuild → SEA blob → `build/duocode.exe` |
| `npm run build:exe` | `build` + `bundle` combined |
| `npm run build:installer` | Windows installer (requires [Inno Setup 6](https://jrsoftware.org/isinfo.php)) |
| `npm run build:all` | Full build: exe + installer |

The SEA (Single Executable Application) bundles the Node.js runtime with the application code into a single `.exe` — no Node.js installation needed for end users.

## Project Structure

```
bin/duocode.ts              CLI entry point
src/
  cli.ts                    Command definitions (Commander.js)
  index.ts                  DuoCode class — main orchestrator, REPL loop
  config/                   Configuration, setup wizard, Zod schema
  context/                  Project scanning, file reading, gitignore filter
  models/                   ClaudeAdapter + CodexAdapter (API wrappers)
  orchestrator/             Implementation loop, supervisor, dual analysis
  tools/                    Tool registry + handlers (file, shell, git)
  git/                      GitManager, ChangeTracker (rollback)
  ui/                       Terminal output, spinner, stream renderer, diffs
  errors/                   API error handling, rate limiter
  utils/                    Logger, token counter
scripts/                    Build scripts (SEA exe, installer)
installer/                  Inno Setup script
```

## License

[MIT](LICENSE)
