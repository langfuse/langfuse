# Dataset Mutations

## Rule

Always use functions in this directory. Never use direct Prisma calls.

## Why

These functions handle:

1. **Name validation** - Dataset names validated for folder structure (`/` separator, no leading/trailing slashes, no `//`)
2. **Upsert logic** - Correct handling of unique constraint on `(projectId, name)`
3. **Null handling** - Proper undefined vs null semantics for optional fields

## Functions

- `upsertDataset()` - Create or update by name
- `updateDataset()` - Update by ID

## Name Validation Rules

See: `packages/shared/src/features/datasets/validation.ts`
