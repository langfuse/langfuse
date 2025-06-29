# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Langfuse v3 is a **monorepo** using **pnpm workspaces** and **Turbo** for build orchestration with a modern distributed architecture:

### Core Applications
- **`web/`** - Next.js full-stack application with hybrid App Router + Pages Router, tRPC APIs, and database access
- **`worker/`** - Express.js background worker container that processes events asynchronously

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
- Use tRPC routers for internal APIs
- Components use tRPC hooks
- All UI pages use Pages Router patterns with standard Next.js navigation

### Public API Routes (External REST APIs)
- Located in `web/src/pages/api/public/` for external users/SDKs
- [TODO: add a better description here]

### tRPC Routes (Internal APIs)
- Main API layer used by all UI components
- Define in `web/src/features/[feature]/server/` routers
- Aggregate in `web/src/server/api/root.ts`
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
- **PostgreSQL:** Update `packages/shared/prisma/schema.prisma`
- **ClickHouse:** Schema migrations in `packages/shared/clickhouse/migrations/`

## Project Structure

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
- **tRPC**: Main API layer - 99% of components use tRPC hooks
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
