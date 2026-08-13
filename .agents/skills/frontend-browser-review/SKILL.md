---
name: frontend-browser-review
description: |
  Shared workflow for browser-based review of user-visible frontend changes in Langfuse.
  Use when a change affects UI behavior, layout, styling, navigation, or browser-visible
  regressions and should be checked with available browser automation before signoff.
---

# Frontend Browser Review

Use this skill when a change affects what users see or do in the browser.

## Start Here

- Read [`../../../web/AGENTS.md`](../../../web/AGENTS.md) for web-specific
  entry points and test commands.
- In Cursor Cloud, use built-in computer use. In local agent environments, use
  the workspace `agent-browser` and `next-devtools` MCP servers from the shared
  agent setup.

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

1. Use the existing Cursor Cloud Compose app when available. Otherwise start
   the app with `pnpm run dev:web` unless a local server is already running.
2. Run `pnpm exec agent-browser doctor` if browser launch fails. Install its
   Chrome with `pnpm run agent-browser:install` when no compatible Chrome is
   available. The normal repo bootstrap also installs Playwright Chromium,
   which agent-browser auto-detects.
3. With the Next DevTools MCP, compile the target route and inspect existing
   compilation issues before navigation.
4. Open the primary changed flow with Cursor computer use or the agent-browser
   MCP, using seed-CLI deep links when the flow needs seeded data. The shared
   MCP launches an isolated session with React DevTools enabled; never connect
   it to or restore the developer's browser profile.
5. Exercise the main happy path affected by the change. Prefer accessibility
   snapshot refs for interaction, then inspect console errors and network
   failures.
6. Use React inspection when it answers a concrete question: component tree and
   props/state ownership, unnecessary render recording, Suspense boundaries,
   or Web Vitals and hydration behavior.
7. Check for obvious visual regressions:
   - broken layout or spacing
   - banner overlap or viewport anchoring issues
   - missing loading, empty, or error states
   - broken responsive behavior on narrow widths
8. If the page changed materially, inspect the resulting UI state and compare
   it against the intended behavior from the task or existing patterns.
9. Re-check Next DevTools compilation/runtime issues after exercising the flow.
   If agent-browser fails, run `pnpm exec agent-browser doctor --json` and
   inspect its console, errors, network, screenshot, or trace output. In Cursor
   Cloud, inspect the run's browser artifacts and Compose logs.

## Output Expectations

Report:

1. What flow you reviewed
2. Whether the primary flow worked
3. Any visible regressions or follow-up risks
4. If review was blocked, exactly what prevented browser verification

## Scope Notes

- This skill complements, not replaces, targeted tests and linting.
- Agent-browser replaces Playwright MCP for interactive agent review. It does
  not replace the Playwright E2E test suite or `@playwright/test`.
- For implementation details, stay in `web/AGENTS.md` and package-local skills.
- Use this as the browser-signoff workflow, not as a generic frontend coding
  guide.
