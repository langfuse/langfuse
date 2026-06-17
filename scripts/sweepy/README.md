# Sweepy

Internal Deno CLI for repository cleanup and refactoring tasks.

## Run

From the repository root:

```sh
./scripts/sweepy/main.ts
```

This prints the available commands.

## Commands

### `react-component-doctor`

Interactively inspects and refactors React component props. The command asks
for a component once, then lets you run multiple actions against that component
without restarting the CLI.

```sh
./scripts/sweepy/main.ts react-component-doctor
```

The script prompts for:

1. Component name, defaulting to `Button`.
2. Props type/interface name, defaulting to `${ComponentName}Props`.
3. Usage search root, defaulting to `web/src`.
4. TypeScript config path, defaulting to `web/tsconfig.json`.
5. Component definition file selection if multiple candidates are found. Choose
   `other` to manually input a path.

After setup, choose one of these actions:

1. `freeze prop`
2. `replace prop value`
3. `change component`
4. `exit`

Relative paths entered in prompts are resolved from the repository root.

## Freeze Prop Action

Refactors a component prop into stricter component variants. The action prompts
for the prop name, defaulting to `className`.

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

## Replace Prop Value Action

Replaces one static component prop value with another prop value.

The action reads the selected component props type/interface and prompts from
the definition:

1. Source prop.
2. Source value from the source prop literal values.
3. Target prop.
4. Target value from the target prop literal values.

If a selected prop is typed as `string`, `number`, or another non-literal type,
the action stops and asks you to run `freeze prop` first.

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
