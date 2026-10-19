Design the first-run onboarding for "Topics" in Langfuse (an LLM observability web app: left sidebar, top header, dense data tables, neutral greys, black primary buttons).

What Topics does: it reads each trace (one AI conversation/run), writes a one-line answer to four questions — Intent (what the user wanted), Sentiment (how they felt), Outcome (did it work), Issues (what went wrong) — and groups similar answers into topics with counts, e.g. "Refund requests · 214".

Design principles (from user feedback):
- Almost no text. Show, don't explain. One headline + one short line max.
- One primary action per screen. Nothing disabled that looks like a button.
- No "Coming soon" anywhere.
- Plain words: no "facets", "embeddings", "trace readiness", "clustering" in the default view.
- Simple by default, advanced behind one "Advanced" disclosure.

Visual language: a "sorting" metaphor. Left: a messy pile of tilted white message cards with colored lines. Arrow. Right: three neat colored piles (purple/blue/orange) of different heights, labeled with topic name + count. Soft lavender panel (#f4f2fb). Also explore a variant where real-looking topic cards float around a big centered headline (some faded/blurred), like an ambient preview of results.

Screens:
1. Empty state: sorting visual, headline "Thousands of traces, a few clear topics", button "Set up Topics", small link "How Topics works". Header shows only a ⋯ menu.
2. Setup step 1/2 (modal): one "Model" picker (an LLM connection; recommended models auto-picked, shown as one muted line); "What to look for": 4 checkbox rows — name, 3-word description, example answer in quotes. "Advanced ▸" collapsed.
3. Advanced expanded: per-job model pickers (Summaries / Embeddings / Grouping) with a "Recommended" badge in the dropdown; warning under Embeddings "Changing this later re-processes all traces"; "Wait before summarizing" chips 2 min / 10 min / 30 min / 1 h.
4. Setup step 2/2 "Which traces?": toggle "New traces, from now on" (on, with % sampling), checkbox "Past traces too · 1,280 traces · Last 7 days", a summary strip "First topics in about 5 min · est. cost", button "Start".
5. First run: the sorting visual mid-progress (piles growing), "Sorting 640 of 1,280 traces", progress bar, per-question status chips, "You can leave this page."
6. First results: tabs Intent/Sentiment/Outcome/Issues; left a ranked list of topics with horizontal bars and counts; right the traces in the selected topic with one-line summaries and "Open in Tracing". Header: "● Auto-analyze: On", "Run ▾", "⋯".

Constraint: many customers can only use AWS Bedrock (Claude models for text, Cohere/Titan for embeddings), sometimes set up by an admin — the model picker must work when there is only one, pre-configured connection.

Give 2–3 visual directions for screen 1, then carry the strongest through screens 2–6.
