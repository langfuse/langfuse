# In-app agent quick action prompts

**Source of truth:** [`quickActions.ts`](./quickActions.ts)

Keep this file aligned with `quickActions.ts`. When you change a quick action's `id`, `label`, `description`, or `prompt` there, update the matching entry here in the same PR. Descriptions do not end with a period.
This file is added as its easier to review the quick actions and prompts in markdown that it is in .ts

---

## Context actions

Shown in the quick-action picker based on the current project section (traces, dashboards, prompts, evals, etc.).

### Observability

#### `analyze-failure-patterns` — Analyze failure patterns

**Description:** Run structured error analysis on failed traces

**Prompt:**

> Run a structured error analysis on failed traces the current view (taking active filters into account): sample representative traces (as many as needed), open-code and cluster recurring failure modes into a taxonomy, recommend what to fix first, and offer to set up an annotation queue or evaluator to track the top failure modes.

#### `review-recent-activity` — Review recent activity

**Description:** Get a digest of volume, cost, and latency

**Prompt:**

> Give me a digest of recent activity in the current view (taking active filters into account): trace volume, error rates, latency, and cost over the last seven days (and compare it with the previous week), and highlight anything that changed significantly.

#### `investigate-unusual-patterns` — Investigate unusual patterns

**Description:** Spot unusual cost, latency, or quality patterns

**Prompt:**

> Review the current filtered view for unusual latency, cost, or quality patterns, explain likely causes, and suggest what to investigate next.

### Dashboard widgets

Each action adds a widget to the current dashboard (or creates one that fits what's already there).

#### `monitor-production-health` — Monitor production health

**Description:** Widget for error rate, latency, throughput

**Prompt:**

> Help me build widgets that keep an eye on production health — error rate, P95/P99 latency, throughput, and how different models or tools are performing. First ask whether to scope this to a specific use case, model, or trace name or keep it project-wide, and fit the widgets to whatever is already on my current dashboard.

#### `track-cost-and-usage` — Track cost and usage

**Description:** Widget for spend by model and feature

**Prompt:**

> Help me build widgets to track token usage and cost — how spend is trending, which users drive it (if available), and how models compare. First check whether to focus on a particular model, feature, or user segment or look across the whole project, and fit them to whatever is already on my current dashboard.

#### `track-quality-and-feedback` — Track quality and feedback

**Description:** Widget for score trends and feedback

**Prompt:**

> Help me build widgets to track quality — score trends over time, score distribution, and user feedback like thumbs up/down. First ask which score or use case matters most or whether I want an overall view, take my current dashboard into account, and call out any scores that are slipping.

### Prompts

#### `create-prompt` — Create a prompt

**Description:** Add a new prompt to prompt management

**Prompt:**

> Help me create a new prompt in Langfuse prompt management, including choosing between a text and chat prompt, defining its variables, and setting a label.

#### `find-prompts-to-improve` — Find prompts to improve

**Description:** Spot prompts with weak performance

**Prompt:**

> Across my prompts, identify which ones have declining scores, high latency, or high cost in production based on their linked generations, and suggest which to improve first. If no generations are linked to prompts, explain how to link prompts to traces instead.

#### `review-prompt-usage` — Review prompt usage

**Description:** See which prompts drive production traffic

**Prompt:**

> Summarize which prompts are used most in production, which versions are live, and their latency, cost, and score performance. If no generations are linked to prompts, explain how to link prompts to traces instead.

### Evaluation

#### `set-up-llm-judge-evaluator` — Set up LLM-as-a-judge evaluator

**Description:** Score outputs with a model judge

**Prompt:**

> Help me set up an LLM-as-a-judge evaluator. First ask what I want to score — a quality like hallucination, helpfulness, or toxicity, or something tied to a specific use case — then help me pick a managed template or write a custom rubric, map its variables, and choose whether it runs on live observations or an experiment and which data it targets. If it helps, look at a few recent traces first to ground the rubric.

#### `set-up-annotation-queue` — Set up an annotation queue

**Description:** Queue traces for human review and scoring

**Prompt:**

> Help me set up an annotation queue so a human can review and score traces. First ask which traces or use case I want reviewed and which dimensions to score, then create the score configs and the queue, add a starter set of items.

#### `create-dataset-from-traces` — Create a dataset

**Description:** Build a dataset from representative traces

**Prompt:**

> Help me build a dataset from representative traces so I can evaluate and run experiments. First ask which use case or slice of traffic it should cover and what to name it, then pull a small set of up to ten traces as items with inputs and expected outputs. When it's ready, I can run an experiment on it from the UI, or you can give me a coding-agent prompt to run it via the SDK.

---

## Focused actions

Shown when the user is on a specific entity (trace, observation, dataset, etc.).

### Trace

#### `analyze-this-trace` — Analyze this trace

**Description:** Run structured error analysis on this trace

**Prompt:**

> Run a structured error analysis on this trace: review its observations and generations, identify failure modes, explain what went wrong, and recommend what to fix first.

#### `summarize-this-trace` — Summarize this trace

**Description:** Get a plain-language recap of this execution

**Prompt:**

> Summarize this trace, including its execution sequence, generations, tool calls, errors, scores, and outcome.

#### `break-down-this-trace-cost` — Break down this trace's cost

**Description:** See where latency and tokens add up

**Prompt:**

> Break down this trace's latency, token usage, and cost across its generation observations, and identify the largest drivers.

### Observation

#### `analyze-this-observation` — Analyze this observation

**Description:** Inspect this observation for issues

**Prompt:**

> Analyze this observation, including its input, output, errors, scores, and linked prompt version, and explain what went wrong or could be improved.

#### `explain-this-generation` — Explain this observation

**Description:** Understand what this observation did

**Prompt:**

> Explain what this observation did, how it fits into the surrounding trace, and whether its output looks correct.

#### `optimize-this-generation-cost` — Optimize this observation's cost

**Description:** Reduce tokens and latency for this step

**Prompt:**

> Review this observation's token usage, latency, and model choice, then suggest concrete ways to reduce cost or latency without hurting quality.

### Session

#### `summarize-this-session` — Summarize this session

**Description:** Get a plain-language recap of this session

**Prompt:**

> Summarize this session, including its traces, execution flow, errors, scores, and overall outcome.

#### `analyze-this-session` — Analyze this session

**Description:** Find issues across this session's traces

**Prompt:**

> Analyze this session's traces for recurring failure patterns, quality issues, and unusual latency or cost, then recommend what to investigate next.

#### `break-down-this-session-cost` — Break down this session's cost

**Description:** See where this session spends tokens

**Prompt:**

> Break down this session's token usage and cost across its traces and generations, and highlight the largest drivers.

### Prompt

#### `review-prompt-best-practices` — Review with best practices

**Description:** Check this prompt against Langfuse guidance

**Prompt:**

> Review this prompt against prompt engineering best practices and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.

#### `compare-prompt-versions` — Compare prompt versions

**Description:** Review how versions changed

**Prompt:**

> Compare recent versions of this prompt, summarize what changed between them, and how each version performs in production based on its linked generations. If no generations are linked to this prompt, explain how to link prompts to traces instead.

#### `check-prompt-performance` — Check prompt performance

**Description:** Connect this prompt to latency, cost, and scores

**Prompt:**

> Find the generations that use this prompt and summarize its latency, cost, and score performance, pointing me to this prompt's Metrics tab for the full per-version breakdown. If no generations are linked to this prompt, explain how to link prompts to traces instead.

### Dataset

#### `add-items-to-this-dataset` — Add items from traces

**Description:** Populate this dataset from production traces

**Prompt:**

> Help me add a small set of up to ten representative production traces as items to this dataset so I can use it for experiments and evaluation.

#### `set-up-experiment-on-this-dataset` — Prep an experiment

**Description:** Attach evaluators and get ready to run

**Prompt:**

> Help me get an experiment ready on this dataset: check that its item keys match my prompt variables, confirm an LLM connection is configured, and attach an evaluator to score the results. Langfuse runs the experiment itself, so point me to the experiments UI to start it, or give me a ready-to-use prompt I can hand a coding agent to run it via the SDK.

#### `review-this-dataset` — Review this dataset

**Description:** Assess coverage and quality of items

**Prompt:**

> Review this dataset's items for coverage, diversity, and quality, and recommend improvements before I run experiments or evaluations on it.

### Experiment run

#### `summarize-this-experiment-run` — Summarize this experiment run

**Description:** Understand how this run performed

**Prompt:**

> Summarize this experiment run, including its configuration, scores, and how it compares to the dataset baseline.

#### `compare-this-experiment-run` — Compare to other runs

**Description:** See how this run stacks up

**Prompt:**

> Compare this experiment run to other recent runs on the same dataset and summarize which configuration performed best.

#### `investigate-this-experiment-run` — Investigate this run's results

**Description:** Find where this run succeeded or failed

**Prompt:**

> Investigate this experiment run's results, highlight the best and worst-performing items, and explain likely causes.
