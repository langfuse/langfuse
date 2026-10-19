# Topics UX feedback — structured (Oct 16)

Raw log: topics-feedback-log.md (same folder).

## 0. Decide first: where Topics lives
- **D1 — Fold into Tracing.** Search/filter traces by topic; show topics in trace detail; maybe no standalone page.
- **D2 — Keep the Topics page**, heavily restructured.
- Either way: topic search in Tracing + topics in trace view (placement TBD).
- Gates: map, topic cards, trace table, header actions, History placement.

## 1. Principles (apply everywhere)
| # | Principle | Evidence |
|---|---|---|
| P1 | Cut text hard; show, don't explain | Empty state, Auto modal (2 paragraphs), Manual modal (repeated lines), facet prompts |
| P2 | No "Coming soon" in the UI | Custom facet tab (removal **approved**), Filter traces (Auto modal), Add my own (Configure) |
| P3 | Plain words, no internals | "Configure Topics", "Trace readiness", "600 s", "Summarize & embed", "Process Traces" vs "Update Topics" |
| P4 | Simple by default, advanced on demand | 3 model slots, dimensions, readiness, prompts |
| P5 | One clear primary action per state | Empty state chips, header with 4 equal controls |
| P6 | No actions that do nothing for the user | "Refresh results" (only refetches), status pill that looks like a button |
| P7 | Visuals must answer a question | Empty state lacks one; cluster map has one but doesn't help |

## 2. Per surface
| Surface | Feedback | Status |
|---|---|---|
| Empty state | Needs a visual; too much text; CTA buried; "Configure Topics" wrong name | Directions A/B/C proposed; name pick "Set up Topics" |
| Header | Unclear controls; Off reads as button; flashing green On | Directions A/B/C proposed (pick A) |
| Configure modal | Banner obvious → title; models too advanced; recommendations in picker; facets as tabs confusing; prompts read-only → background; "Trace readiness" meaningless | Proposals ready; open: prompt link vs remove |
| Auto processing modal | Unreadable, too much text, Coming soon | Not yet proposed |
| Manual processing modal | Same — a lot of stuff | Not yet proposed |
| ⋮ menu | Configure hidden after setup; Refresh results pointless | Not yet proposed |
| History | Fine | Only label alignment |
| Cluster map | Useless as is; still want a visual | Open: what question should it answer |
| Topic cards / table | Descriptive only (filters by topic, per-facet summaries) | Long descriptions, wrapping badges noted |
| Trace detail | Show topics gracefully | Placement open |

## 3. Constraints
- BYOK; customer-data projects are Bedrock-only, in-region, connection set manually (Lysander, Slack). Simple mode + recommendations must work for Bedrock (Claude + Cohere/Titan embeddings) and an admin-set connection.
- Embedding model change forces re-embed → still needs a warning.
- Removals need per-item approval. Approved so far: Custom facet "Coming soon" tab.

## 4. Suggested order for the car
1. D1 vs D2 (or hybrid)
2. Principles P1–P7: agree/disagree
3. Setup flow (empty state + Configure) — most proposals ready
4. Processing (Auto + Manual merged into one story?)
5. Results view (map replacement, cards, table) — depends on #1
