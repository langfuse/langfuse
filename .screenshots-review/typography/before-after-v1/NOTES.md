# Typography PR #15186 — before/after round v1

**before** = `main` (81b6a180e, v3.219.0) on localhost:3002
**after** = `typo-updates` (b852290f6) on localhost:3001
Same local DBs, project `llm-app` (Seed Org), viewport 1440×900, headless Chrome.
Dashboards/tables use a 90-day range (seed data is from ~Jun 30).

Prompted by claude review round 3 (PR review 4721564484): the sweep is
mechanical, but these design calls need human eyes.

## Pairs

| # | Page | What to look at |
|---|------|-----------------|
| 01 | Org overview (dark) | org names on primary tier + text-lg (was inherited grey, xl); card titles bold text-base; outline/secondary buttons; badges |
| 02 | Home dashboard (dark) | widget titles text-base bold (was text-2xl); big numbers; weight roles at 600 |
| 03 | Traces table (dark) | toolbar outline buttons (border-border-contrast vs border-input); table text weights |
| 04 | Trace detail (dark) | JSON/IO viewers on --font-mono; metadata table; tab weights |
| 05 | Prompts list (dark) | links (text-link blue vs text-primary); badges; row text |
| 06 | Project settings (dark) | outline buttons en masse; form labels (now bold role); section headers |
| 07 | Home dashboard (light) | same as 02 — sweep ships to light users too |
| 08 | Org overview (light) | same as 01 in light |

## Known caveats

- "Fast (Preview)" toggle appears in after-shots' sidebar (unrelated feature
  from newer main, not part of this PR).
- Trace detail (04) captured on a support-chat seed trace; JSON viewer font is
  the system mono stack on both sides (typeface deferred), so only weights and
  colors should differ.
- An `events.getSdkVersionInfo` dev-only error toast fires on the traces page
  on both servers (local env issue, unrelated); removed from DOM before
  screenshots where it appeared.
