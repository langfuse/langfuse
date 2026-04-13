# Spielwiese

`spielwiese` is the dev-only redesign track for the future Langfuse shell.

## Evren Case Study

This track currently contains a case-study-style redesign of the Langfuse first
run experience, centered on the idea that users do not think in product
features first. They arrive with a prompt they want to improve.

Start at `/dev/spielwiese` for the introduction. From there, everything flows.

The current published narrative focuses on:

- `Approach`: reframing the product around the setup moment instead of exposing
  monitoring too early.
- `Outcome`: a short embedded video placeholder inside the intro page.
- `Colophon`: the tools and skills used to produce the work.

Core routes:

- Start here: `/dev/spielwiese`
- Onboarding flow: `/dev/spielwiese/onboarding`
- Dashboard prototype: `/dev/spielwiese/dashboard#home`

Where to find the changes:

- Intro page composition:
  `src/features/spielwiese/pages/SpielwieseIntroPage.tsx`
- Intro page content and colophon entries:
  `src/features/spielwiese/components/spielwieseSetupMomentContent.ts`
- Onboarding shell:
  `src/features/spielwiese/pages/SpielwieseOnboardingPage.tsx`
- Onboarding canvas:
  `src/features/spielwiese/onboarding/components/SpielwieseOnboardingCanvas.tsx`
- Step scene wrapper:
  `src/features/spielwiese/onboarding/components/SpielwieseOnboardingStepScene.tsx`
- Question panel:
  `src/features/spielwiese/onboarding/components/SpielwieseOnboardingQuestionPanel.tsx`

Current status:

- Intro page and publication framing are in place.
- Onboarding is still actively being polished.
- This branch is suitable for a draft PR, not a final review.

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
