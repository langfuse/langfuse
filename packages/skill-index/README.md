# @langfuse/skill-index

Embeds a small Langfuse skill index for the in-app agent.

The package build fetches `https://github.com/langfuse/skills.git` at the pinned
commit in `scripts/generate.mjs`, reads the whitelisted Markdown references,
generates private source index data, and publishes a small runtime API from
`src/index.ts`.

## Public API

```ts
import { readSkill, searchSkill } from "@langfuse/skill-index";

const results = await searchSkill({ query: "trace setup", limit: 5 });
const skill = await readSkill({ id: results[0].id });
```

- `searchSkill({ query, limit? })` returns matching skill snippets and metadata.
- `readSkill({ id })` returns one full skill by id.

The raw generated index is intentionally not exported. Consumers should use the
functions above so the package owns the index format and search implementation.

## Build

```bash
pnpm --filter @langfuse/skill-index run generate
pnpm --filter @langfuse/skill-index run generate:check
pnpm --filter @langfuse/skill-index run build
pnpm --filter @langfuse/skill-index run check
pnpm --filter @langfuse/skill-index run test
```

The Turbo build is cached. The external skills repository input is pinned to a
specific commit in `scripts/generate.mjs`, so changing the remote content requires a
local commit update that Turbo can hash.
