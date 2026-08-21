---
rule: 14
title: Design-system components hold no application state and fetch no data
mechanism: review
---

# Rule 14 — the design system stays pure

Foundational UI — buttons, accordions, dropdowns — lives in
`src/components/design-system`. The bar for entry is that it is a *designed
abstraction*, not merely shared.

A design-system component may hold local UI state (open/closed). It must not
hold application state and must not fetch data.

Anything shared but not design-system-grade just lives in `src/components`.

**Why.** A button that knows about traces cannot be reused by anything that
isn't traces, and a component that fetches makes every consumer inherit a
network dependency they can neither see nor mock.

**Wrong**

```tsx
// components/design-system/ProjectPicker/ProjectPicker.tsx
const { data } = api.projects.all.useQuery();
```

**Right**

```tsx
// components/design-system/Select/Select.tsx — options come in as props
// the fetching wrapper lives in the feature that needs it
```

Not machine-counted: this one is decided in review.
