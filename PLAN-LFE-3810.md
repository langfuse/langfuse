# PLAN-LFE-3810: Enable Advanced Filtering in Public API Traces Endpoint

## Executive Summary

Enable the public API `/api/public/traces` endpoint to support advanced filtering using `FilterState` similar to the internal tRPC router. This will allow customers to perform complex filtering operations like "all traces with specific metadata fields" while maintaining backward compatibility with existing simple query parameters.

## Problem Statement

Currently, the public API traces endpoint only supports basic filtering through individual query parameters (userId, name, tags, etc.), while the internal tRPC router leverages the powerful `FilterState` system for advanced filtering. Customers need access to the full filtering capabilities available internally, particularly for metadata-based filtering.

**Current State:**
- Internal tRPC: Uses `getTracesTable` with `FilterState` for advanced filtering
- Public API: Uses simple query parameters with `generateTracesForPublicApi`

**Desired State:**
- Public API supports both simple query parameters (backward compatibility) and advanced `FilterState` filtering via JSON-encoded query parameter in GET requests

## Technical Analysis

### Current Architecture

1. **Internal tRPC Router** (`web/src/server/api/routers/traces.ts`)
   - Uses `z.array(singleFilter)` for filter validation
   - Calls `getTracesTable` which accepts `FilterState`
   - Supports complex filtering including metadata, scores, etc.

2. **Public API** (`web/src/pages/api/public/traces/index.ts`)
   - Uses individual query parameters (`GetTracesV1Query`)
   - Calls `generateTracesForPublicApi` with simple filter conversion
   - Limited to basic field filtering

3. **FilterState Structure**
   ```ts
   export type FilterState = FilterCondition[];
   export type FilterCondition = z.infer<typeof singleFilter>;
   ```

### Key Components to Modify

1. **API Schema** (`web/src/features/public-api/types/traces.ts`)
2. **Service Layer** (`web/src/features/public-api/server/traces.ts`)
3. **API Route** (`web/src/pages/api/public/traces/index.ts`)
4. **Documentation** (Fern specs)
5. **Tests**

## Implementation Plan

**Important!** Start the development server before running tests.
**Important!** Don't try to `curl` instead of running tests, run the tests.

### Phase 1: Schema & Types Enhancement

**1.1 Update Public API Types**
- Add optional `filter` parameter to `GetTracesV1Query` as a JSON-encoded string (similar to metrics API pattern)
- Import and validate against `singleFilter` from shared package
- Maintain backward compatibility with existing query parameters
- Use `.transform()` and `.pipe()` pattern to parse JSON string and validate

```ts
// Add to GetTracesV1Query
filter: z
  .string()
  .transform((str) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      throw new InvalidRequestError("Invalid JSON in filter parameter");
    }
  })
  .pipe(z.array(singleFilter))
  .optional(),
```

**1.2 Update Service Types**
- Extend `TraceQueryType` to include `FilterState`
- Update function signatures to handle both old and new filtering

### Phase 2: Service Layer Implementation

**2.1 Enhance Filter Conversion**
- Create `convertLegacyParamsToFilterState` function
- Create `mergeFilters` function to combine legacy params with new FilterState
- Ensure proper precedence (FilterState overrides legacy params when both provided)

**2.2 Service Integration Options**
- **Option A**: Modify `generateTracesForPublicApi` to accept FilterState
- **Option B**: Create new service function that bridges to `getTracesTable`
- **Recommendation**: Option B for cleaner separation and reuse of existing logic

**2.3 Create Bridge Service**
```ts
export const generateTracesForPublicApiWithAdvancedFiltering = async ({
  projectId,
  filter,
  legacyParams,
  orderBy,
  ...rest
}) => {
  const mergedFilter = mergeFilters(legacyParams, filter);

  // Use getTracesTable for consistent filtering logic
  const traces = await getTracesTable({
    projectId,
    filter: mergedFilter,
    orderBy,
    ...rest
  });

  // Transform to public API format
  return transformForPublicApi(traces);
};
```

Placing this implementation in `shared/src/server/repositories/traces.ts`
will make working with imports / exports easier and cleaner.

### Phase 3: API Route Updates

**3.1 Update Route Handler**
- Validate new `filter` parameter
- Handle both legacy and advanced filtering paths
- Maintain response format consistency

**3.2 Error Handling**
- Validate FilterState structure
- Provide clear error messages for malformed filters
- Handle edge cases (empty filters, conflicting parameters)

### Phase 4: Testing

You can run tests with the following commands:
- `cd` into the project root directory
- When running an entire file inside `async` folder `pnpm --filter web test -- --testPathPattern="<test_filename>"`
- When running an single test inside `async` folder `pnpm --filter web test -- --testPathPattern="<test_filename>" --testNamePattern="<test_name>"`
- When running a test NOT inside `async` folder `pnpm --filter web test-sync --testPathPattern="<test_filename>" --testNamePattern="<test_name>"`
- if a single or a couple of tests are failing, try running them individually to see if they are flaky or consistently failing.

**4.1 Unit Tests**
- Test filter conversion functions
- Test backward compatibility
- Test advanced filtering scenarios
- Test error cases
- Test `generateTracesForPublicApi` vs `generateTracesForPublicApiWithAdvancedFiltering` functions behavior for equivalence with various inputs.
- All tests you add must be passing as well

**4.3 API Tests**
- Add tests to existing `traces-api.servertest.ts` pattern
- `pnpm --filter web test -- --testPathPattern="traces-api.servertest"` must be passing
- Test complex filtering scenarios
- Test pagination with advanced filters
- All tests you add must be passing as well

### Phase 5: Documentation & Specifications

**5.1 Update Fern Specifications**
- Add FilterState schema to OpenAPI specs
- Document filter structure and examples
- Update endpoint documentation

**5.2 API Documentation**
- Provide examples of advanced filtering
- Document metadata filtering use cases
- Explain precedence rules for mixed parameter usage


## Detailed Implementation Approach

### FilterState Support Strategy

1. **Dual Support Approach**
   - Accept both legacy query parameters AND new `filter` array
   - When both provided, `filter` takes precedence
   - Convert legacy parameters to FilterState internally for consistency

2. **Filter Merging Logic**
   ```ts
   function mergeFilters(legacyParams: TraceQueryType, advancedFilter?: FilterState): FilterState {
     const legacyAsFilter = convertLegacyParamsToFilterState(legacyParams);

     if (!advancedFilter || advancedFilter.length === 0) {
       return legacyAsFilter;
     }

     // Advanced filter takes precedence, but merge non-conflicting legacy params
     return deduplicateAndMergeFilters(legacyAsFilter, advancedFilter);
   }
   ```

3. **Conversion Functions**
   - Map each legacy parameter to corresponding FilterCondition
   - Handle array parameters (tags, environment) properly
   - Convert timestamp parameters to datetime filters

### Service Architecture Decision

**Recommendation: Bridge Approach**

Instead of heavily modifying `generateTracesForPublicApi`, create a new service function that:
1. Converts parameters to unified FilterState
2. Calls `getTracesTable` (reusing proven filtering logic)
3. Transforms results to public API format

Benefits:
- Reuses battle-tested filtering logic from `getTracesTable`
- Maintains separation of concerns
- Easier to test and maintain
- Consistent behavior with internal tRPC

### Understanding @langfuse/shared Imports

When importing from `@langfuse/shared/src/server`, availability is controlled by an **export chain**:

1. **Function Definition** → `packages/shared/src/server/[module]/[file].ts`
2. **Module Re-export** → `packages/shared/src/server/[module]/index.ts`
3. **Server Re-export** → `packages/shared/src/server/index.ts`
4. **Package Exports** → `packages/shared/package.json` (defines entry points)

**Example: Why `createFilterFromFilterState` works but `getProjectIdDefaultFilter` doesn't**

Both functions are defined in `packages/shared/src/server/queries/clickhouse-sql/factory.ts`:
```ts
export function createFilterFromFilterState(...) { ... }
export function getProjectIdDefaultFilter(...) { ... }
```

However, only `createFilterFromFilterState` is re-exported in `packages/shared/src/server/queries/index.ts`:
```ts
export { createFilterFromFilterState } from "./clickhouse-sql/factory";
// getProjectIdDefaultFilter is NOT re-exported here!
```

**To make a function available for import:**
1. Add it to the module's `index.ts` re-exports
2. Rebuild the package: `pnpm --filter=@langfuse/shared run build`
3. The function becomes available via `@langfuse/shared/src/server`

**Common pattern for adding exports:**
```ts
// packages/shared/src/server/queries/index.ts
export {
  createFilterFromFilterState,
  getProjectIdDefaultFilter  // Add this
} from "./clickhouse-sql/factory";
```

### Backward Compatibility Strategy

1. **Parameter Precedence**
   - Legacy parameters work as before when no `filter` provided
   - `filter` parameter takes precedence when both provided
   - Clear documentation of this behavior

2. **Response Format**
   - No changes to response structure
   - Same pagination and field selection behavior
   - Same error response format

3. **Migration Path**
   - Existing clients continue working without changes
   - New clients can gradually adopt advanced filtering
   - Deprecation timeline for legacy params (future consideration)

## Example Usage

### Legacy (Existing)
```
GET /api/public/traces?userId=user123&tags=production&fromTimestamp=2024-01-01T00:00:00Z
```

### Advanced Filtering (JSON-encoded query parameter)
```
GET /api/public/traces?filter=%5B%7B%22type%22%3A%22stringObject%22%2C%22column%22%3A%22metadata%22%2C%22key%22%3A%22environment%22%2C%22operator%22%3A%22%3D%22%2C%22value%22%3A%22production%22%7D%2C%7B%22type%22%3A%22stringObject%22%2C%22column%22%3A%22metadata%22%2C%22key%22%3A%22model%22%2C%22operator%22%3A%22contains%22%2C%22value%22%3A%22gpt-4%22%7D%2C%7B%22type%22%3A%22arrayOptions%22%2C%22column%22%3A%22tags%22%2C%22operator%22%3A%22any%20of%22%2C%22value%22%3A%5B%22important%22%2C%22customer-facing%22%5D%7D%5D&page=1&limit=50
```

Decoded filter parameter:
```json
[
  {
    "type": "stringObject",
    "column": "metadata",
    "key": "environment",
    "operator": "=",
    "value": "production"
  },
  {
    "type": "stringObject",
    "column": "metadata",
    "key": "model",
    "operator": "contains",
    "value": "gpt-4"
  },
  {
    "type": "arrayOptions",
    "column": "tags",
    "operator": "any of",
    "value": ["important", "customer-facing"]
  }
]
```

### Mixed Usage
```
GET /api/public/traces?userId=user123&filter=%5B%7B%22type%22%3A%22stringObject%22%2C%22column%22%3A%22metadata%22%2C%22key%22%3A%22priority%22%2C%22operator%22%3A%22%3D%22%2C%22value%22%3A%22high%22%7D%5D
```

Decoded filter parameter:
```json
// userId=user123 (legacy param)
// filter parameter (advanced filter takes precedence):
[
  {
    "type": "stringObject",
    "column": "metadata",
    "key": "priority",
    "operator": "=",
    "value": "high"
  }
]
```

## Risk Assessment

### High Risk
- **Breaking Changes**: Must ensure 100% backward compatibility
- **Performance Impact**: Advanced filtering might be slower than current implementation
- **Security**: FilterState must be properly validated to prevent injection attacks

### Medium Risk
- **API Complexity**: More complex API surface area
- **Documentation Burden**: Need comprehensive examples and migration guides
- **Testing Complexity**: More test scenarios to cover

### Low Risk
- **Code Maintenance**: Well-structured implementation should be maintainable
- **Feature Adoption**: Optional feature, gradual adoption expected

## Success Criteria

1. **Functional Requirements**
   - [x] Support all FilterState filter types in public API
   - [x] Maintain 100% backward compatibility with existing parameters
   - [x] Enable complex metadata filtering
   - [x] Support all existing ordering and pagination

2. **Performance Requirements**
   - [x] No regression in response times for legacy parameter usage
   - [x] Advanced filtering performance acceptable (< 2x current times)
   - [x] Proper database query optimization

3. **Quality Requirements**
   - [x] Comprehensive test coverage (>90% for new code)
   - [x] Complete API documentation with examples
   - [x] Error handling for malformed filters

## Implementation Notes

- Follow existing public API patterns and conventions
- Use the same validation and error handling patterns
- Ensure proper TypeScript typing throughout
- Add appropriate logging for debugging
- Consider rate limiting for complex queries
- Document any limitations or unsupported filter types
