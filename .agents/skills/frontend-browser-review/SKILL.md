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
  the workspace `playwright` MCP server from the shared agent setup.

## When To Use It

Drive a browser when the outcome is uncertain:

- Changes to navigation or page flows, or anything carrying state across steps
- Layout or responsive behavior that could reflow in a way you cannot predict
- Bug fixes where the failure mode is visible in the browser
- Final signoff for a substantial piece of user-visible work

## When To Offer Instead

A small, self-contained visual change you are confident in does not need an
automated pass. Spacing, a colour token, a label, an icon swap: say what you
changed, hand over the exact URL — a local port or the pull request's
`pr-<N>.preview.langfuse.com` — and let the developer take the two-second look.
It is faster for them than waiting while you confirm something you already know,
and a screenshot in the pull request still carries the proof.

Two conditions. **Be explicit** — name what you did not check and why, so the
choice is visible and they can overrule it. And **do it while they are there**:
offering is a handoff, not a way of ending your turn. If nobody is around to
look, and the change is user-visible, check it yourself.

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
2. Install Chromium with `pnpm run playwright:install` if Playwright has not
   been set up on the machine yet.
3. Open the primary changed flow with Cursor computer use or the Playwright MCP
   server, using seed-CLI deep links when the flow needs seeded data.
4. Exercise the main happy path affected by the change.
5. Check for obvious visual regressions:
   - broken layout or spacing
   - banner overlap or viewport anchoring issues
   - missing loading, empty, or error states
   - broken responsive behavior on narrow widths
6. If the page changed materially, inspect the resulting UI state and compare
   it against the intended behavior from the task or existing patterns.
7. If a Playwright MCP session fails, inspect `/tmp/playwright-mcp`. In Cursor
   Cloud, inspect the run's browser artifacts and Compose logs.

## Output Expectations

Report:

1. What flow you reviewed
2. Whether the primary flow worked
3. Any visible regressions or follow-up risks
4. If review was blocked, exactly what prevented browser verification
5. For a human handoff, the preview or sandbox URL plus exact click-path
   steps, and proof of the fix posted on the GitHub PR (screenshot, short
   video, or before/after) — not a long agent-only writeup and not only
   in chat

## Scope Notes

- This skill complements, not replaces, targeted tests and linting.
- For implementation details, stay in `web/AGENTS.md` and package-local skills.
- Use this as the browser-signoff workflow, not as a generic frontend coding
  guide.
