---
rule: 1
title: One component per file, PascalCase filename matching the component
mechanism: census
---

# Rule 1 — one component per file

A component file holds exactly one component, and the filename is that
component's name in PascalCase. `WarningDialog.tsx` contains `WarningDialog`.

A single-file component can live flat as `components/WarningDialog.tsx`. The
moment it gains a related file — a test, a story, a sub-fn — it becomes a
folder of the same name: `components/WarningDialog/WarningDialog.tsx`.

**Why.** The filename is the index. If you can't get from a component name to
its file without grepping, the tree has stopped telling the truth. Six badges
in one file also hide the fact that they want to be one component with props.

**Wrong**

```text
components/deleteButton.tsx   → DeleteButton, DeleteTraceButton, DeleteDatasetButton, …
components/date-picker.tsx    → DatePicker, DatePickerWithRange, TimeRangePicker
```

**Right**

```text
components/DeleteButton/DeleteButton.tsx
components/DeleteTraceButton.tsx
components/DatePicker/DatePicker.tsx
```

A family of near-identical tiny components splits flat into `components/`, not
into a grouping folder — the pile of one-line files is the signal.

Counted from a TS parse of every `.tsx` file: filename casing, and the number
of PascalCase value exports. List them with
`pnpm --filter web run structure:stats --rule 1`.
