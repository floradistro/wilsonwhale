# Lisa CLI

Conversational AI assistant for your business with local file tools.

## Features

- **Streaming responses** - Smooth, real-time text output
- **Local file tools** - Read, Write, Edit, Glob, Grep, Bash, LS
- **Business analytics** - Revenue, inventory, customers, orders
- **Team collaboration** - Location-based team chats
- **Backend-driven menus** - Configurable via database

## Requirements

- Node.js 18+
- macOS, Linux, or WSL

## Installation

```bash
cd lisa-cli
node install.js
```

This installs Lisa to `~/.lisa/app/` and creates a launcher at `~/.local/bin/lisa`.

## Usage

### Single query
```bash
lisa "what are my sales today?"
lisa "read the file package.json"
lisa "list files in current directory"
```

### Interactive mode
```bash
lisa
```

### Commands
```bash
lisa login          # Sign in
lisa logout         # Sign out
lisa whoami         # Show current user
lisa --help         # Show help
lisa --version      # Show version
lisa --new          # Start new conversation
```

## Local Tools

Lisa can execute these tools on your local machine:

| Tool | Description |
|------|-------------|
| Read | Read file contents with line numbers |
| Write | Create or overwrite files |
| Edit | Replace text in files |
| Glob | Find files by pattern |
| Grep | Search file contents |
| Bash | Run shell commands |
| LS | List directory contents |

## Configuration

- Auth: `~/.lisa/auth.json`
- Session: `~/.lisa/session.json`
- Config: `~/.lisa/config.json`

## Version

2.0.0
