# Codex Guidelines for Langfuse

Langfuse is an **open source LLM engineering** platform for developing, monitoring, evaluating and debugging AI applications. See the README for more details.

## Linting
- Run `pnpm run lint` to lint all packages.
- Fix issues automatically with `pnpm run lint:fix`.

## Tests
- Codex cannot run the test suite because it depends on Docker-based infrastructure that is unavailable in this environment.

## Cursor Rules
- Additional folder-specific rules live in `.cursor/rules/`.

## Commits
- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) when crafting commit messages.
