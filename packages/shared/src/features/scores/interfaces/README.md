# Score Interfaces

This directory contains all type definitions, schemas, and validation logic for Langfuse scores.

## Structure

```
interfaces/
├── api/              # API-specific schemas and validations
│   ├── v1/           # Legacy API types (trace-focused)
│   │   ├── endpoints.ts # Endpoint types and schemas
│   │   ├── schemas.ts   # Type definitions
│   │   └── validation.ts  # Validation logic
│   ├── v2/           # Current API types (supports traces, sessions)
│   │   ├── endpoints.ts # Endpoint types and schemas
│   │   ├── schemas.ts   # Type definitions
│   │   └── validation.ts  # Validation logic
│   └── shared.ts     # Common schemas used across API versions
├── application/      # Internal application logic
│   └── validation.ts # Validation functions for application layers
├── ingestion/        # Types for data ingestion
│   └── validation.ts # Validation for ingestion endpoints
├── ui/               # Simplified types for UI components
│   └── types.ts      # UI-specific type definitions
└── index.ts          # Exports all interfaces
```

## API Versioning

We have added a new v2 api and will continue to support the v1 api for the foreseeable future.
POST and DELETE APIs will continue to support all score types (trace, session, dataset run) across v1 and v2.

For GET APIs:

- **V1 API**: Requires `traceId`, ONLY supports trace-level scores
- **V2 API**: Makes `traceId` optional, adds `sessionId` and `datasetRunId` support, supports all score types (trace, session, run)
- Both versions maintain compatibility for existing clients

## Usage Guide

### When building API endpoints:

- **New endpoints**: Use types from `api/v2/schemas.ts`
- **Legacy compatibility**: Use types from `api/v1/schemas.ts`
- **Validation**: Use validators from the corresponding `validation.ts` files

### When building UI components:

Use the simplified types from `ui/types.ts` which are optimized for frontend use:

```typescript
import { ScoreSimplified, LastUserScore } from "../interfaces/ui/types";
```

### When working with internal application logic:

Use the validation functions from `application/validation.ts`:

```typescript
import {
  validateDbScore,
  filterAndValidateDbScoreList,
} from "../interfaces/application/validation";
```

## Type Flow

Client → `PostScoresBody` → Validation → API response (`APIScoreV2`) → UI (`ScoreSimplified` or `ScoreDomain`)
