# Traces API Selective Fields Implementation Plan

## Overview
Add a new query parameter `fields` to the GET `/api/public/traces` endpoint to allow selective data fetching for performance optimization. This will enable clients to exclude expensive data like input/output, scores, observations, and metadata when not needed.

## Current State Analysis

### Current Data Structure
The current `TraceWithDetails` response includes:
- **Core trace data**: id, name, timestamp, userId, sessionId, environment, tags, etc.
- **Input/Output**: Large JSON objects that can be expensive to fetch and transfer
- **Scores**: Array of score IDs (requires JOIN with scores table)
- **Observations**: Array of observation IDs (requires JOIN with observations table)
- **Computed metrics**: totalCost, latency (requires complex aggregations)
- **Metadata**: JSON object that can be large

### Current Performance Bottlenecks
1. **Complex CTEs**: The query uses `observation_stats` and `score_stats` CTEs with expensive aggregations
2. **Large data transfer**: Input/output JSON can be very large
3. **Unnecessary JOINs**: When scores/observations aren't needed, the JOINs still happen
4. **Metadata parsing**: Large metadata objects are always fetched

## Proposed Solution

### 1. New Query Parameter Design
Add a `fields` query parameter that accepts a comma-separated list of field groups:

```
GET /api/public/traces?fields=core,scores,observations,metrics,io
```

**Field Groups:**
- `core` (always included): id, name, timestamp, userId, sessionId, environment, tags, version, release, public, bookmarked, createdAt, updatedAt, htmlPath
- `io`: input, output, and metadata fields (combined for simplicity)
- `scores`: scores array and related JOINs
- `observations`: observations array and related JOINs
- `metrics`: totalCost, latency (requires observation aggregations)

**Default behavior**: If no `fields` parameter is provided, include all fields (backward compatibility)

### 2. Implementation Checklist

#### Phase 1: API Schema Updates
- [ ] Update Fern API definition (`fern/apis/server/definition/trace.yml`)
  - [ ] Add optional `fields` query parameter to the `list` endpoint
  - [ ] Add documentation for field groups
- [ ] Update TypeScript types (`web/src/features/public-api/types/traces.ts`)
  - [ ] Add `fields` to `GetTracesV1Query` schema
  - [ ] Create enum/union type for valid field values
- [ ] Regenerate API documentation
  - [ ] Run Fern generation to update OpenAPI spec

#### Phase 2: Backend Query Logic Updates
- [ ] Update `TraceQueryType` interface (`web/src/features/public-api/server/traces.ts`)
  - [ ] Add `fields?: string[]` property
- [ ] Modify `generateTracesForPublicApi` function
  - [ ] Add field parsing logic to convert comma-separated string to array
  - [ ] Implement conditional SELECT statements based on fields
  - [ ] Implement conditional CTEs (observation_stats, score_stats) based on fields
  - [ ] Implement conditional JOINs based on fields
- [ ] Update ClickHouse query construction
  - [ ] Create dynamic SELECT clause based on requested fields
  - [ ] Make `observation_stats` CTE conditional on `metrics` or `observations` fields
  - [ ] Make `score_stats` CTE conditional on `scores` field
  - [ ] Make JOINs conditional on required fields

#### Phase 3: Response Transformation
- [ ] Update response mapping logic
  - [ ] Conditionally include fields in response based on request
  - [ ] Ensure TypeScript types remain consistent
  - [ ] Handle cases where fields are undefined vs null
- [ ] Update `convertClickhouseToDomain` function if needed
  - [ ] Handle partial data conversion
  - [ ] Ensure proper null/undefined handling

#### Phase 4: API Route Integration
- [ ] Update `/api/public/traces/index.ts`
  - [ ] Parse and validate `fields` parameter
  - [ ] Pass fields configuration to `generateTracesForPublicApi`
  - [ ] Update response filtering logic
- [ ] Add input validation
  - [ ] Validate field names against allowed values
  - [ ] Provide helpful error messages for invalid fields

#### Phase 5: Testing & Documentation
- [ ] Add unit tests for field parsing logic
- [ ] Add integration tests for different field combinations
- [ ] Test performance improvements with different field selections
- [ ] Update API documentation with examples
- [ ] Add migration guide for existing API consumers

#### Phase 6: Performance Optimization Validation
- [ ] Benchmark query performance with different field combinations
- [ ] Verify that unnecessary JOINs are eliminated
- [ ] Measure response payload size reduction
- [ ] Test with large datasets to confirm performance gains

## Technical Implementation Details

### Field Parsing Logic
```typescript
const parseFields = (fieldsParam?: string): string[] => {
  if (!fieldsParam) {
    return ['core', 'io', 'scores', 'observations', 'metrics'];
  }
  return fieldsParam.split(',').map(f => f.trim()).filter(f => VALID_FIELDS.includes(f));
};
```

### Conditional Query Construction
```sql
-- Base query always includes core fields
SELECT
  t.id, t.name, t.timestamp, ... -- core fields
  ${includeIO ? ', t.input, t.output, t.metadata' : ''}
  ${includeScores ? ', s.score_ids as scores' : ''}
  ${includeObservations ? ', o.observation_ids as observations' : ''}
  ${includeMetrics ? ', COALESCE(o.latency_milliseconds / 1000, 0) as latency, COALESCE(o.total_cost, 0) as totalCost' : ''}
FROM traces t
${includeObservations || includeMetrics ? 'LEFT JOIN observation_stats o ON ...' : ''}
${includeScores ? 'LEFT JOIN score_stats s ON ...' : ''}
```

### Backward Compatibility
- Default behavior includes all fields when `fields` parameter is not provided
- Existing API consumers continue to work without changes
- Response structure remains the same, only content is conditionally included

## Expected Performance Improvements

### Query Performance
- **No scores needed**: Eliminates `score_stats` CTE and JOIN (~20-30% faster)
- **No observations needed**: Eliminates `observation_stats` CTE and JOIN (~30-40% faster)  
- **No IO needed**: Reduces data transfer significantly (~50-80% smaller payloads)
- **Core fields only**: Maximum performance gain (~60-70% faster queries)

### Network Performance
- **Reduced payload size**: Especially significant for traces with large input/output/metadata
- **Faster serialization**: Less JSON processing on both server and client
- **Better caching**: Smaller responses are more cache-friendly

## Migration Strategy
1. **Phase 1**: Deploy with default behavior (all fields included)
2. **Phase 2**: Update internal consumers to use selective fields
3. **Phase 3**: Encourage external API consumers to adopt selective fields
4. **Phase 4**: Consider making selective fields the default in a future major version

## Risk Mitigation
- **Backward compatibility**: Maintained through default field selection
- **Type safety**: TypeScript types ensure response structure consistency
- **Validation**: Input validation prevents invalid field combinations
- **Testing**: Comprehensive test coverage for all field combinations
- **Monitoring**: Add metrics to track field usage patterns

## Success Metrics
- [ ] Query performance improvement: >30% faster for selective field requests
- [ ] Payload size reduction: >50% smaller for requests without IO fields
- [ ] API adoption: Track usage of selective fields parameter
- [ ] Error rate: Maintain <0.1% error rate during rollout
