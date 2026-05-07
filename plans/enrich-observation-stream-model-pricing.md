# Plan: Gate enrichObservationStream pricing fields on selected groups

## Context

`enrichObservationStream` (worker blob export path) currently always writes four
fields unconditionally onto every row, regardless of which `exportFieldGroups`
the user selected:

| Field | Current behaviour |
|---|---|
| `model_id` | always overwrites the ClickHouse value |
| `input_price` | always added (model's per-token input rate) |
| `output_price` | always added (model's per-token output rate) |
| `total_price` | always added (model's per-token total rate) |

This leaks model pricing metadata into exports even when the user deselected the
`model` group.

## Proposed group mapping

All four fields belong to the `model` group — they come from the model config
lookup, not from the observation's own usage data (`totalCost`/`costDetails`
live in `usage`).

| Field | Group |
|---|---|
| `model_id` | `model` |
| `input_price` | `model` |
| `output_price` | `model` |
| `total_price` | `model` |

## Implementation sketch

```ts
const includeModel = !fieldGroups || fieldGroups.includes("model");

if (includeModel) {
  const model = await getModel(modelId);
  const pricing = enrichObservationWithModelData(model);
  enriched.model_id = pricing.modelId ?? modelId ?? null;
  enriched.input_price = pricing.inputPrice;
  enriched.output_price = pricing.outputPrice;
  enriched.total_price = pricing.totalPrice;
}
```

Key points:
- When `fieldGroups` is `undefined` (legacy / v3 path), all groups are assumed →
  `includeModel` is true → behaviour unchanged.
- When `model` is not selected, `getModel` is skipped entirely — no cache lookup,
  no potential DB hit. Meaningful performance win for large exports with I/O-only
  configs.
- `modelIdField` (`"model_id"`) is still read from the row to drive the lookup
  when `model` is selected. When not selected, the field won't be in the
  ClickHouse result anyway, so `modelId` would be `undefined` — the guard
  prevents a wasted lookup.

## Notes

- `model_id` in the output is the *resolved* model ID from pricing data, not the
  raw ClickHouse value. Skipping the enrichment when `model` is deselected means
  the raw ClickHouse `model_id` would remain in the row if it was selected via
  `model_export` — but since `model` group is deselected, the field set is never
  added to the SELECT, so there is no `model_id` in the row at all. Clean.
- `input_price`/`output_price`/`total_price` are not part of any ClickHouse field
  set — they are purely enrichment-added. Gating them on `model` is the only way
  to exclude them.
