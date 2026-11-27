---
name: linear-agent-writes
description: Carry out explicitly requested Linear ticket creation, comments, or edits without routine handover prompts or repeated proposal approval.
---

# Requested Linear work

Use Linear when the task requests tracker work or needs context from a referenced issue. Ordinary coding and review tasks do not require tracker-history reconstruction, a connection preflight, or a weekly planning workflow.

- Do not propose or prepare routine ticket updates or end-of-session handovers.
- An explicit request to create, edit, or comment on an issue authorizes that action. Perform it without another proposal or confirmation; ask only for missing details or consequential ambiguity.
- Keep writes brief, mark agent-written content when acting through a human account, and preserve unrelated human prose and private data.
- Stay within the request: no unsolicited tickets, comments, handovers, labels, assignments, status changes, or reprioritization.
- For a requested tracker action in Cursor Cloud, use the configured `LINEAR_API_KEY` (`LINEAR_TOKEN` or `LINEAR_API_TOKEN` aliases) when MCP OAuth is unavailable. Interactive MCP authorization cannot complete in a headless run.
- Never print, log, echo, or commit tracker tokens; report only whether access worked.
- Use existing tracker access. If it is unavailable, say so once only when it blocks a requested tracker action, then continue independent work. Do not interrupt unrelated work with tracker setup requests or paste-ready handover blocks.
