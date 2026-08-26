---
rule: 5
title: Kind folders are a closed list
mechanism: census
---

# Rule 5 — kind folders are a closed list

`components`, `hooks`, `contexts`, `stores`, `fns`, `server`, `constants`,
`types`. Not `utils/`, not `lib/`, not `helpers/`, not `shared/`, not
`config/`. `docs/` and `__tests__/` may sit at any level alongside them; they
are not kind folders.

A component folder is PascalCase and lives under `components/`. A component
folder may recursively contain the same kind folders for things private to it.

The kind says what the thing *is*, not what it talks to: a hook that calls the
API is still a hook and lives in `hooks/`. There is deliberately no `api/`.

**Why.** One word for one thing. Predictability dies when every feature
invents its own folder names, and a folder called `shared` becomes the place
everything ends up. Both `constants/` and `types/` earned their place the same
way: traces had grown a `shared/` folder holding one constant and a `config/`
folder holding one module, because the closed list had no home for a value or
a type.

`docs/` is where Markdown lives — it holds no code and nothing imports it. A
`README.md` beside a component is prose loose in a code folder.

**Wrong**

```text
features/traces/utils/formatCost.ts
features/traces/config/columns.ts
features/traces/shared/threshold.ts
```

**Right**

```text
features/traces/fns/formatCost.ts
features/traces/constants/columns.ts
features/traces/constants/threshold.ts
features/traces/docs/README.md
```

Counted from a directory walk over `web/src`, feature scope only; `server/`
internals are unspecified by the RFC and skipped. List them with
`pnpm --filter web run structure:stats --rule 5`.
