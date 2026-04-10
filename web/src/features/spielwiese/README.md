# Spielwiese

`spielwiese` is the dev-only redesign track for the future Langfuse shell.

The tracked design-system source of truth lives under
`src/features/spielwiese/design-system/*`. Runtime primitives live under
`src/features/spielwiese/ui/*`, and all Spielwiese shells/pages/components
should consume that primitive layer instead of shared app primitives.

## Boundaries

- Keep all composed UI local to `src/features/spielwiese/**`.
- Do not import from `src/components/nav/**`, `src/components/layouts/app-layout/**`, `src/product/**`, or other feature-local UI.
- Prefer semantic Tailwind utilities and the shared token system in
  `src/styles/globals.css`.
- Do not mix shared `src/components/ui/*` primitives into Spielwiese shell or
  widget composition.

## shadcn provenance

- Tracked design-system manifest:
  `src/features/spielwiese/design-system/components.json`
- Tracked design-system config:
  `src/features/spielwiese/design-system/config.ts`
- Target preset: `b1D0eCA7`
- Starting block: `@shadcn/sidebar-15`
- Generator workspace for local CLI inspection only: `.context/spielwiese-shadcn`

When package installs are allowed, initialize the sandbox with:

```bash
mkdir -p .context/spielwiese-shadcn
cd .context/spielwiese-shadcn
npx shadcn@latest init --name spielwiese-shadcn --template next --base base --preset b1D0eCA7 --yes
```

The current repo host blocks scaffold-time dependency installs, so the initial
Spielwiese primitives were adapted from the shadcn CLI `view` workflow against a
lightweight Base sandbox config:

```bash
npx shadcn@latest view @shadcn/sidebar-15 --cwd .context/spielwiese-shadcn
npx shadcn@latest view @shadcn/sidebar --cwd .context/spielwiese-shadcn
```

Only the primitives actually needed for the phase-1 dashboard shell were
vendored into `src/features/spielwiese/ui/*`.
