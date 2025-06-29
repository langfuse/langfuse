# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

**Environment Setup:**
```bash
# Quick development setup with infrastructure
pnpm dx

# Setup without infrastructure (assumes external DB/Redis)
pnpm dx:skip-infra

# Manual setup steps
pnpm i && pnpm run infra:dev:up && pnpm run db:migrate && pnpm run db:seed:examples
```

**Development:**
```bash
# Run both web and worker in development
pnpm dev

# Run only web application
pnpm dev:web

# Run only worker
pnpm dev:worker
```

**Database:**
```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Seed database with examples
pnpm db:seed:examples

# Reset database (use with caution)
pnpm --filter=shared run db:reset
```

**Testing:**
```bash
# Run all tests
pnpm test

# Web-specific tests
cd web && pnpm test        # Server-side tests
cd web && pnpm test-client # Client-side tests  
cd web && pnpm test:e2e    # End-to-end tests

# Worker tests
cd worker && pnpm test
```

**Build & Deploy:**
```bash
# Build all packages
pnpm build

# Start production servers
pnpm start

# Lint all packages
pnpm lint
```

## Architecture Overview

Langfuse v3 is a **monorepo** using **pnpm workspaces** and **Turbo** for build orchestration with a modern distributed architecture:

### Core Applications
- **`web/`** - Next.js full-stack application with hybrid App Router + Pages Router, tRPC APIs, and database access
- **`worker/`** - Express.js background worker container that processes events asynchronously

### Shared Packages
- **`packages/shared/`** - Shared code between web and worker (database schema, utilities, types)
- **`ee/`** - Enterprise Edition features (license-gated functionality)
- **`packages/config-*`** - Shared ESLint and TypeScript configurations

### Infrastructure Components (Langfuse v3)
- **PostgreSQL (OLTP)** - Primary transactional database for metadata, users, projects, configurations
- **ClickHouse (OLAP)** - High-performance analytics database for observability data (traces, observations, scores)
- **Redis** - Cache and queue management for asynchronous event processing (BullMQ)
- **S3/Blob Storage** - Object storage for raw events, multi-modal attachments, and large payloads
- **LLM API/Gateway** - Optional external component for model inference (can be same VPC or VPC-peered)

### Key Technologies
- **Authentication:** NextAuth.js with custom providers and RBAC
- **API:** tRPC for type-safe internal APIs, REST APIs for public endpoints
- **Frontend:** Next.js, React, Tailwind CSS, Shadcn/ui components
- **Queue System:** BullMQ with Redis for reliable background job processing
- **Data Pipeline:** Asynchronous event processing with worker containers

## Feature Development Patterns

### Full-Stack Features
- Place new features in `web/src/features/[feature-name]/`
- Follow the pattern: `components/`, `server/`, `hooks/`, `types.ts`
- Use tRPC routers for internal APIs (entry point: `web/src/server/api/root.ts`)
- Components use tRPC hooks: `api.featureName.action.useQuery()` or `useMutation()`
- All UI pages use Pages Router patterns with standard Next.js navigation

### Public API Routes (External REST APIs)
- Located in `web/src/pages/api/public/` for external users/SDKs
- Use `withMiddlewares.ts` wrapper for authentication/validation
- Define types in `web/src/features/public-api/types/`
- Add tests following pattern in `web/src/__tests__/async/`
- Update Fern API documentation in `/fern/`

### tRPC Routes (Internal APIs)
- Main API layer used by all UI components
- Define in `web/src/features/[feature]/server/` routers
- Aggregate in `web/src/server/api/root.ts`
- Use hooks in components: `api.llmApiKey.all.useQuery()`
- Single endpoint handles all tRPC: `/api/trpc/[trpc].ts`

### Authorization & RBAC
- Project-level permissions managed via `ProjectRole` enum
- Organization-level permissions via `OrganizationRole` enum  
- Check access using utilities in `web/src/features/rbac/utils/`
- Enterprise features gated by entitlements system

### UI Components
- Use Shadcn/ui components from `web/src/components/ui/`
- Custom reusable components in `web/src/components/`
- Follow Tailwind CSS patterns with automatic light/dark mode support

### Database Changes
- **PostgreSQL:** Update `packages/shared/prisma/schema.prisma`, run `pnpm db:generate`, create migrations with `pnpm db:migrate`
- **ClickHouse:** Schema migrations in `packages/shared/clickhouse/migrations/` (clustered/unclustered variants)
- Use `pnpm --filter=shared run ch:reset` for ClickHouse development reset

### Background Jobs & Event Processing
- Define queues in `worker/src/queues/` using BullMQ patterns
- Job handlers in `worker/src/features/` for asynchronous processing
- **Data Flow:** UI/API/SDKs → Web Server → Redis (Queue) → Async Worker → ClickHouse/PostgreSQL
- **Storage Strategy:** 
  - Transactional data (users, projects) → PostgreSQL
  - Observability data (traces, observations, scores) → ClickHouse
  - Large objects (raw events, multi-modal attachments) → S3/Blob Storage
- **Optional Components:**
  - LLM API/Gateway for playground features and evaluations
  - All components can run within same VPC or be VPC-peered for security

## Testing Patterns

### Test Organization
- **Server tests:** `web/src/__tests__/async/` (database-dependent)
- **Client tests:** `web/src/__tests__/` with `.clienttest.ts` suffix
- **E2E tests:** `web/src/__e2e__/` using Playwright
- **Worker tests:** `worker/src/__tests__/`

### Running Specific Tests
```bash
# Single test file
cd web && pnpm test -- datasets-api.servertest.ts

# Watch mode
cd web && pnpm test:watch

# E2E tests
cd web && pnpm test:e2e
```

## Project Structure

### Web Application Structure
```
web/src/
├── pages/                 # Pages Router (PRIMARY - all UI pages)
│   ├── api/              # REST APIs (/api/public/*, /api/auth/*, /api/trpc/*)
│   ├── project/          # Project UI pages (main application)
│   └── auth/             # Authentication pages
├── app/                   # App Router (MINIMAL - 2 specialized endpoints)
│   └── api/              # Webhooks & streaming endpoints only
├── server/               # tRPC routers (main API layer)
│   └── api/              # Business logic routers
├── features/            # Feature-based organization
│   └── [feature]/       # Each feature: components/, server/, hooks/, types/
├── components/           # Shared React components
└── hooks/               # Shared React hooks
```

### Key Architectural Notes
- **Primary**: Pages Router handles ALL UI pages and user navigation
- **tRPC**: Main API layer - 99% of components use tRPC hooks (`api.*.useQuery()`)
- **App Router**: Minimal usage - only 2 specialized endpoints (webhooks, streaming)
- **External APIs**: REST endpoints in `pages/api/public/` for SDKs/external users
- **Feature-Based**: Business logic organized in `features/[name]/`

## Important Notes

- Always run `pnpm db:generate` after Prisma schema changes
- Use `pnpm dx` for quick development environment setup
- Check entitlements for enterprise features using hooks in `web/src/features/entitlements/`
- Follow cursor rules in `.cursor/rules/` for consistent patterns
- Use dotenv files (`.env`) for environment configuration across all packages

## Memories
- App Router takes precedence when both exist, but it's route-specific, not global. Here, most routes are Page Router.