# Topics onboarding — feedback log

Status: collecting. No mocks or code yet.

## 1. Empty state
- Missing a visual of what Topics does; too much text.
- Configure Topics is the main action but buried among button-like chips.
- "Configure Topics" may be the wrong term. (Draft: "Set up Topics")

## 2. Header actions
- Off · Automatic processing · Configure Topics · Manual processing · ⋮ — unclear what each does.

## 3. Configure Topics modal
- Blue banner is loud but says something obvious/uncontrollable (project-wide). → put it in the title: "…for this project".
- 3 model slots feel advanced; want a simpler default, advanced on demand.
- Picker should show recommendations when opened.
- Facets: tabs make choosing unclear; reviewing each prompt is too much work. Short description each is enough.
- Prompts aren't editable → should work in the background; no need to see how they're computed. (Open: hide behind link vs remove — removal needs approval.)
- Trace readiness: meaningless name, "600" unexplained. Whole modal should be a simple model.

## 4. Final topics view (screenshot 7, reference only, no feedback yet)
- Facet tabs (Intent · Sentiment · Outcome · Issues · + Custom facet "Coming soon").
- Cluster map: "397 mapped traces · Saved 2D projection", zoom controls.
- Topic cards with counts (e.g. "Langfuse help and administration · 24").
- Trace table: Trace ID · Topic ("awaiting map" / "outlier") · Summary + "Debug transcript"; 472 traces.
- Header: ● On · Automatic processing · Manual processing · ⋮; date range 14d.
- Live link (US cloud, Intent facet, 14d): https://us.cloud.langfuse.com/project/cmfziqhr905gqad082w79jxe9/topics?topicFacet=cmuzlyjiw0083ad0dq14pqh3s&dateRange=14d

### Feedback
- Remove "+ Custom facet · Coming soon" from the facet tab bar — draws too much attention. (Removal approved by Trang.)
- Flashing green "● On" in header: unclear what it means. (It's the automatic-processing status badge, pulsing via StatusBadge live mode.)

## 5. Automatic processing modal (screenshot 8)
Contents: blue banner (v4-ready ingestion only) · 2 dense paragraphs (10-min idle, sampling only for auto, nearest-topic assignment, Outliers, first topics at 100 traces/7 days, no auto refresh → "Regenerate topics") · Models (read-only, "Change models in Configure Topics") · Sampling rate slider 100.00% · Filter traces "Coming soon" (disabled Query/Builder + search) · Matching traces (1280, last 7 days) table · Cancel/Save. No visible on/off control in view.

### Feedback
- "Automatic processing" is a button, but the modal is unreadable — unclear what it's saying.
- Too much text in general; nobody reads it.
- Why so many "Coming soon"s? (Filter traces block here; also Custom facet on main view, Add my own in Configure.) Pending: remove vs hide — needs per-item approval except Custom facet tab (already approved).

## 6. Manual processing modal → Summarize traces & embed (screenshots 9–10)
Contents: tabs Summarize traces & embed / Generate topics · intro paragraph · 1 Choose facets (4 checkboxes, "4 of 4 selected") · 2 Select traces (Filters / Paste IDs; time range 7d, Maximum traces 1000, Selection Random sample; "Process up to 1,000…"; Filter observations Query/Builder + Add filter; inclusion explainer; Preview traces button; "First preview… Previewing does not use a model" — said twice) · 3 Review & Run (instruction line, what-happens line, Models summary + embedding + Configure Topics link, ☑ Reuse existing summaries & embeddings, Model costs line) · Cancel / Summarize & embed (disabled until preview).

### Feedback
- Same as Automatic processing: just a lot of stuff.

## 7. ⋮ menu after setup (screenshot 11)
Contents: Configure Topics (gear icon) · History · Refresh results.

### Feedback
- Configure Topics is hidden in ⋮ after setup — it opens the same project config modal as before.

## 8. History side panel (screenshot 12)
Contents: "Past executions" · "Review progress, errors, and retry interrupted runs." · Refresh · rows: run type (Update Topics / Process Traces) · timestamp · "4 facets" · status badge (Run complete / Run finished with errors / Run failed).
Naming mismatch noted: rows say "Process Traces" / "Update Topics", buttons elsewhere say "Summarize & embed" / "Generate topics".

### Feedback
- Fine as is. (Out of scope unless naming alignment changes it.)

## 9. "Refresh results" in ⋮ (screenshot 13)
What it does: only re-fetches the page data (`TopicsPage.tsx:302` — invalidates `topics.currentResults`). Does NOT regenerate topics or run anything.

### Feedback
- Why is "Refresh results" a button at all? Shouldn't exist as a manual action.

## 10. Cluster map (screenshot 14)
Contents: 2D scatter of embedded traces, colored by topic, grey = outliers; hover tooltip shows topic + trace summary; zoom/recenter/fullscreen controls; footer "397 mapped traces · Saved 2D projection". Takes the top-left, largest panel above the topic cards.

### Feedback
- Feels useless as is. Nice-looking, and some visualization is needed — but this one doesn't help.
- (Implied: map positions/distances carry no readable meaning; mostly grey outliers in the middle.)

## 11. Topic card selected (screenshot 15)
Behavior: clicking a topic card selects it (outlined), highlights its points on the map (others fade; "24 of 397 mapped traces match"), and writes `topic:"Langfuse help and administration"` into the search box, filtering the trace table (right) to 24 of 472. Each row: Trace ID · Topic badge · Summary · Debug transcript.

### Feedback
- Describes behavior only (filter list by topic, show trace IDs + summary). No explicit complaint yet.

## 12. Outcome facet, topic selected (screenshot 16)
Behavior: switching facet tab changes topics, map, and the Summary column — each facet has its own summary per trace (Outcome summaries read "Completed: …" / "Not completed: …" / "Partial: …"). Same trace appears in different topics per facet. Topic cards' descriptions are long (4–5 lines); topic badges in table wrap to 2 lines.

### Feedback
- Descriptive: summaries differ by facet. No explicit complaint yet.

## 13. Big-picture directions
- **Direction 1 — Fold Topics into Tracing.** Integrate deeply so you can search/filter traces by topic in Tracing. Possibly drop the standalone Topics page altogether. (Exploratory; a page removal would need explicit approval.)

- **Trace detail (screenshot 17):** show topics in the trace view (header: duration · cost · tokens · session · user · tags; Tree/Timeline/Graph; Preview Input/Output) — needs a graceful placement. Open question: where (header chips next to tags? a facet summary block in Preview? per root observation?).

- **Direction 2 — Keep a dedicated Topics page**, but heavily restructured (setup, header, modals, map, cards, table per sections 1–12).
- Not mutually exclusive: Tracing integration (search by topic, topics in trace view) could ship with either.

## Slack thread (C0CA2QWG8JC / p1792141853240469)
- Lysander: Topics runs on BYOK. In projects with customer data, the LLM connection is configured manually in the DB — data must stay in region, Bedrock only (no OpenAI). Test-data projects can use OpenAI to play with the config flow.
- Implication for the Configure redesign: "Simple mode" + model recommendations must work with Bedrock-only connections (Claude for summaries/clustering, Cohere/Titan for embeddings), and may need to respect an admin-locked connection.
- No replies yet (as of Oct 16).

## 14+. (more coming)
