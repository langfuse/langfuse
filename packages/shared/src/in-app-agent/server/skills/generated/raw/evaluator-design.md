---
name: langfuse-evaluator-design
description: Design, recommend, and create Langfuse evaluators from project traces or a user-provided goal. Use when the user explicitly wants evaluator ideas, asks what evaluators they should add, or wants help choosing and creating an evaluator. For broad failure analysis without evaluator intent, use the error-analysis skill instead.
---

# Evaluator design

Help the user reach a concrete evaluator design without making them understand Langfuse evaluator terminology first. Make recommendations, explain consequential tradeoffs briefly, and ask at most one or two focused questions at a time.

## Use available project context

- The Langfuse tools are already scoped to the authenticated project. Do not ask for a project ID or credentials.
- The current URL identifies where the user opened the assistant, but it does not provide the page's content or selected records. Never imply that you can see page content that a tool has not returned.
- Call `listEvaluators` early to understand existing evaluators and avoid duplicate suggestions or names.
- Traces are represented by their observations. Use `listObservations` with a bounded, recent time range to discover them, then `getObservation` when more detail is needed. Request input and output fields only for a bounded time range or specific trace or observation.
- Use `listScores` when existing scores can reveal current evaluation coverage or recurring failures.
- Unless the user asks otherwise, exclude Langfuse's internal environments and prefer production-like data.
- Minimize access to sensitive inputs and outputs. Read only the fields and number of examples needed to make a useful recommendation.

## Choose the flow from the user's intent

### Suggest evaluators from my traces

1. If the relevant scope is unclear, ask one question that helps select a useful sample, such as the environment, trace name, recent time window, or specific problematic traces.
2. Inspect a small, representative set of observations. Include both typical and problematic examples when available; do not treat one unusual trace as a general pattern.
3. Identify two or three important, recurring, and evaluatable patterns. Existing scores and evaluators should influence what is missing.
4. Present no more than three proposals. For each proposal include:
   - the behavior it measures;
   - the trace evidence or pattern that motivated it;
   - the recommended implementation: code, LLM-as-a-judge, or a two-stage hybrid;
   - the recommended score type; and
   - its relative cost and likely execution scope.
5. Ask the user which proposal to refine. Do not create an evaluator yet.

### Build an evaluator I have in mind

1. Treat the user's typed message as the evaluator goal. Do not respond with another generic “what do you want to build?” loop.
2. Restate the intended behavior in one sentence and fill in sensible defaults.
3. Ask only about missing information that could materially change the evaluator. Examples of useful evidence include a passing output, a failing output, or a problematic trace, but do not require examples when the goal is already precise.
4. Recommend a concrete design, then refine it with the user.

If the request is ambiguous between these flows, offer exactly these two choices instead of running a long questionnaire.

## Recommend the evaluator design

Prefer a recommendation over asking the user to choose implementation details without context:

- Recommend a code evaluator for deterministic checks such as schema validation, exact comparisons, regexes, thresholds, required fields, or calculations.
- Recommend an LLM-as-a-judge evaluator for semantic, contextual, subjective, or rubric-based judgments.
- Recommend a two-stage hybrid when a deterministic pre-check can eliminate obvious cases and reduce judge calls. A hybrid consists of separate code and LLM-as-a-judge evaluators; `hybrid` is not an evaluator type accepted by `upsertEvaluator`.
- Recommend boolean scores for a clear pass/fail gate, categorical scores for meaningful outcome or failure classes, and numeric scores for graded quality, thresholds, or trend analysis.
- For LLM judges, define an explicit rubric and useful reasoning alongside the score. Keep output categories mutually exclusive and define numeric scale anchors.

Determine the execution and cost constraints before finalizing an LLM judge:

- whether it runs on live traffic, an experiment or dataset, or both;
- approximate evaluation volume and whether sampling is acceptable; and
- whether the user prefers maximum accuracy, a balanced default, or lower cost.

Explain cost relatively unless the tools provide enough model, token, and volume data for a reliable estimate. Code evaluators have no per-evaluation model cost; LLM judges consume model tokens. Suggest sampling, a smaller judge model, shorter context, or a hybrid design when cost matters.

## Draft, confirm, then create

Before any mutation, show a compact evaluator draft containing:

- name and goal;
- evidence or examples used;
- code, LLM-as-a-judge, or a two-stage hybrid made from separate evaluators;
- evaluator logic or rubric and required inputs;
- boolean, categorical, or numeric score definition;
- live or experiment scope, sampling, and model choice where relevant; and
- cost profile and any important tradeoff.

Check existing evaluator names with `listEvaluators`. Prefer a new name for a new evaluator. If the user intends to reuse a name, explain that `upsertEvaluator` creates a new version and migrates its evaluation rules before asking for confirmation. Ask for explicit confirmation before calling `upsertEvaluator`; tool approval is an additional safeguard, not a replacement for conversational confirmation. Creating or attaching an evaluation rule is a separate action and requires separate confirmation. After a successful creation, provide the returned evaluator URL and summarize what was created.
