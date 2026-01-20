# Langfuse Development Guidelines

Langfuse is an **open source LLM engineering** platform for developing, monitoring, evaluating and debugging AI applications. This guide provides comprehensive coding standards and development practices for agentic coding assistants.

## Build/Lint/Test Commands

### Build Commands

- `pnpm build` - Build all packages (Turbo monorepo)
- `pnpm run build` (web) - Next.js build with `INLINE_RUNTIME_CHUNK=false`
- `pnpm run build` (worker) - TypeScript compilation to `dist/`
- `pnpm run build` (shared) - TypeScript compilation

### Lint Commands

- `pnpm run lint` - Lint all packages (Turbo monorepo)
- `pnpm run lint` (web) - Next.js lint with `max-warnings 0`
- `pnpm run lint:fix` - Auto-fix linting issues
- **Note**: Linting requires development server running

### Test Commands

- `pnpm test` - Run all tests (Turbo monorepo)
- `pnpm run test` (web) - Jest with multiple project configurations:
  - `test` - Full async server tests
  - `test-sync` - Synchronous server tests
  - `test-client` - Client-side tests
  - `test:watch` - Watch mode
  - `test:e2e` - Playwright end-to-end tests
- `pnpm run test` (worker) - Vitest with forks for isolation
- **Test Isolation**: Tests must be decoupled - no dependencies between test blocks

### Single Test Execution

- **Web**: `pnpm run test-sync -- --testPathPattern="prompts\.v2\.servertest" --testNamePattern="should handle special characters"`
- **Worker**: `pnpm run test -- --run --reporter=verbose specific-test-file.ts`

## Code Style Guidelines

### Import Patterns and Organization

- Use type imports: `import type { User } from "@/types"`
- Consistent import order enforced by ESLint
- Path aliases: `@/*` for `web/src`, workspace imports for packages
- Import resolver configured for TypeScript projects

### File Structure Conventions

- **Features**: All new features in `web/src/features/` with consistent structure:
  ```
  features/[feature-name]/
  ├── server/          # Backend logic (*Router.ts, service.ts)
  ├── components/      # React components
  └── types/           # Feature types
  ```
- **Shared code**: `packages/shared/` with multiple entry points
- **Monorepo**: Turborepo with web (Next.js) and worker (Node.js) packages
- **Database**: Separate schemas for PostgreSQL (Prisma) and ClickHouse

### TypeScript/React Patterns

- **Strict TypeScript**: `strict: true`, `noUnusedLocals: false`, `noUnusedParameters: false`
- **React**: Next.js with Pages router, React 19
- **Components**: Shadcn/ui in `@/src/components/ui`
- **Styling**: Tailwind CSS with custom color palette for light/dark modes
- **API**: TRPC.io for full-stack type-safe APIs

### Naming Conventions

- **Files**: kebab-case for file names (`trace-router.ts`)
- **Variables/Functions**: camelCase (`getTraceById`)
- **Components/Types**: PascalCase (`TraceTable`, `UserType`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Database**: snake_case (Prisma convention)

### Error Handling Approaches

- Custom error types in `shared/src/errors` that map to HTTP status codes
- Try/catch blocks with specific error throwing
- Zod validation with proper error messages
- TRPC error handling built-in
- Use `traceException` for backend observability

### Database Access Patterns

- **PostgreSQL**: Prisma ORM with generated client
- **ClickHouse**: Direct SQL queries via custom client
- **Kysely**: Type-safe SQL query builder
- Database operations through repository/service layers
- **Tenant Isolation**: Always filter by `projectId` for multi-tenant data

### API Layer Architecture (tRPC Patterns)

- **Router**: `createTRPCRouter` with procedure composition
- **Procedures**: `publicProcedure`, `protectedProcedure` with middleware
- **Authentication**: NextAuth integration with JWT
- **Authorization**: RBAC system with organization/project membership
- **Entitlements**: Plan-based feature gating
- **Validation**: Zod schemas for input/output typing

## Architecture Overview

### Layered Architecture

```
Web Package (Next.js 14)
├── tRPC API ──────┐
│  HTTP Request    │
│     ↓            │
│  tRPC Procedure  │
│     ↓            │
│  Service         │
│     ↓            │
└── Database       └── [Optional] → Redis BullMQ Queue

Worker Package (Express)
├── BullMQ Queue Job
│     ↓
├── Queue Processor
│     ↓
├── Service
│     ↓
└── Database
```

**Key Principles:**

- **Web**: tRPC procedures OR public API routes → Services → Database
- **Worker**: Queue processors → Services → Database
- **Shared**: Business logic, types, utilities across packages

## Cursor Rules (Always Applied)

1. **Authorization & RBAC**: See `web/src/features/rbac/README.md`
2. **Banner Positioning**: Use `top-banner-offset` instead of `top-0` for banner-aware positioning
3. **Entitlements**: Check `web/src/features/entitlements/README.md` for feature availability
4. **Frontend Features**: Next.js + Pages router, TRPC, Shadcn/ui, Tailwind
5. **General**: Linting requires dev server; use `pnpm run dx` for full setup
6. **Global**: Turborepo monorepo, domain objects in shared package
7. **Tests**: Decoupled test blocks, avoid `pruneDatabase` in async tests

## Development Workflow

### Setup

- **Full Environment**: `pnpm run dx` (includes DB seeding, docker setup)
- **Quick Restart**: `pnpm run dev` (assumes existing DB)
- **Clean Reset**: `pnpm run nuke` (remove all node_modules and build files)

### Observability & Monitoring

- **Backend**: OpenTelemetry + DataDog (NOT Sentry)
- **Frontend**: Sentry for error tracking
- **Logging**: Winston logger with trace context
- **Instrumentation**: Auto-instrumented spans for API routes

### Testing Strategy

- **Integration Tests**: Jest in `web/src/__tests__/async/`
- **tRPC Tests**: Full procedure testing with authentication
- **Service Tests**: Repository/service function testing
- **Worker Tests**: Vitest for queue processors and streams
- **E2E Tests**: Playwright for UI workflows

## Common Anti-Patterns

❌ Business logic in procedures/routes (delegate to services)
❌ Direct `process.env` usage (always use `env.mjs`/`env.ts`)
❌ Missing `projectId` filter on tenant-scoped queries
❌ `console.log` instead of `logger`/`traceException`
❌ Empty catch blocks or missing error handling
❌ Type assertions (`as any`, `@ts-ignore`)
❌ Missing input validation (always use Zod v4)

## Quick Reference Examples

### tRPC Procedure

```typescript
export const traceRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getTraceById(input.traceId, input.projectId);
    }),
});
```

### Service Pattern

```typescript
// Service delegates to repository
export const getTraceById = async (traceId: string, projectId: string) => {
  return await prisma.trace.findUnique({
    where: { id: traceId, projectId }, // Tenant isolation
  });
};
```

### Error Handling

```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  traceException(error); // Records to OpenTelemetry span
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Operation failed",
  });
}
```

## Commit Standards

- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- Automated releases with `release-it`
- Pre-commit hooks enforce formatting and linting

## Additional Resources

- **Contributing Guide**: `CONTRIBUTING.md` for detailed setup instructions
- **Backend Guidelines**: Use `backend-dev-guidelines` skill for detailed patterns
- **Architecture Docs**: See README for system overview
- **Domain Models**: Core business objects in `packages/shared/src/domain/`
