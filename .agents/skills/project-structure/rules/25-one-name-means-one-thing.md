---
rule: 25
title: Inside a feature, one name means one thing
mechanism: not yet counted
---

# Rule 25 — one name, one thing

Within a feature, no two modules export the same name, and a type never shares
a name with a component.

**Why.** `TraceSearchListItem` was both the component that renders a row and
the type of that row's data. While the type sat inside the component file
nobody noticed; extracting it into `types/` left two modules exporting the same
name, so every consumer needing both had to alias one at the import site. That
alias is the tell — the name was doing two jobs. Name the data for what it is
(`SearchListRow`) and the imports read straight again.

The same rule covers two components with the same name in different folders,
and duplicate module names: a dead copy of `jsonExpansionUtils.ts` survived
review for months because greps kept finding the live one.

**Wrong**

```ts
import { TraceSearchListItem } from "./components/TraceSearchListItem";
import { TraceSearchListItem as TraceSearchListItemData } from "./types/traceSearchListItem";
```

**Right**

```ts
import { TraceSearchListItem } from "./components/TraceSearchListItem";
import type { SearchListRow } from "./types/searchListRow";
```

An import-site alias is the signal to look for. No detector yet.
