# Ruler: Centralise Your AI Coding Assistant Instructions

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/intellectronica/ruler) [![npm version](https://img.shields.io/npm/v/@intellectronica/ruler)](https://www.npmjs.com/package/@intellectronica/ruler) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

* **GitHub**: [intellectronica/ruler](https://github.com/intellectronica/ruler)
* **NPM**: [@intellectronica/ruler](https://www.npmjs.com/package/@intellectronica/ruler)

---

> **Beta Research Preview**
> 
> * Please test this version carefully in your environment
> * Report issues at https://github.com/intellectronica/ruler/issues

## Why Ruler?

Managing instructions across multiple AI coding tools becomes complex as your team grows. Different agents (GitHub Copilot, Claude, Cursor, Aider, etc.) require their own configuration files, leading to:

* **Inconsistent guidance** across AI tools
* **Duplicated effort** maintaining multiple config files
* **Context drift** as project requirements evolve
* **Onboarding friction** for new AI tools

Ruler solves this by providing a **single source of truth** for all your AI agent instructions, automatically distributing them to the right configuration files.

## Core Features

* **Centralised Rule Management**: Store all AI instructions in a dedicated `.ruler/` directory using Markdown files
* **Automatic Distribution**: Ruler applies these rules to configuration files of supported AI agents
* **Targeted Agent Configuration**: Fine-tune which agents are affected and their specific output paths via `ruler.toml`
* **MCP Server Propagation**: Manage and distribute Model Context Protocol (MCP) server settings
* **`.gitignore` Automation**: Keeps generated agent config files out of version control automatically
* **Simple CLI**: Easy-to-use commands for initialising and applying configurations

## Supported AI Agents

| Agent            | File(s) Created/Updated                                   |
| ---------------- | --------------------------------------------------------- |
| GitHub Copilot   | .github/copilot-instructions.md                           |
| Claude Code      | CLAUDE.md                                                 |
| OpenAI Codex CLI | AGENTS.md                                                 |
| Cursor           | .cursor/rules/ruler\_cursor\_instructions.md              |
| Windsurf         | .windsurf/rules/ruler\_windsurf\_instructions.md          |
| Cline            | .clinerules                                               |
| Aider            | ruler\_aider\_instructions.md and .aider.conf.yml         |
| Firebase Studio  | .idx/airules.md                                           |
| Open Hands       | .openhands/microagents/repo.md and .openhands/config.toml |

## Getting Started

### Prerequisites

Node.js 18.x or higher is required.

### Installation

**Global Installation (Recommended for CLI use):**

```bash
npm install -g @intellectronica/ruler
```

**Using `npx` (for one-off commands):**

```bash
npx @intellectronica/ruler apply
```

### Project Initialisation

1. Navigate to your project's root directory
2. Run `ruler init`
3. This creates:
   * `.ruler/` directory
   * `.ruler/instructions.md`: A starter Markdown file for your rules
   * `.ruler/ruler.toml`: The main configuration file for Ruler
   * `.ruler/mcp.json`: An example MCP server configuration

## Quick Start

```bash
# Initialize Ruler in your project
cd your-project
ruler init

# Edit the generated files
# - Add your coding guidelines to .ruler/instructions.md
# - Customize .ruler/ruler.toml if needed

# Apply rules to all AI agents
ruler apply

# Apply rules with verbose output
ruler apply --verbose

# Apply rules to specific agents only
ruler apply --agents copilot,claude
```

## Configuration

### The `.ruler/` Directory

This is your central hub for all AI agent instructions:

* **Rule Files (`*.md`)**: Discovered recursively from `.ruler/` and alphabetically concatenated
* **Concatenation Marker**: Each file's content is prepended with `--- Source: <relative_path_to_md_file> ---` for traceability
* **`ruler.toml`**: Master configuration for Ruler's behavior, agent selection, and output paths
* **`mcp.json`**: Shared MCP server settings

### Example Configuration

```toml
# Default agents to run when --agents is not specified
default_agents = ["copilot", "claude", "cursor"]

# Global MCP Server Configuration
[mcp]
enabled = true
merge_strategy = "merge"

# Global .gitignore Configuration
[gitignore]
enabled = true

# Agent-Specific Configurations
[agents.copilot]
enabled = true
output_path = ".github/copilot-instructions.md"

[agents.claude]
enabled = true
output_path = "CLAUDE.md"

[agents.cursor]
enabled = true
output_path = ".cursor/rules/ruler_cursor_instructions.md"

# Agent-specific MCP configuration
[agents.cursor.mcp]
enabled = true
merge_strategy = "merge"
```

## CLI Usage

### Primary Commands

```bash
# Initialize Ruler in the current project
ruler init [--project-root <path>]

# Apply rules to AI agents
ruler apply [options]
```

### Apply Command Options

| Option                        | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| `--project-root <path>`       | Path to your project's root (default: current directory)  |
| `--agents <agent1,agent2,...>` | Comma-separated list of agent names to target             |
| `--config <path>`             | Path to a custom ruler.toml configuration file            |
| `--mcp / --with-mcp`          | Enable applying MCP server configurations (default: true) |
| `--no-mcp`                    | Disable applying MCP server configurations                |
| `--mcp-overwrite`             | Overwrite native MCP config entirely instead of merging   |
| `--gitignore`                 | Enable automatic .gitignore updates (default: true)       |
| `--no-gitignore`              | Disable automatic .gitignore updates                      |
| `--verbose / -v`              | Display detailed output during execution                  |

## Development

### Building from Source

```bash
git clone https://github.com/intellectronica/ruler.git
cd ruler
npm install
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Quality

```bash
# Run linting
npm run lint

# Run formatting
npm run format
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

For bugs and feature requests, please open an issue.

## License

MIT

---

© Eleanor Berger  
[ai.intellectronica.net](https://ai.intellectronica.net)