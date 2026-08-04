# Preview PR banner strip — round 1

Branch `preview-pr-banner`, dev server http://localhost:3002 with
`NEXT_PUBLIC_PREVIEW_PR_URL=https://github.com/langfuse/langfuse/pull/15572`,
`NEXT_PUBLIC_PREVIEW_PR_AUTHOR=nmtrang29`, `NEXT_PUBLIC_PREVIEW_LAST_UPDATED=<2h ago>`.

1. `1-banner-strip-on-app.png` — strip on the Organizations page.
2. `2-banner-strip-on-traces.png` — strip on a project Tracing page:
   "Preview deployment of PR #15572 by @nmtrang29 · updated about 2 hours ago"
   with an "Open PR ↗" button on the right.

Verified: 32px strip registers with the top-banner system (`--banner-height: 32px`),
content offsets below it (no overlap at y=40), links go to the PR and the author's
GitHub profile. Banner absent when env vars unset (other branches/ports unaffected).
