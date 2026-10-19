# Topics onboarding redesign — handoff

Design exploration only. No product code changed. Not meant to merge.

## Where things are
- Canvas (all mocks, editable): https://claude.ai/artifact/QLqw6484hSWXtc31KNQHZ8
- `shots/` — PNG of every mock. Review order: `V2-1a` … `V2-8`.
- `topics-canvas/project/*.dc.html` — mock sources. Render: `node shotjs/v2.mjs "$PWD/topics-canvas/project" "$PWD/shots"` (fix the Playwright import path in `shotjs/*.mjs` for your machine).
- `topics-feedback-log.md` — raw feedback, screen by screen.
- `topics-feedback-structured.md` — principles P1–P7, directions D1/D2, constraints.
- `topics-review-guide.md` — Q1–Q8, removals R1–R7, renames, engineering needs.
- `claude-design-prompt.md` — paste into Claude Design.

## Decisions so far
- Phasing: onboarding first; main UX (page vs fold into Tracing) later.
- Visual: Visual 3 (sorting) and D (floating topic cards) liked.
- Removal approved: "Custom facet · Coming soon" tab.

## Open
- Q1–Q8 answers and R1–R7 yes/no (see review guide).
- Slack thread with Lysander (BYOK/Bedrock constraint): C0CA2QWG8JC / p1792141853240469.
- After approval: implement in `web/src/features/topics/**` (TopicSetupNotice, TopicsHeaderActions, ConfigureTopicsDialog, AutomaticProcessingDialog, ManualTopicsDialog, TopicsActionsMenu).
