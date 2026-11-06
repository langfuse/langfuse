# Embedded Langfuse skills

`LANGFUSE_SKILLS` contains both original upstream skills for MCP clients. `LANGFUSE_HALO_SKILLS` contains only `langfuse`, with a dedicated Halo entrypoint and the same upstream supporting files.

Maintain Halo's entrypoint in `halo/langfuse/SKILL.md` alongside Halo tooling changes. Maintain shared references and the original entrypoints in `langfuse/skills`. The generator filters out the upstream root file, appends a table of contents with each bundled Markdown reference's frontmatter name, description, and path to the local entrypoint, and recomputes its resource metadata. The original reference resources are reused; the reference list is not maintained by hand.

Regenerate the checked-in bundle with:

```sh
pnpm --filter @repo/langfuse-skills run sync
pnpm --filter @repo/langfuse-skills run sync:check
```

Both commands default to upstream `main`. Set `LANGFUSE_SKILLS_REF` to the commit recorded in `src/generated/skills.js` when updating only the local Halo entrypoint. Do not edit generated files manually.

The worker and local assistant seeder consume the Halo catalog. Hosted publishing is managed in the skills repository; generation here does not upload or change hosted skills. Tagged hosted versions retain precedence over the bundled fallback.
