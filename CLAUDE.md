# CLAUDE.md

## Project Overview

Langfuse is an open-source LLM engineering platform that helps teams collaboratively develop, monitor, evaluate, and debug AI applications.
The main feature areas are tracing, evals and prompt management. Langfuse consists of the web application (this repo), documentation, python SDK and javascript/typescript SDK.
This repo contains the web application, worker, and supporting packages but notably not the JS nor Python client SDKs.

## Repository Structure
High level structure. There are more folders (eg for hooks etc).
```
langfuse/
├── web/                     # Next.js 14 frontend/backend application
│   ├── src/
│   │   ├── components/     # Reusable UI components (shadcn/ui)
│   │   ├── features/       # Feature-specific code organized by domain
│   │   ├── pages/          # Next.js pages (Pages Router)
│   │   └── server/         # tRPC API routes and server logic
│   └── public/             # Static assets
├── worker/                  # Express.js background job processor
│   └── src/
│       ├── queues/         # BullMQ job queues
│       └── services/       # Background processing services
├── packages/
│   ├── shared/             # Shared types, schemas, and utilities
│   │   ├── prisma/         # Database schema and migrations
│   │   └── src/            # Shared TypeScript code
│   ├── config-eslint/      # ESLint configuration
│   └── config-typescript/  # TypeScript configuration
├── ee/                     # Enterprise Edition features
├── fern/                   # API documentation and OpenAPI specs
├── generated/              # Auto-generated client code
└── scripts/                # Development and deployment scripts
```

## Repository Architecture
This is a **pnpm + Turbo monorepo** with the following key packages:

### Core Applications
- **`/web/`** - Next.js 14 application (Pages Router) providing both frontend UI and backend APIs
- **`/worker/`** - Express.js background job processing server
- **`/packages/shared/`** - Shared database schema, types, and utilities

### Supporting Packages
- **`/ee/`** - Enterprise Edition features (separate licensing)
- **`/packages/config-eslint/`** - Shared ESLint configuration
- **`/packages/config-typescript/`** - Shared TypeScript configuration

## Development Commands

### Development
```sh
pnpm i               # Install dependencies
pnpm run dev         # Start all services (web + worker)
pnpm run dev:web     # Web app only (localhost:3000) - **used in most cases!**
pnpm run dev:worker  # Worker only
pnpm run dx          # Full initial setup: install deps, reset DBs, resets node modules, seed data, start dev. USE SPARINGLY AS IT WIPES THE DATABASE & node_modules
```

### Database Management
database commands are to be run in the `packages/shared/` folder.
```sh
pnpm run db:generate       # Build prisma models
pnpm run db:migrate        # Run Prisma migrations
pnpm run db:reset          # Reset and reseed databases
pnpm run db:seed           # Seed with example data
```

### Infrastructure
```sh
pnpm run infra:dev:up      # Start Docker services (PostgreSQL, ClickHouse, Redis, MinIO)
pnpm run infra:dev:down    # Stop Docker services
```

### Building & Type Checking
```sh
pnpm --filter=PACKAGE_NAME run build  # Runs the build command, will show real typescript errors etc.
pnpm tc                               # Fast typecheck across all packages (alias for pnpm typecheck)
pnpm build:check                      # Full Next.js build to alternate dir (can run parallel with dev server)
```

### Testing in Web Package
The web package uses JEST for unit tests.
`web` related tests must go into the `web/src/__tests__/` folder.
```sh
pnpm test --testPathPatterns="$FILE_LOCATION_PATTERN" --testNamePattern="$TEST_NAME_PATTERN"
# For client tests:
pnpm test-client --testPathPatterns="buildStepData" --testNamePattern="buildStepData"
```

### Testing in the Worker Package
The worker uses `vitest` for unit tests.
```sh
pnpm run test --filter=worker -- $TEST_FILE_NAME -t "$TEST_NAME"
```

### Utilities
```bash
pnpm run format            # Format code across entire project
pnpm run nuke              # Remove all node_modules, build files, wipe database, docker containers. **USE WITH CAUTION**
```

## Technology Stack

### Web Application (`/web/`)
- **Framework**: Next.js 14 (Pages Router)
- **APIs**: tRPC (type-safe client-server communication) + REST APIs for public access
- **Authentication**: NextAuth.js/Auth.js
- **Database**: Prisma ORM with PostgreSQL
- **Analytics Database**: ClickHouse (high-volume trace data)
- **Validation**: Zod schemas, we use zodv4 (always import from `zod/v4`)
- **Styling**: Tailwind CSS with CSS variables for theming
- **Components**: shadcn/ui (Radix UI primitives)
- **State Management**: TanStack Query (React Query) + tRPC
- **Charts**: Recharts

### Worker Application (`/worker/`)
- **Framework**: Express.js
- **Queue System**: BullMQ with Redis
- **Purpose**: Async processing (data ingestion, evaluations, exports, integrations)

### Infrastructure
- **Primary Database**: PostgreSQL (via Prisma ORM)
- **Analytics Database**: ClickHouse
- **Cache/Queues**: Redis
- **Blob Storage**: MinIO/S3

## Development Guidelines

### Frontend Features
- All new features go in `/web/src/features/[feature-name]/`
- Use tRPC for full-stack features (entry point: `web/src/server/api/root.ts`)
- Follow existing feature structure for consistency
- Use shadcn/ui components from `@/src/components/ui`
- Custom reusable components go in `@/src/components`

### Public API Development
- All public API routes in `/web/src/pages/api/public`
- Use `withMiddlewares.ts` wrapper
- Define types in `/web/src/features/public-api/types` with strict Zod v4 objects
- Add end-to-end tests (see `datasets-api.servertest.ts`)
- Manually update Fern API specs in `/fern/`, then regenerate OpenAPI spec via Fern CLI

### Authorization & RBAC
- Check `/web/src/features/rbac/README.md` for authorization patterns
- Implement proper entitlements checking (see `/web/src/features/entitlements/README.md`)

### Database
- **Dual database system**: PostgreSQL (primary) + ClickHouse (analytics)
- Use `golang-migrate` CLI for database migrations
- All database operations go through Prisma ORM for PostgreSQL
- Foreign key relationships may not be enforced in schema to allow unordered ingestion

### Testing
- Jest for API tests, Playwright for E2E tests
- For backend/API changes, tests must pass before pushes
- Add tests for new API endpoints and features
- When writing tests, focus on decoupling each `it` or `test` block to ensure that they can run independently and concurrently. Tests must never depend on the action or outcome of previous or subsequent tests.
- When writing tests, especially in the __tests__/server directory, ensure that you avoid `pruneDatabase` calls.

### Code Conventions
- **Pages Router** (not App Router)
- Follow conventional commits on main branch
- Use CSS variables for theming (supports auto dark/light mode)
- TypeScript throughout
- Zod v4 for all input validation

## Environment Setup

- **Node.js**: Version 24 (specified in `.nvmrc`)
- **Package Manager**: pnpm v9.5.0
- **Database Dependencies**: Docker for local PostgreSQL, ClickHouse, Redis, MinIO
- **Environment**: Copy `.env.dev.example` to `.env`

## Login for Development

When running locally with seed data:
- Username: `demo@langfuse.com`
- Password: `password`
- Demo project URL: `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`

## Linear MCP
To get a project, use the `get_project` capability with the full project name as it is in the title.
- bad: message-placeholder-in-chat-messages-2beb6f02ec48
- good: Message placeholder in chat messages

## Front-end Tips

### Window Location Handling
- Whenever you want to use or do use window.location..., ensure that you also add proper handling for a custom basePath

## TypeScript Best Practices
- In TypeScript, if possible, don't use the `any` type
- **Use a single params object for functions with multiple arguments** - This makes code more readable at call sites and prevents bugs when arguments of the same type are accidentally swapped:

```typescript
// ❌ Bad - positional arguments are unclear and can be swapped without type errors
function sendMessage(userId: string, sessionId: string, projectId: string) {
  // ...
}
sendMessage(someString, someOtherString, anotherString); // Which is which?

// ✅ Good - params object makes intent clear and prevents argument swapping
function sendMessage(params: { userId: string; sessionId: string; projectId: string }) {
  // ...
}
sendMessage({ userId: someString, sessionId: someOtherString, projectId: anotherString });
```

## General Coding Guidelines
- For easier code reviews, prefer not to move functions etc around within a file unless necessary or instructed to do so

## Development Tips
- Before trying to build the package, try running the linter once first
