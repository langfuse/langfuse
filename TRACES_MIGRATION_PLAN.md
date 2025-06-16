# Traces & Observations Migration Plan

## Overview
Migration from current `traces` and `observations` tables to new schema:
- **exp_traces_amt**: AggregatingMergeTree for trace-level aggregated data
- **exp_spans**: ReplacingMergeTree for individual observations (spans)
- **exp_trace_properties**: Normalized trace properties for efficient filtering

## Current Access Patterns Analysis

### 1. Single Record Access Patterns
- [ ] **Trace by ID**: `getTraceById()` - Direct lookup by trace ID and project ID
  - **Current**: Simple SELECT with bloom filter index
  - **New approach**: Query exp_traces_amt for aggregated data + exp_spans for detailed observations
  - **Performance**: ⚠️ **Potentially slower** - requires joining aggregated trace with spans

- [ ] **Observation by ID**: `getObservationById()` - Direct lookup by observation ID
  - **Current**: Simple SELECT with bloom filter index  
  - **New approach**: Query exp_spans table directly
  - **Performance**: ✅ **Similar or better** - direct lookup in spans table

- [ ] **Observations for Trace**: `getObservationsForTrace()` - Get all observations for a trace
  - **Current**: Filter by trace_id in observations table
  - **New approach**: Query exp_spans by trace_id
  - **Performance**: ✅ **Similar** - same filtering pattern

### 2. Multiple Record Access Patterns
- [ ] **Traces Table UI**: `getTracesTable()` - Paginated list with filtering/sorting
  - **Current**: Complex query with LEFT JOINs to observations for metrics
  - **New approach**: Query exp_traces_amt directly (pre-aggregated metrics)
  - **Performance**: ✅ **Much faster** - no runtime aggregation needed

- [ ] **Batch Trace Retrieval**: `getTracesByIds()` - Multiple traces by ID list
  - **Current**: IN clause with array of trace IDs
  - **New approach**: Query exp_traces_amt with IN clause
  - **Performance**: ✅ **Faster** - pre-aggregated data, no joins

- [ ] **Trace Identifiers Stream**: Export/batch processing
  - **Current**: Streaming query with filters and pagination
  - **New approach**: Stream from exp_traces_amt
  - **Performance**: ✅ **Faster** - smaller aggregated records

### 3. Analytical Access Patterns
- [ ] **Traces Grouped by Name**: `getTracesGroupedByName()` - Analytics aggregation
  - **Current**: GROUP BY with COUNT on traces table
  - **New approach**: GROUP BY on exp_traces_amt
  - **Performance**: ✅ **Much faster** - fewer records to process

- [ ] **Traces Grouped by Tags**: `getTracesGroupedByTags()` - Tag analytics
  - **Current**: Complex array operations on tags column
  - **New approach**: Query exp_trace_properties where property='tag'
  - **Performance**: ✅ **Much faster** - normalized tag storage

- [ ] **User Statistics**: Complex analytics with observations JOIN
  - **Current**: Window functions over traces + observations
  - **New approach**: Use pre-aggregated cost/usage from exp_traces_amt
  - **Performance**: ✅ **Much faster** - no complex joins needed

- [ ] **Analytics Views**: `analytics_traces` - Hourly aggregations
  - **Current**: GROUP BY hour on traces table
  - **New approach**: GROUP BY hour on exp_traces_amt
  - **Performance**: ✅ **Faster** - fewer records to scan

### 4. Search and Filtering Patterns
- [ ] **Text Search**: Search in trace names, IDs, input/output
  - **Current**: ILIKE operations on traces and observations
  - **New approach**: 
    - Names/IDs: Search exp_traces_amt
    - Content: Search exp_spans for input/output
  - **Performance**: ⚠️ **Mixed** - name search faster, content search similar

- [ ] **Property Filtering**: Filter by user_id, session_id, environment, tags
  - **Current**: Direct column filters with bloom filter indexes
  - **New approach**: Query exp_trace_properties for normalized properties
  - **Performance**: ✅ **Much faster** - optimized for property filtering

- [ ] **Time-based Filtering**: Filter by timestamp ranges
  - **Current**: Filter on timestamp column
  - **New approach**: Filter on start_time in exp_traces_amt
  - **Performance**: ✅ **Similar** - both have time-based partitioning

### 5. Public-Facing Routes Analysis

#### TRPC Routes Accessing Traces/Observations
- [ ] **`traceRouter.hasAny`**: Checks if project has any traces
  - **Function**: `hasAnyTrace(projectId)`
  - **Access pattern**: Simple existence check
  - **Migration impact**: ✅ **No change** - same query on exp_traces_amt

- [ ] **`traceRouter.all`**: Main traces table listing with pagination/filtering
  - **Function**: `getTracesTable()` - Complex query with metrics aggregation
  - **Access pattern**: Paginated list with filters, search, sorting
  - **Migration impact**: ✅ **Much faster** - pre-aggregated metrics in exp_traces_amt

- [ ] **`traceRouter.metrics`**: Trace table metrics for UI
  - **Function**: `getTracesTableMetrics()`
  - **Access pattern**: Aggregated metrics calculation
  - **Migration impact**: ✅ **Much faster** - direct aggregation on exp_traces_amt

- [ ] **`traceRouter.filterOptions`**: Filter dropdown options (names, tags, users)
  - **Functions**: `getTracesGroupedByName()`, `getTracesGroupedByTags()`
  - **Access pattern**: GROUP BY aggregations for UI filters
  - **Migration impact**: ✅ **Much faster** - exp_trace_properties for tags, exp_traces_amt for names

- [ ] **`traceRouter.byId`**: Single trace details
  - **Function**: `getTraceById()` via middleware
  - **Access pattern**: Single record lookup
  - **Migration impact**: ✅ **Similar** - direct lookup in exp_traces_amt

- [ ] **`traceRouter.observationsAndScores`**: Trace detail page data
  - **Functions**: `getObservationsForTrace()`, `getScoresForTraces()`
  - **Access pattern**: Get all observations for a trace + scores
  - **Migration impact**: ✅ **Similar** - query exp_spans by trace_id

- [ ] **`traceRouter.deleteMany`**: Batch trace deletion
  - **Functions**: Batch deletion via TraceDeleteQueue
  - **Access pattern**: Bulk delete operations
  - **Migration impact**: ✅ **Similar** - same deletion pattern

- [ ] **`observationsRouter.byId`**: Single observation lookup
  - **Function**: `getObservationById()`
  - **Access pattern**: Direct observation lookup
  - **Migration impact**: ✅ **Similar** - direct lookup in exp_spans

- [ ] **`sessionRouter.byId`**: Session details with traces
  - **Functions**: `getTracesIdentifierForSession()`, `getScoresForTraces()`, `getCostForTraces()`
  - **Access pattern**: Get all traces for session + aggregated metrics
  - **Migration impact**: ✅ **Faster** - pre-aggregated costs in exp_traces_amt

#### Public API Routes Accessing Traces/Observations
- [ ] **`GET /api/public/traces`**: List traces with pagination
  - **Function**: Custom query with observation_stats and score_stats CTEs
  - **Access pattern**: Complex analytical query with JOINs
  - **Migration impact**: ⚠️ **Requires restructuring** - use exp_traces_amt + separate score queries

- [ ] **`GET /api/public/traces/[traceId]`**: Single trace with observations
  - **Functions**: `getTraceById()`, `getObservationsForTrace()`, `getScoresForTraces()`
  - **Access pattern**: Trace + all related observations and scores
  - **Migration impact**: ✅ **Similar** - exp_traces_amt + exp_spans queries

- [ ] **`DELETE /api/public/traces/[traceId]`**: Delete single trace
  - **Function**: TraceDeleteQueue processing
  - **Access pattern**: Single trace deletion
  - **Migration impact**: ✅ **Similar** - same deletion pattern

- [ ] **`POST /api/public/traces`**: Create/update traces (legacy ingestion)
  - **Function**: `processEventBatch()` - ingestion pipeline
  - **Access pattern**: High-volume writes
  - **Migration impact**: ⚠️ **Slightly slower** - materialized view overhead

- [ ] **`GET /api/public/observations`**: List observations with filtering
  - **Functions**: `generateObservationsForPublicApi()`, `getObservationsCountForPublicApi()`
  - **Access pattern**: Paginated observations list with complex filters
  - **Migration impact**: ✅ **Similar** - query exp_spans directly

- [ ] **`GET /api/public/observations/[observationId]`**: Single observation
  - **Function**: `getObservationById()`
  - **Access pattern**: Direct observation lookup
  - **Migration impact**: ✅ **Similar** - direct lookup in exp_spans

- [ ] **`GET /api/public/sessions/[sessionId]`**: Session with traces
  - **Function**: `getTracesBySessionId()`
  - **Access pattern**: Get traces by session_id
  - **Migration impact**: ✅ **Faster** - query exp_trace_properties for session_id

#### Ingestion & Processing Routes
- [ ] **`POST /api/public/otel/v1/traces`**: OpenTelemetry ingestion
  - **Function**: `processEventBatch()` via OtelIngestionProcessor
  - **Access pattern**: High-volume trace/span ingestion
  - **Migration impact**: ⚠️ **Slightly slower** - materialized view processing

#### Analytics & Dashboard Routes
- [ ] **`dashboardRouter.chart`**: Dashboard analytics queries
  - **Functions**: `getObservationCostByTypeByTime()`, `getObservationUsageByTypeByTime()`
  - **Access pattern**: Time-series analytics with aggregations
  - **Migration impact**: ✅ **Much faster** - pre-aggregated data in exp_traces_amt

- [ ] **`dashboardRouter.executeQuery`**: Custom query execution
  - **Function**: QueryBuilder with custom SQL
  - **Access pattern**: Ad-hoc analytical queries
  - **Migration impact**: ⚠️ **Requires query rewriting** - update QueryBuilder for new schema

#### Background Processing Routes
- [ ] **`batchExportRouter.create`**: Export job creation
  - **Function**: BatchExportQueue processing
  - **Access pattern**: Large-scale data export
  - **Migration impact**: ⚠️ **Requires update** - export queries need schema changes

- [ ] **`evalRouter.createJob`**: Evaluation job creation
  - **Function**: Batch processing on traces/observations
  - **Access pattern**: Bulk evaluation processing
  - **Migration impact**: ⚠️ **Requires update** - evaluation queries need schema changes

#### Filter & Options Routes
- [ ] **`generations.filterOptionsQuery`**: Observation filter options
  - **Functions**: `getObservationsGroupedByModel()`, `getObservationsGroupedByName()`, etc.
  - **Access pattern**: GROUP BY aggregations for filter dropdowns
  - **Migration impact**: ✅ **Similar** - same aggregations on exp_spans

### 6. Additional Repository Functions Analysis

#### Missing Trace Repository Functions
- [ ] **`checkTraceExists()`**: Complex existence check with observations aggregation
  - **Current**: CTE with observations_agg for level aggregation + trace filtering
  - **New approach**: Query exp_traces_amt + exp_spans for level checks
  - **Migration impact**: ⚠️ **Requires restructuring** - complex CTE needs rewriting

- [ ] **`getTracesBySessionId()`**: Get traces by session ID array
  - **Current**: IN clause on session_id column
  - **New approach**: Query exp_trace_properties where property='session_id'
  - **Migration impact**: ✅ **Much faster** - optimized property filtering

- [ ] **`getTraceCountsByProjectInCreationInterval()`**: Analytics by creation time
  - **Current**: GROUP BY project_id with created_at filter
  - **New approach**: Same query on exp_traces_amt
  - **Migration impact**: ✅ **Faster** - fewer records to scan

- [ ] **`getTracesGroupedByUsers()`**: User analytics with search
  - **Current**: GROUP BY user_id with search conditions
  - **New approach**: Query exp_trace_properties where property='user_id'
  - **Migration impact**: ✅ **Much faster** - normalized user storage

- [ ] **`getUserMetrics()`**: Complex user analytics with observations JOIN
  - **Current**: Window functions + complex JOINs between traces and observations
  - **New approach**: Use pre-aggregated data from exp_traces_amt
  - **Migration impact**: ✅ **Much faster** - no complex joins needed

- [ ] **`getTracesForBlobStorageExport()`**: Large-scale export streaming
  - **Current**: Stream all trace fields with time range
  - **New approach**: Stream from exp_traces_amt (smaller records)
  - **Migration impact**: ✅ **Faster** - smaller aggregated records

- [ ] **`getTracesForPostHog()`**: Analytics export with observations aggregation
  - **Current**: Complex CTE with observations_agg LEFT JOIN
  - **New approach**: Use pre-aggregated metrics from exp_traces_amt
  - **Migration impact**: ✅ **Much faster** - no runtime aggregation

- [ ] **`getTracesByIdsForAnyProject()`**: Cross-project trace lookup
  - **Current**: Simple SELECT across all projects
  - **New approach**: Same query on exp_traces_amt
  - **Migration impact**: ✅ **Similar** - direct lookup

- [ ] **`traceWithSessionIdExists()`**: Session existence check
  - **Current**: Simple existence query on session_id
  - **New approach**: Query exp_trace_properties where property='session_id'
  - **Migration impact**: ✅ **Similar** - optimized property lookup

- [ ] **`getAgentGraphData()`**: LangGraph metadata extraction
  - **Current**: Query observations for langgraph metadata
  - **New approach**: Query exp_spans for metadata
  - **Migration impact**: ✅ **Similar** - direct metadata access

#### Missing Observation Repository Functions
- [ ] **`checkObservationExists()`**: Observation existence check
  - **Current**: Simple existence query with time filtering
  - **New approach**: Query exp_spans directly
  - **Migration impact**: ✅ **Similar** - direct lookup

- [ ] **`getObservationForTraceIdByName()`**: Named observation lookup
  - **Current**: Filter by trace_id AND name
  - **New approach**: Same query on exp_spans
  - **Migration impact**: ✅ **Similar** - direct filtering

- [ ] **`getObservationsById()`**: Batch observation lookup
  - **Current**: IN clause with observation IDs
  - **New approach**: Same query on exp_spans
  - **Migration impact**: ✅ **Similar** - direct lookup

- [ ] **`getObservationsTableWithModelData()`**: Complex table query with model JOINs
  - **Current**: Observations query + separate model/trace lookups
  - **New approach**: Query exp_spans + same model/trace lookups
  - **Migration impact**: ✅ **Similar** - same complexity

- [ ] **`getObservationsGroupedBy*()` functions**: Filter option queries
  - **Functions**: `getObservationsGroupedByModel()`, `getObservationsGroupedByModelId()`, `getObservationsGroupedByName()`, `getObservationsGroupedByPromptName()`
  - **Current**: GROUP BY queries on observations table
  - **New approach**: Same GROUP BY queries on exp_spans
  - **Migration impact**: ✅ **Similar** - same aggregation patterns

- [ ] **`getCostForTraces()`**: Cost aggregation for trace list
  - **Current**: CTE with observations aggregation
  - **New approach**: Use pre-aggregated cost from exp_traces_amt
  - **Migration impact**: ✅ **Much faster** - no runtime aggregation

- [ ] **`getObservationsWithPromptName()`**: Prompt usage analytics
  - **Current**: GROUP BY prompt_name with count
  - **New approach**: Same query on exp_spans
  - **Migration impact**: ✅ **Similar** - direct aggregation

- [ ] **`getObservationMetricsForPrompts()`**: Complex prompt analytics
  - **Current**: CTE with latency calculations and median aggregations
  - **New approach**: Same complex query on exp_spans
  - **Migration impact**: ✅ **Similar** - same analytical complexity

- [ ] **`getLatencyAndTotalCostForObservations()`**: Metrics for observation list
  - **Current**: Direct calculation from observations
  - **New approach**: Same calculation on exp_spans
  - **Migration impact**: ✅ **Similar** - direct calculation

- [ ] **`getLatencyAndTotalCostForObservationsByTraces()`**: Trace-level aggregation
  - **Current**: GROUP BY trace_id with aggregations
  - **New approach**: Use pre-aggregated data from exp_traces_amt
  - **Migration impact**: ✅ **Much faster** - no runtime aggregation

- [ ] **`getObservationCountsByProjectInCreationInterval()`**: Analytics by creation time
  - **Current**: GROUP BY project_id with created_at filter
  - **New approach**: Same query on exp_spans
  - **Migration impact**: ✅ **Similar** - same aggregation

- [ ] **`getTraceIdsForObservations()`**: Reverse lookup observations to traces
  - **Current**: Simple SELECT trace_id from observations
  - **New approach**: Same query on exp_spans
  - **Migration impact**: ✅ **Similar** - direct lookup

- [ ] **`getObservationsForBlobStorageExport()`**: Large-scale export streaming
  - **Current**: Stream all observation fields with time range
  - **New approach**: Stream from exp_spans
  - **Migration impact**: ⚠️ **Potentially slower** - exp_spans larger than observations

- [ ] **`getGenerationsForPostHog()`**: Analytics export with trace JOIN
  - **Current**: Complex JOIN between observations and traces
  - **New approach**: Query exp_spans + exp_traces_amt separately or JOIN
  - **Migration impact**: ✅ **Faster** - pre-aggregated trace data

### 7. Critical Migration Considerations from Repository Analysis

#### High-Complexity Functions Requiring Special Attention
1. **`checkTraceExists()`** - Most complex query with observations aggregation CTE
   - **Challenge**: Complex level aggregation logic with multiIf conditions
   - **Solution**: May need to query both exp_traces_amt and exp_spans separately

2. **`getUserMetrics()`** - Complex analytics with window functions
   - **Challenge**: ROW_NUMBER() window functions over large datasets
   - **Solution**: Leverage pre-aggregated data in exp_traces_amt to eliminate complexity

3. **`getObservationsTableInternal()`** - Core table query with dynamic JOINs
   - **Challenge**: Conditional JOINs based on filter requirements
   - **Solution**: Update JOIN logic to use exp_traces_amt instead of traces

#### Functions That Will Benefit Most from Migration
1. **All trace aggregation functions** - Will be much faster with pre-aggregated data
2. **Property-based filtering** - Tags, user_id, session_id queries will be optimized
3. **Analytics and export functions** - Reduced data volume and pre-computed metrics
4. **Cost and usage calculations** - No more runtime aggregations needed

#### Functions with Minimal Migration Impact
1. **Single record lookups** - Direct ID-based queries remain similar
2. **Simple existence checks** - Basic filtering patterns unchanged
3. **Observation-only queries** - Direct migration to exp_spans

#### Potential Performance Regressions
1. **`getObservationsForBlobStorageExport()`** - exp_spans table will be larger
2. **Complex observation queries with large result sets** - More data per record
3. **Queries requiring both aggregated and detailed data** - May need multiple queries

### 8. Write/Update Patterns
- [ ] **Trace Ingestion**: Real-time trace creation via ClickhouseWriter
  - **Current**: Direct INSERT into traces table
  - **New approach**: INSERT into traces (materialized view handles exp_traces_amt)
  - **Performance**: ⚠️ **Slightly slower** - additional materialized view processing

- [ ] **Observation Ingestion**: Real-time observation creation
  - **Current**: Direct INSERT into observations table
  - **New approach**: INSERT into observations (materialized view populates exp_spans)
  - **Performance**: ⚠️ **Slightly slower** - materialized view overhead

- [ ] **Batch Deletion**: `processClickhouseTraceDelete()` - Delete traces and observations
  - **Current**: DELETE from both traces and observations tables
  - **New approach**: DELETE from source tables (cascades via materialized views)
  - **Performance**: ✅ **Similar** - same deletion pattern

## Migration Challenges & Considerations

### High-Risk Areas
- [ ] **Complex Trace Detail Views**: Queries that need both aggregated trace data AND detailed observations
  - **Challenge**: May require multiple queries or complex JOINs
  - **Mitigation**: Optimize with parallel queries or denormalization

- [ ] **Real-time Dashboards**: Queries expecting immediate consistency
  - **Challenge**: Materialized views have eventual consistency
  - **Mitigation**: Consider refresh strategies or hybrid approaches

- [ ] **Large Result Set Queries**: Export operations with millions of records
  - **Challenge**: exp_spans table will be much larger than current observations
  - **Mitigation**: Ensure proper partitioning and indexing

### Schema Mapping Challenges
- [ ] **Metadata Handling**: Current Map(String, String) vs. typed arrays in exp_spans
  - **Challenge**: Need to parse and separate metadata by type
  - **Solution**: Materialized view logic handles type separation

- [ ] **Cost/Usage Aggregation**: Current individual costs vs. sumMap aggregation
  - **Challenge**: Ensure aggregation logic matches current calculations
  - **Solution**: Validate aggregation formulas in materialized views

## Implementation Plan

### Phase 1: Infrastructure Setup
- [ ] Deploy new table schemas (exp_traces_amt, exp_spans, exp_trace_properties)
- [ ] Create materialized views for data population
- [ ] Set up monitoring for materialized view performance
- [ ] Validate data consistency between old and new schemas

### Phase 2: Read Path Migration
- [ ] Create abstraction layer for database access
- [ ] Implement new query methods for each access pattern
- [ ] Add feature flags for gradual rollout
- [ ] Performance testing and optimization

### Phase 3: Write Path Migration  
- [ ] Update ingestion pipeline to use new schema
- [ ] Migrate batch operations and background jobs
- [ ] Update deletion and cleanup processes

### Phase 4: Cleanup
- [ ] Remove old table dependencies
- [ ] Drop old tables after validation period
- [ ] Update monitoring and alerting

## Open Questions

1. **Materialized View Refresh Strategy**: How to handle high-volume ingestion with materialized view consistency?

2. **Backward Compatibility**: Do we need to maintain old API responses during transition?

3. **Data Migration**: How to migrate existing historical data to new schema?

4. **Performance Validation**: What are the acceptable performance thresholds for each query type?

5. **Rollback Strategy**: How to quickly revert if performance degrades?

6. **Monitoring**: What metrics should we track during migration?

## Detailed Query Migration Mapping

### Critical Queries Requiring Special Attention

#### 1. Public API Traces Query (`/api/public/traces`)
- **Current**: Complex CTE with observation_stats and score_stats JOINs
- **New approach**:
  - Use exp_traces_amt for aggregated metrics (cost, observation count)
  - Separate query to exp_spans for latency calculation if needed
  - JOIN with scores table remains the same
- **Risk**: ⚠️ **Medium** - Complex query restructuring needed

#### 2. Trace Detail Page (`getTraceById` + `getObservationsForTrace`)
- **Current**: Two separate queries - trace metadata + all observations
- **New approach**:
  - Query exp_traces_amt for aggregated trace data
  - Query exp_spans for detailed observation tree
- **Risk**: ✅ **Low** - Similar query pattern, potentially faster

#### 3. Dashboard Analytics (`analytics_traces` view)
- **Current**: Hourly aggregation with uniq() functions
- **New approach**: Same aggregation on exp_traces_amt (fewer records)
- **Risk**: ✅ **Low** - Direct improvement

#### 4. Observations Table UI
- **Current**: Complex query with trace JOINs for context
- **New approach**: Query exp_spans directly (includes trace context)
- **Risk**: ✅ **Low** - Simplified query structure

### Data Consistency Considerations

#### Materialized View Lag
- **Issue**: Eventual consistency between source tables and aggregated views
- **Impact**: Real-time dashboards may show stale data
- **Mitigation**:
  - Monitor materialized view refresh rates
  - Consider hybrid queries for critical real-time data
  - Implement cache warming strategies

#### Aggregation Accuracy
- **Issue**: Ensuring sumMap and other aggregations match current calculations
- **Validation needed**:
  - [ ] Cost aggregation formulas
  - [ ] Usage detail summation
  - [ ] Observation counting logic
  - [ ] Tag deduplication (groupUniqArrayArray)

## Testing Strategy

### Performance Benchmarks
- [ ] **Single trace lookup**: < 50ms (current baseline)
- [ ] **Traces table pagination**: < 200ms for 50 records (current baseline)
- [ ] **Analytics queries**: < 1s for monthly aggregations (current baseline)
- [ ] **Search queries**: < 500ms for text search (current baseline)
- [ ] **Batch operations**: Maintain current throughput rates

### Data Validation Tests
- [ ] **Row count validation**: Ensure all traces/observations migrated
- [ ] **Aggregation validation**: Compare cost/usage totals between old and new
- [ ] **Property extraction**: Validate user_id, session_id, tags extraction
- [ ] **Time range queries**: Ensure consistent results across time periods

### Load Testing
- [ ] **Concurrent read load**: Simulate dashboard usage patterns
- [ ] **Write throughput**: Test ingestion rates with new materialized views
- [ ] **Mixed workload**: Combine reads/writes to test real-world scenarios

## Risk Mitigation

### High-Risk Scenarios
1. **Materialized View Failure**: Views stop updating due to schema changes
   - **Mitigation**: Automated monitoring and alerting
   - **Rollback**: Feature flag to revert to old queries

2. **Query Performance Regression**: New queries slower than expected
   - **Mitigation**: Extensive pre-migration benchmarking
   - **Rollback**: Immediate query path switching via feature flags

3. **Data Loss During Migration**: Historical data not properly migrated
   - **Mitigation**: Parallel running systems during transition
   - **Rollback**: Keep old tables until full validation

### Monitoring Requirements
- [ ] **Query performance metrics**: Track latency for each query type
- [ ] **Materialized view health**: Monitor refresh rates and failures
- [ ] **Data consistency checks**: Automated validation of aggregations
- [ ] **Error rates**: Track query failures and timeouts
- [ ] **Resource utilization**: Monitor CPU/memory impact of new queries

## Success Criteria
- [ ] All current query patterns supported with equal or better performance
- [ ] No data loss during migration
- [ ] Successful rollback capability
- [ ] Comprehensive test coverage for new query patterns
- [ ] Performance benchmarks meet or exceed current system
- [ ] Materialized views maintain < 1 minute lag during normal operations
- [ ] Zero downtime migration execution
