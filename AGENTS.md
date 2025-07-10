# Codex Guidelines for Langfuse

Langfuse is an **open source LLM engineering** platform for developing, monitoring, evaluating and debugging AI applications. See the README for more details.

## Linting
- Run `pnpm run lint` to lint all packages.
- Fix issues automatically with `pnpm run lint:fix`.

## Tests
- Codex cannot run the test suite because it depends on Docker-based infrastructure that is unavailable in this environment.
- When writing tests, focus on decoupling each `it` or `test` block to ensure that they can run independently and concurrently. Tests must never depend on the action or outcome of previous or subsequent tests.
- When writing tests, especially in the __tests__/async directory, ensure that you avoid `pruneDatabase` calls.

## Cursor Rules
- Additional folder-specific rules live in `.cursor/rules/`.

## Commits
- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) when crafting commit messages.
