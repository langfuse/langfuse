# TRPC Router HTML Sanitization Analysis

## Overview

This analysis examines TRPC router input fields that could benefit from HTML sanitization using the `noHtmlCheck` function from `@langfuse/shared/src/utils/zod.ts`. The `noHtmlCheck` function validates that strings don't contain HTML tags using the regex `/<[^>]*>/`.

## Current Usage of `noHtmlCheck`

Currently, `noHtmlCheck` is used in:
1. **Organization names** (`organizationNameSchema.ts`)
2. **Project names** (`projectNameSchema.ts`) 
3. **User names** in signup (`signupSchema.ts`)

## Fields That Would Benefit from HTML Sanitization

### High Priority - User-Generated Text Content

#### 1. **Comments** (`/web/src/server/api/routers/comments.ts`)
- **Field**: `content` in `CreateCommentData`
- **Current validation**: `z.string().trim().min(1).max(MAX_COMMENT_LENGTH)`
- **Risk**: Comments are displayed to users and could contain malicious HTML
- **Recommendation**: Add `noHtmlCheck` validation
- **Location**: `packages/shared/src/features/comments/types.ts` line 13

#### 2. **Dataset Descriptions** (`/web/src/features/datasets/server/dataset-router.ts`)
- **Field**: `description` in dataset creation/update operations
- **Current validation**: `z.string().nullish()`
- **Risk**: Descriptions are user-provided and displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation
- **Locations**: Lines 429, 469

#### 3. **Dashboard Names and Descriptions** (`/web/src/features/dashboard/server/dashboard-router.ts`)
- **Fields**: 
  - `name` in `CreateDashboardInput` (line 56)
  - `description` in `CreateDashboardInput` (line 56)  
  - `name` in `UpdateDashboardInput` (line 63)
  - `description` in `UpdateDashboardInput` (line 63)
- **Current validation**: `z.string().min(1, "Dashboard name is required")` for names, `z.string()` for descriptions
- **Risk**: User-created dashboard names/descriptions displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation

#### 4. **Dashboard Widget Names and Descriptions** (`/web/src/server/api/routers/dashboardWidgets.ts`)
- **Fields**:
  - `name` in `CreateDashboardWidgetInput` (line 24)
  - `description` in `CreateDashboardWidgetInput` (line 24)
  - `name` in `UpdateDashboardWidgetInput` (line 38)
  - `description` in `UpdateDashboardWidgetInput` (line 38)
- **Current validation**: `z.string().min(1, "Widget name is required")` for names, `z.string()` for descriptions
- **Risk**: Widget names/descriptions are user-generated and displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation

### Medium Priority - Schema and Configuration Names

#### 5. **LLM Schema Names and Descriptions** (`/web/src/features/llm-schemas/validation.ts`)
- **Fields**:
  - `name` in `LLMSchemaInput` (line 13)
  - `description` in `LLMSchemaInput` (line 13) 
- **Current validation**: `LLMSchemaNameSchema` for names (alphanumeric + hyphens/underscores), `z.string()` for descriptions
- **Risk**: Schema names/descriptions displayed in UI
- **Recommendation**: Add `noHtmlCheck` to description field (name already has regex restriction)

#### 6. **LLM Tool Names and Descriptions** (`/web/src/features/llm-tools/validation.ts`)
- **Fields**:
  - `name` in `LLMToolInput` (line 13)
  - `description` in `LLMToolInput` (line 13)
- **Current validation**: `LLMToolNameSchema` for names (similar to schema names), `z.string()` for descriptions
- **Risk**: Tool names/descriptions displayed in UI
- **Recommendation**: Add `noHtmlCheck` to description field

#### 7. **Model Names** (`/web/src/features/models/validation.ts`)
- **Field**: `modelName` in `UpsertModelSchema` and `FormUpsertModelSchema`
- **Current validation**: `z.string().min(1)`
- **Risk**: Model names are displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation
- **Locations**: Lines 33, 50

### Lower Priority - Structured Content

#### 8. **Prompt Content** 
- **Fields**: Various prompt content fields in prompt validation schemas
- **Current validation**: Varies by field
- **Risk**: Prompt content is user-generated but may be intentionally formatted
- **Recommendation**: Consider carefully - prompts might legitimately need some formatting, but plain HTML should be avoided

#### 9. **Score Config Descriptions** (`/web/src/server/api/routers/scoreConfigs.ts`)
- **Field**: `description` in score config operations
- **Current validation**: `z.string().optional()`
- **Risk**: Descriptions displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation
- **Location**: Line 68

#### 10. **Experiment Descriptions** (`/web/src/features/experiments/server/router.ts`)
- **Field**: `description` in experiment creation
- **Current validation**: `z.string().max(1000).optional()`
- **Risk**: User-generated descriptions displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation
- **Location**: Line 162

#### 11. **API Key Notes** (`/web/src/features/public-api/server/projectApiKeyRouter.ts`)
- **Field**: `note` in API key creation and update operations
- **Current validation**: `z.string().optional()` and `z.string()`
- **Risk**: User-provided notes displayed in UI
- **Recommendation**: Add `noHtmlCheck` validation
- **Locations**: Lines 46, 81

## Implementation Pattern

For each field that needs HTML sanitization, apply this pattern:

```typescript
fieldName: z.string()
  .min(1) // or other constraints
  .refine((value) => noHtmlCheck(value), {
    message: "Input should not contain HTML",
  })
```

Remember to import `noHtmlCheck`:
```typescript
import { noHtmlCheck } from "@langfuse/shared";
```

## Priority Recommendations

1. **Immediate**: Add HTML sanitization to comment content field
2. **High**: Add to dashboard and widget names/descriptions
3. **High**: Add to dataset descriptions  
4. **Medium**: Add to LLM schema/tool descriptions
5. **Medium**: Add to model names
6. **Medium**: Add to API key notes
7. **Low**: Consider for other description fields

## Security Impact

Adding HTML sanitization to these fields will:
- Prevent XSS attacks through user-generated content
- Maintain consistency with existing sanitization for names
- Improve overall application security posture
- Follow the established pattern already used for organization/project names