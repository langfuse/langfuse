# Spielwiese Design System

This folder is the tracked source of truth for Spielwiese's shadcn setup.

## Current defaults

- Primitive library: `base`
- Preset: `b1D0eCA7`
- Style: `base-nova`
- Base color: `slate`
- CSS variables: `true`
- Global token file: `src/styles/globals.css`
- Primitive implementations:
  `src/features/spielwiese/design-system/primitives/*`
- Public runtime import surface:
  `src/features/spielwiese/ui/*`

## Runtime boundary

- Canonical primitive implementations live in
  `src/features/spielwiese/design-system/primitives/*`.
- Runtime imports should go through `src/features/spielwiese/ui/*`.
- Higher-level reusable pieces live in `src/features/spielwiese/components/*`.
- Shell layout lives in `src/features/spielwiese/shell/*`.
- Pages compose the shell and components from `src/features/spielwiese/pages/*`.

## Lint boundary

The Spielwiese ESLint rules enforce the design-system boundary:

- `ui/*` cannot depend on `components/*`, `shell/*`, `pages/*`, `mock/*`, or `adapters/*`
- `components/*` cannot depend on `shell/*`, `pages/*`, `mock/*`, or `adapters/*`
- `shell/*` cannot depend on `pages/*`, `mock/*`, or `adapters/*`
- All Spielwiese code must avoid shared `src/components/ui/*` and use local
  primitives from `src/features/spielwiese/ui/*`
