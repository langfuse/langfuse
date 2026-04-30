## General

This component contains Langfuses reusable, primitive components. Components that are specific to a single use-case (e.g. TracePanel) should not live in this folder.

All components within this folder should adhere to the rules below.

## Rules

- One component per file
- Components should not expose `className` OR `style` props, variants should be explicit (e.g. `size` or `variant` prop)
- Props that have the shape of hex codes or px values are forbidden, use enums like `"sm" | "md" | "lg"` instead
- Components should not have ANY margin on the root elements, spacing is owned by layout components. Internal margins are allowed.
- cva should be used for defining variants
- If props or variants are mutually exclusive, it must be expressed on the type level
- Design only components should be extracted from logic heavy components (e.g. a `PromiseButton` with an included callback loading state, should only control a `isLoading` prop of the `Button` component instead of defining a spinner with custom class names and styling in the same component)
- Avoid React context, pass everything via props so that TypeScript can validate it
- Always use positive prop naming (`suffix={null}` over `withoutSuffix` or `noSuffix`, `withDismiss={false}`)
- Boolean props should have an "is" or "should" prefix (e.g. `isLoading` over `loading`)

## File organization:

Rules:

- Folder name & filename should match component name

Hirarchy:

- design-system (root)
  - Button
    - Button.tsx
    - Button.stories.tsx
