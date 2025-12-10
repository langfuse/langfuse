# Implementation: Parse Tool Calls at Ingest (LFE-8016)

## Todo List

### Phase 1: Database Schema
- [ ] Create `packages/shared/clickhouse/migrations/clustered/0032_tool_columns.up.sql`
- [ ] Create `packages/shared/clickhouse/migrations/clustered/0032_tool_columns.down.sql`
- [ ] Create `packages/shared/clickhouse/migrations/unclustered/0032_tool_columns.up.sql`
- [ ] Create `packages/shared/clickhouse/migrations/unclustered/0032_tool_columns.down.sql`
- [ ] Add `tool_definitions` and `tool_arguments` fields to `observationRecordBaseSchema` in `packages/shared/src/server/repositories/definitions.ts`

### Phase 2: Tool Extraction Logic
- [ ] Create `packages/shared/src/server/ingestion/extractToolsBackend.ts`
  - [ ] Define `ClickhouseToolDefinitionSchema` (with comments referencing base schema)
  - [ ] Define `ClickhouseToolArgumentSchema` (with comments + index field)
  - [ ] Implement `extractToolsFromObservation()` main function
  - [ ] Implement `normalizeToolCall()` helper (raw → ClickhouseToolArgument)
  - [ ] Implement `normalizeToolDefinition()` helper (raw → ClickhouseToolDefinition)
- [ ] Create `packages/shared/src/server/ingestion/__tests__/extractToolsBackend.test.ts`
  - [ ] Extraction tests (various provider formats)
  - [ ] Schema consistency tests (import base schemas, verify field alignment)

### Phase 3: Ingestion Integration
- [ ] Modify `worker/src/services/IngestionService/index.ts`
  - [ ] Add import for `extractToolsFromObservation`
  - [ ] Add extraction call after line 855 (after input/output are set)
  - [ ] Wrap in try/catch with warning log

### Phase 4: Verification
- [ ] Run unit tests for extraction module
- [ ] Run ClickHouse migration locally: `bash packages/shared/clickhouse/scripts/up.sh`
- [ ] Test end-to-end: ingest observation with tools, verify stored in ClickHouse

---

## Quick Reference

### Migration SQL

**Clustered up.sql:**
```sql
ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_definitions Array(JSON(max_dynamic_paths=32, name String, description String, parameters String)) DEFAULT [];
ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_arguments Array(JSON(max_dynamic_paths=32, id String, name String, arguments String, type String, index Int32)) DEFAULT [];
```

**Unclustered up.sql:**
```sql
ALTER TABLE observations ADD COLUMN tool_definitions Array(JSON(max_dynamic_paths=32, name String, description String, parameters String)) DEFAULT [];
ALTER TABLE observations ADD COLUMN tool_arguments Array(JSON(max_dynamic_paths=32, id String, name String, arguments String, type String, index Int32)) DEFAULT [];
```

**Querying counts:**
```sql
SELECT length(tool_definitions) as available_tools, length(tool_arguments) as invoked_tools FROM observations;
```

### TypeScript Schema Addition

```typescript
// In observationRecordBaseSchema (definitions.ts ~line 33)
tool_definitions: z.array(z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.string().optional(), // JSON string
})).default([]),
tool_arguments: z.array(z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.string(), // JSON string
  type: z.string().optional(),
  index: z.number().optional(), // For parallel tool call ordering
})).default([]),
```

### Storage Format (direct arrays, no version wrapper)

```typescript
// tool_definitions column - Array of tool schemas
[{ name: "get_weather", description: "...", parameters: "{...}" }, ...]

// tool_arguments column - Array of tool invocations
[{ id: "call_123", name: "get_weather", arguments: "{\"location\":\"NYC\"}", type: "function" }, ...]
```

### Extraction Sources

**Tool Definitions (from input):**
1. `input.tools[]`
2. `input.messages[].tools[]`
3. `metadata.attributes["gen_ai.tool.definitions"]`

**Tool Arguments (from output) - source field names are `tool_calls`:**
1. `output.tool_calls[]`
2. `output.choices[0].message.tool_calls[]`
3. `output[].tool_calls[]`
4. `output.content[].type === "tool_use"` (Anthropic)
5. `output.additional_kwargs.tool_calls[]` (LangChain)

### Hook Point

```typescript
// worker/src/services/IngestionService/index.ts after line 855
try {
  const rawInput = reversedRawRecords.find((r) => r?.body?.input)?.body?.input;
  const rawOutput = reversedRawRecords.find((r) => r?.body?.output)?.body?.output;
  const rawMetadata = reversedRawRecords.find((r) => r?.body?.metadata)?.body?.metadata;

  const { toolDefinitions, toolArguments } = extractToolsFromObservation(
    rawInput, rawOutput, rawMetadata
  );
  mergedObservationRecord.tool_definitions = toolDefinitions;
  mergedObservationRecord.tool_arguments = toolArguments;
} catch (e) {
  logger.warn("Failed to extract tools", { observationId: entityId, error: e });
}
```
