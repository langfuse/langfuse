# Prompt Mutations

## Rule

Always use functions in this directory. Never use direct Prisma calls.

## Why

These functions handle:

1. **Cache invalidation** - Redis cache must be invalidated on every prompt change
2. **Event sourcing** - Changes tracked for audit/analytics via `promptChangeEventSourcing()`
3. **Label management** - Logic to move labels between versions (production, latest, etc.)
4. **Validation** - Prompt name validation, variable extraction, dependency parsing
5. **Transaction safety** - Multiple related DB operations in correct order

## Functions

- `createPrompt()` - Create new prompt version
- `updatePrompts()` - Update prompt labels/metadata
- `getPromptByName()` - Fetch with caching
- `getPromptsMeta()` - List prompts

## Name Validation Rules

See: `packages/shared/src/features/prompts/validation.ts`
