# Sweepy

Internal Deno CLI for repository cleanup and refactoring tasks.

## Run

From the repository root:

```sh
./scripts/sweepy/main.ts
```

This prints the available commands.

## Commands

### `freeze-prop`

Refactors component props into stricter component variants.

```sh
./scripts/sweepy/main.ts freeze-prop
```

The script prompts for:

1. Component name, defaulting to `Button`.
2. Prop name, defaulting to `className`.
3. Props type/interface name, defaulting to `${ComponentName}Props`.
4. Usage search root, defaulting to `web/src`.
5. TypeScript config path, defaulting to `web/tsconfig.json`.
6. Component definition file selection if multiple candidates are found. Choose
   `other` to manually input a path.

Relative paths entered in prompts are resolved from the repository root.

## What It Does

1. Finds JSX usages and destructured prop defaults with supported string or
   numeric prop values. For `className`, this also includes simple `cn(...)`
   wrappers.
2. Rewrites the prop type to a strict union of discovered values.
   Inline object props are first extracted to a named `type` above the
   component.
3. Rewrites supported JSX usages so finite dynamic expressions become explicit
   prop variants.
4. Asks before saving files.

Supported `className` expressions are limited to finite class string variants.
This includes string literals, `cn(...)` wrappers, ternaries with static
branches, `condition && "class"`, and template literals whose interpolations are
also finite class string variants. Multiple conditionals are expanded into a
nested conditional prop expression. Constants, object style class names,
function calls, and dynamic `cn(...)` arguments are reported and left unchanged.

Other props support string and numeric literals, plus ternaries whose branches
are also supported literal values. Constants and function calls are reported and
left unchanged.

### `replace-prop-value`

Replaces one static component prop value with another prop value.

```sh
./scripts/sweepy/main.ts replace-prop-value
```

The script prompts for:

1. Component name, defaulting to `LangfuseIcon`.
2. Source prop, defaulting to `className`.
3. Source value, defaulting to `h-8 w-8`.
4. Target prop, defaulting to `size`.
5. Target value, defaulting to `32`.
6. Props type/interface name, defaulting to `${ComponentName}Props`.
7. Usage search root, defaulting to `web/src`.
8. TypeScript config path, defaulting to `web/tsconfig.json`.
9. Component definition file selection if multiple candidates are found. Choose
   `other` to manually input a path.

For example, the defaults rewrite:

```tsx
<LangfuseIcon className="h-8 w-8" />
```

to:

```tsx
<LangfuseIcon size={32} />
```

If the target prop already exists with the requested value, the source prop is
removed. If it exists with a different value, the usage is reported and left
unchanged.

The source value is also removed from the component prop definition. The target
value is added to the target prop definition when it is missing.

## Verify

```sh
deno task --config scripts/sweepy/deno.json check
```

The Deno config and lockfile are intentionally colocated in this directory so
the tool does not add dependencies to any repo `package.json`.
