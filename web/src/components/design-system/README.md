# Design System

This folder contains **reusable, primitive, presentational UI components**.

Do **not** include:

- Feature-specific components (e.g. `TracePanel`)
- Logic-heavy components

---

## Principles

- Presentational only (no business logic)
- Explicit, strictly typed APIs
- Consistent patterns over flexibility
- Props over context (no React Context)

---

## Rules

### Imports

Design-system files may import other design-system files, shared utilities (`src/utils`, `src/hooks`), and third-party libraries. They must not import from the outer `src/components` tree or `src/features`.

---

### Structure

- Only a single component export per file
- Folder name = component name

```
design-system/
  Button/
    Button.tsx
    Button.stories.tsx
```

Components with subcomponents must expose them through the single exported
component using `Object.assign`:

```tsx
// ✅ Single component export with compound subcomponents
const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
});

export { Alert };

<Alert>
  <Alert.Title>Title</Alert.Title>
  <Alert.Description>Description</Alert.Description>
</Alert>

// ❌ Separate component exports
<Alert>
  <AlertTitle>Title</AlertTitle>
  <AlertDescription>Description</AlertDescription>
</Alert>
```

---

### Styling & Variants

- No `className` or `style` props
- No arbitrary values (e.g. `#fff`, `12px`)
- Use explicit enums:

  ```ts
  size: "sm" | "md" | "lg";
  variant: "primary" | "secondary";
  ```

- Use `cva` for all variants

---

### Layout

- No margin on root element
- Layout/spacing is handled externally
- Internal spacing is allowed

---

### Props & Types

- Use explicit enums (no free-form values)
- Prop values must never match Tailwind class names:
  - ✅ `size="md"`
  - ❌ `size="w-5 h-5"`
- Enforce mutually exclusive props at type level
- Use **positive naming**:
  - ✅ `suffix={null}`
  - ❌ `noSuffix`

- Boolean props must use `is` / `should`:
  - `isLoading`, `shouldTruncate`

### Logic Separation

Design-system components own **visual states**, not business logic.

Logic-heavy components must reuse design-system components for visuals instead of recreating UI internally.

```tsx
// ✅ Button owns the loading visual state
type ButtonProps = {
  isLoading: boolean;
};

const PromiseButton = (props: PromiseButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);

  return <Button isLoading={isLoading} />;
};
```

```tsx
// ❌ PromiseButton reimplements Button loading visuals
const PromiseButton = (props: PromiseButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);

  if (isLoading) {
    return (
      <div>
        <Spinner />
      </div>
    );
  }

  return <Button isLoading={isLoading} />;
};
```

---

## Summary (strict)

- A single component export per file
- No `className` / `style`
- No px / hex values as props
- Use enums + `cva`
- No root margin
- No React Context
- No imports from the outer `src/components` tree or from `src/features`
- Props must be explicit, typed, and use a positive name
- Prop values must not mirror Tailwind class names
- Boolean props → `is` / `should`
- Design ≠ logic (separate them)

---

If unsure: **only include reusable, design-only primitives**.
