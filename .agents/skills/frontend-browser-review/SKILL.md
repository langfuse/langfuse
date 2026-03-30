---
name: frontend-browser-review
description: |
  Shared workflow for browser-based review of user-visible frontend changes in Langfuse.
  Use when a change affects UI behavior, layout, styling, navigation, or browser-visible
  regressions and should be checked with the Playwright MCP server before signoff.
---

# Frontend Browser Review

Use this skill when a change affects what users see or do in the browser.

## Start Here

- Read [`../../../web/AGENTS.md`](../../../web/AGENTS.md) for web-specific
  entry points and test commands.
- Use the workspace `playwright` MCP server configured from the repo-owned
  shared agent setup.

## When To Use It

- UI changes in `web/**`
- Layout, styling, or responsive behavior changes
- Changes to navigation or page flows
- Bug fixes where the failure mode is visible in the browser
- Final signoff for user-visible frontend work

## Review Loop

1. Start the app with `pnpm run dev:web` unless an existing local server is
   already running.
2. Install Chromium with `pnpm run playwright:install` if Playwright has not
   been set up on the machine yet.
3. Open the primary changed flow with the Playwright MCP server.
4. Exercise the main happy path affected by the change.
5. Check for obvious visual regressions:
   - broken layout or spacing
   - banner overlap or viewport anchoring issues
   - missing loading, empty, or error states
   - broken responsive behavior on narrow widths
6. If the page changed materially, inspect the resulting UI state and compare
   it against the intended behavior from the task or existing patterns.
7. If the browser session fails, inspect traces and artifacts under
   `.playwright-mcp/`.

## Output Expectations

Report:

1. What flow you reviewed
2. Whether the primary flow worked
3. Any visible regressions or follow-up risks
4. If review was blocked, exactly what prevented browser verification

## Scope Notes

- This skill complements, not replaces, targeted tests and linting.
- For implementation details, stay in `web/AGENTS.md` and package-local skills.
- Use this as the browser-signoff workflow, not as a generic frontend coding
  guide.
