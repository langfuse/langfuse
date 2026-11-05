# @langfuse/icons

Typed icon boundary for the web app. This package wraps Lucide and the supported React Icons collections so icon sizes and stroke widths follow the design system without consumer-side Tailwind classes or an icon-sizing ESLint rule.

```tsx
import { Search, type IconComponent } from "@langfuse/icons";
import { SiGithub } from "@langfuse/icons/si";
import { TbBrandAzure } from "@langfuse/icons/tb";

<Search size="base" color="default" aria-hidden />;
<SiGithub size="lg" aria-label="GitHub" />;
```

## API

| `size`           | Pixels |
| ---------------- | ------ |
| `sm`             | 12     |
| `base` (default) | 14     |
| `lg`             | 20     |
| `xl`             | 28     |

Lucide strokes are fixed at 2. Icons inherit `currentColor` and default to inline `flex-shrink: 0`. Standard SVG attributes, accessibility attributes, event handlers, and SVG refs are supported. Use `IconComponent` for props that accept an icon component, and `IconProps`, `IconSize`, or `IconColor` when defining related APIs.

The `color` prop accepts semantic tokens, not arbitrary SVG color strings:

| `color`             | CSS token                                   |
| ------------------- | ------------------------------------------- |
| `inherit` (default) | Parent's text color; no inline color is set |
| `default`           | `--icon-foreground`                         |
| `foreground`        | `--foreground`                              |
| `muted`             | `--muted-foreground`                        |
| `secondary`         | `--foreground-secondary`                    |
| `tertiary`          | `--foreground-tertiary`                     |
| `destructive`       | `--destructive`                             |

Colors resolve as `hsl(var(--token))` through the app's runtime CSS variables, so light/dark themes remain in CSS. Use `inherit` for icons whose hover, selected, or disabled color is owned by the parent button or menu item. An explicit color sets an inline style and takes precedence over color classes; keep conditional classes in the raw escape hatch only when the semantic API cannot express the state. `__rawStyle.color` remains an explicit override.

`className`, `style`, `width`, `height`, numeric `size`, and `strokeWidth` are intentionally rejected by TypeScript. The wrapper also drops forbidden styling props at runtime. Import icons from this package, not directly from `lucide-react` or `react-icons`; the web app's import restriction enforces that boundary.

## Escape hatches

Prefer semantic sizes, inherited color, and layout styling on the parent. **Avoid `__rawClassName` and `__rawStyle` for ordinary icon styling.** They exist for requirements the API cannot express, including legacy styles, animated loaders, and illustration-sized SVGs outside the icon scale.

```tsx
<Search size="sm" color="muted" __rawClassName="animate-spin" />;
<Search __rawStyle={{ width: 48, height: 48 }} />;
```

These props deliberately bypass the design-system constraints. They can override dimensions, as can ancestor CSS targeting SVGs; this is an API boundary, not CSS isolation. Never use an icon's raw styling to size its clickable target—size the surrounding button instead.

## Generated exports

The root exports all Lucide icons and their aliases. `/si` exports Simple Icons; `/tb` exports Tabler icons. All exports are static, with pure wrapper calls and `sideEffects: false`, so unused icons can be tree-shaken. There is no runtime namespace lookup or icon registry.

Each icon wrapper lives in its own JavaScript file under `dist/generated/`; aliases share the same wrapper. `dist/index.js`, `dist/si.js`, and `dist/tb.js` re-export those wrappers, preserving the public imports. Types are consolidated in `dist/index.d.ts`, `dist/si.d.ts`, and `dist/tb.d.ts` so TypeScript does not need to load a declaration module per icon. TypeScript compiles the shared `src/create-icon.tsx` implementation and emits its declarations, so all generated icons use the same inferred component contract. The entire `dist/` directory is generated and gitignored. Setup generates the exports automatically. Turbo runs generation before package tests, typechecking, and dependent builds, and caches the generated files. The setup hook skips manifest-only Docker install layers; the subsequent build generates the files once source is available.

After updating the upstream libraries, regenerate and validate the exports:

```sh
pnpm --filter @langfuse/icons generate
pnpm exec turbo run typecheck test --filter=@langfuse/icons
```

The package exports ESM JavaScript and TypeScript declarations; consuming build tools do not need to transpile TypeScript source.
