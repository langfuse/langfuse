# LFE-9427 Plan: Judge Calibration Skill (LLM-as-a-Judge)

## Goal
Create a reusable skill/guide that helps teams calibrate a binary LLM-as-a-Judge evaluator and ingest per-item classification signals that support aggregate Accuracy, Precision, Recall, and F1.

## Research inputs reviewed
- `langfuse/skills` repository:
  - `skills/langfuse/SKILL.md`
  - `skills/langfuse/references/error-analysis.md`
- `hamelsmu/evals-skills` repository:
  - `skills/error-analysis/SKILL.md`
  - `skills/write-judge-prompt/SKILL.md`
  - `README.md`

## Proposed deliverable shape
Add a new focused reference + workflow under the Langfuse skill:

1. **New reference**: `skills/langfuse/references/judge-calibration.md`
   - Binary label calibration workflow (positive/negative label semantics)
   - Confusion matrix mapping rules (TP/FP/FN/TN)
   - Ingestion schema for per-item scores
   - Aggregate metric formulas and guardrails
   - Common pitfalls (label inversion, denominator zero, class imbalance)

2. **SKILL routing update**: `skills/langfuse/SKILL.md`
   - Add a trigger phrase for “judge calibration / precision recall f1”
   - Add a short decision tree that points to `judge-calibration.md` vs existing `error-analysis.md`

3. **Examples section in reference**
   - Cookbook-style Python example using Langfuse prompt retrieval and score ingestion
   - “Expected outputs” checklist for validating experiment runs

## Content plan for `judge-calibration.md`

### 1) Scope and prerequisites
- Binary evaluator only (initially)
- Define explicit `POSITIVE_LABEL` (e.g., `ESCALATE`)
- Require a golden dataset with human annotations

### 2) Prompt retrieval and evaluation loop
- Pull evaluator prompt by name/version (`unstable` or pinned)
- Run each item once and store:
  - input
  - expected label
  - actual label
  - exact_match

### 3) Deterministic state mapping
- TP: expected = positive and actual = positive
- FP: expected = negative and actual = positive
- FN: expected = positive and actual = negative
- TN: expected = negative and actual = negative

### 4) Score ingestion contract
Per item, ingest at least:
- `exact_match` (0/1)
- `is_tp` (0/1)
- `is_fp` (0/1)
- `is_fn` (0/1)
- optionally `is_tn` (0/1)
- metadata: expected, actual, evaluator prompt version, dataset version, run id

### 5) Aggregate computation formulas
- accuracy = (TP + TN) / total
- precision = TP / (TP + FP)
- recall = TP / (TP + FN)
- f1 = 2 * precision * recall / (precision + recall)

Guardrails:
- if TP+FP = 0, precision undefined → report null + note
- if TP+FN = 0, recall undefined → report null + note
- if precision+recall = 0, f1 = 0

### 6) Validation checklist (inspired by `validate-evaluator` pattern)
- Label vocabulary is strict and parseable
- No missing expected labels
- Confusion matrix counts sum to total rows
- Metric recomputation from raw counts matches reported aggregates
- Include class prevalence (`P/N` ratio) to contextualize accuracy

### 7) Calibration iteration workflow
- Error slicing by false positives and false negatives
- Prompt edits to target one error class at a time
- Re-run on same frozen dataset before changing model
- Track drift by comparing runs over time

## Implementation phases

### Phase A — Draft
- Create `judge-calibration.md` with complete workflow and formulas.
- Add one worked support-escalation example.

### Phase B — Integrate
- Update `skills/langfuse/SKILL.md` routing/trigger lines.
- Cross-link to existing `error-analysis.md` so users can go from calibration to qualitative failure analysis.

### Phase C — Verify
- Manual QA pass on consistency of TP/FP/FN/TN definitions.
- Ensure formulas and edge-case handling are explicit.
- Validate examples use parseable labels only.

## Acceptance criteria
- Users can follow one document to instrument a binary judge run end-to-end.
- The guide includes exact mapping rules for TP/FP/FN/TN and ingestion fields.
- The guide includes formulas + denominator edge-case handling.
- The guide includes a practical validation checklist similar to `validate-evaluator` discipline.
- The Langfuse skill router clearly directs users to this guide when they ask about calibration or F1/precision/recall.
