# Agent setup instructions

Snippets shown after a gateway API key is created, one builder per tab.

## Source of truth

The Langfuse docs own this content. These builders are a condensed copy:

- API: https://langfuse.com/docs/ai-gateway/get-started
- Claude Code: https://langfuse.com/docs/ai-gateway/coding-agents/claude-code
- Codex: https://langfuse.com/docs/ai-gateway/coding-agents/codex
- OpenCode: https://langfuse.com/docs/ai-gateway/coding-agents/opencode
- Copilot CLI (no Langfuse page yet, follows GitHub's docs):
  https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models
- GitHub Copilot app (no Langfuse page yet, follows GitHub's docs):
  https://docs.github.com/en/copilot/how-tos/github-copilot-app/add-llm-models

Change the docs first (`langfuse/langfuse-docs`), then mirror the change here.
Do not add steps, paths or env vars that the docs do not describe.

## Rules

- Never put the secret key into a snippet. Use `GATEWAY_KEY_PLACEHOLDER`; the
  key is shown and copied only by the key field above the tabs.
- Paths differ per tool (`/anthropic` vs `/anthropic/v1`); keep them as the
  docs list them under "Base URLs at a glance".
- Builders are pure: `(context: AgentSetupContext) => AgentSetupInstructions`.
  `formatAgentSetupMarkdown` renders the same data for "Copy for agent".
