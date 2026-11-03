# Agent setup instructions

Snippets shown after a gateway API key is created, one builder per tab.

## Source of truth

The Langfuse docs own this content. These builders are a condensed copy:

- API: https://langfuse.com/docs/ai-gateway/get-started/first-request
- Claude Code: https://langfuse.com/docs/ai-gateway/coding-agents/claude-code
- Codex: https://langfuse.com/docs/ai-gateway/coding-agents/codex
- OpenCode: https://langfuse.com/docs/ai-gateway/coding-agents/opencode
- GitHub Copilot CLI and app: https://langfuse.com/docs/ai-gateway/coding-agents/github-copilot

Change the docs first (`langfuse/langfuse-docs`), then mirror the change here.
Do not add steps, paths or env vars that the docs do not describe.

## Rules

- Builders never receive the secret key; they emit `GATEWAY_KEY_PLACEHOLDER`. Right after creation, `StepCodeSection` swaps it for the key at render time (masked until revealed, copied in full). Without a key, `AgentSetupSteps` adds a replace-the-placeholder hint, so step descriptions must not mention the placeholder themselves. "Copy for agent" keeps the placeholder.
- Prefix shell lines that set or write the key (`export`, the Codex heredoc) with a space so shells with `ignorespace` / `HIST_IGNORE_SPACE` skip them in history. Also prefix the first line of every key-bearing snippet: a bracketed multi-line paste is saved as one history entry, and only its first character counts.
- Paths differ per tool (`/anthropic` vs `/anthropic/v1`); keep them as the
  docs list them under "Base URLs at a glance".
- Builders are pure: `(context: AgentSetupContext) => AgentSetupInstructions`.
  `formatAgentSetupMarkdown` renders the same data for "Copy for agent".
