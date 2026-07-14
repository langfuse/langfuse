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

## Prefill Test Data First

Most flows are only reviewable against meaningful data. Before opening the
browser, seed what the flow needs with the seed CLI (see the
`seed-test-data` skill for the need→command table):

- `pnpm run seed -- trace-tree --observations 5000 --v4` — complex
  observation trees (v3 + v4 events)
- `pnpm run seed -- long-session --traces 300` — heavy session views
- `pnpm run seed -- many-traces --count 100000` — list/filter performance
- `pnpm run seed -- doctor` — when the stack misbehaves

Every run prints UI deep links — open those instead of navigating manually.
Do not hand-write seed scripts or raw ClickHouse inserts.

## Review Loop

1. Start the app with `pnpm run dev:web` unless an existing local server is
   already running.
2. Install Chromium with `pnpm run playwright:install` if Playwright has not
   been set up on the machine yet.
3. Open the primary changed flow with the Playwright MCP server, using the
   deep links printed by the seed CLI when the flow needs seeded data.
4. Exercise the main happy path affected by the change.
5. Check for obvious visual regressions:
   - broken layout or spacing
   - banner overlap or viewport anchoring issues
   - missing loading, empty, or error states
   - broken responsive behavior on narrow widths
6. If the page changed materially, inspect the resulting UI state and compare
   it against the intended behavior from the task or existing patterns.
7. If the browser session fails, inspect traces and artifacts under
   `/tmp/playwright-mcp`.

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
