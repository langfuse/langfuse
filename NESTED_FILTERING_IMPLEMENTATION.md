# Nested Metadata Filtering Implementation

## Overview

This implementation adds support for filtering by nested metadata values with arbitrary depth, addressing GitHub issue #3281. The enhancement allows users to filter on deeply nested JSON fields in metadata, not just top-level keys.

## Key Changes

### 1. Enhanced StringObjectFilter Class

**File**: `packages/shared/src/server/queries/clickhouse-sql/clickhouse-filter.ts`

**Changes**:
- Added support for dot notation in keys (e.g., `user_api_key_metadata.user_id`)
- Uses `JSONExtractString(column, '$.nested.path')` for multi-level access
- Maintains efficient map access `column[{key: String}]` for single-level keys
- Updated parameter handling to exclude key parameter for nested paths

**Behavior**:
- Single-level key: `environment` → Uses map access for performance
- Multi-level key: `user.profile.settings.theme` → Uses JSONExtractString for nested access

### 2. Enhanced NumberObjectFilter Class

**File**: `packages/shared/src/server/queries/clickhouse-sql/clickhouse-filter.ts`

**Changes**:
- Added support for dot notation in numeric keys
- Uses `JSONExtractFloat(column, '$.nested.path')` for multi-level numeric access
- Retains original `arrayFilter` logic for single-level keys
- Updated parameter handling for nested vs single-level keys

**Behavior**:
- Single-level key: `score` → Uses arrayFilter for map access
- Multi-level key: `model.parameters.temperature` → Uses JSONExtractFloat

## Technical Details

### Algorithm

```typescript
const keyParts = key.split('.');

if (keyParts.length === 1) {
  // Single-level: Use efficient map access
  columnAccess = `${column}[{${varKeyName}: String}]`;
} else {
  // Multi-level: Use JSONExtract for nested access
  const jsonPath = '$.' + keyParts.join('.');
  columnAccess = `JSONExtractString(${column}, '${jsonPath}')`;
}
```

### Generated SQL Examples

**Single-level key filtering**:
```sql
metadata[{'stringObjectKeyFilter123': String}] = {'stringObjectValueFilter456': String}
```

**Nested key filtering**:
```sql
JSONExtractString(metadata, '$.user_api_key_metadata.user_id') = {'stringObjectValueFilter456': String}
```

**Deeply nested key filtering**:
```sql
JSONExtractString(metadata, '$.config.model.parameters.temperature') = {'stringObjectValueFilter456': String}
```

## Compatibility

- ✅ **Backward Compatible**: Single-level keys continue to use the original efficient map access
- ✅ **Performance Optimized**: JSONExtract only used when necessary (multi-level keys)
- ✅ **Type Safe**: Maintains existing TypeScript interfaces
- ✅ **All Operators**: Works with all existing operators (=, contains, starts with, etc.)

## Testing

### Validation Script

A comprehensive validation script was created to verify the implementation:

```bash
cd langfuse
node validate-logic.js
```

### Test Cases Covered

1. **Single-level string keys**: `environment` → Map access
2. **Two-level nested keys**: `user_api_key_metadata.user_id` → JSONExtractString
3. **Deep nesting**: `config.model.parameters.temperature` → JSONExtractString
4. **Single-level numeric keys**: `score` → Array filter
5. **Nested numeric keys**: `model.temperature` → JSONExtractFloat
6. **Complex paths**: `user.profile.settings.theme` → JSONExtractString

### Unit Tests

Comprehensive unit tests were added in:
`web/src/__tests__/async/clickhouse-filter.servertest.ts`

## Usage Examples

### Frontend Usage

Users can now filter using dot notation in the UI:

```typescript
// Filter by nested user metadata
{
  type: "stringObject",
  key: "user_api_key_metadata.user_id",
  operator: "=",
  value: "user123"
}

// Filter by model parameters
{
  type: "numberObject", 
  key: "model.parameters.temperature",
  operator: ">",
  value: 0.5
}
```

### API Usage

The existing filter API now supports nested keys:

```json
{
  "filters": [
    {
      "column": "metadata",
      "operator": "=",
      "value": "user123",
      "type": "stringObject",
      "key": "user_api_key_metadata.user_id"
    }
  ]
}
```

## Performance Considerations

- **Single-level keys**: No performance impact (uses original map access)
- **Multi-level keys**: Uses ClickHouse's optimized JSONExtract functions
- **Memory efficient**: Only processes dot notation when detected
- **Index friendly**: ClickHouse can optimize JSONExtract queries

## Future Enhancements

1. **Array indexing**: Support for array index notation (e.g., `items[0].name`)
2. **Wildcard matching**: Support for wildcard paths (e.g., `user.*.name`)
3. **Frontend improvements**: Enhanced UI for nested key discovery
4. **Documentation**: User-facing documentation for nested filtering

## Files Modified

1. `packages/shared/src/server/queries/clickhouse-sql/clickhouse-filter.ts` - Core implementation
2. `web/src/__tests__/async/clickhouse-filter.servertest.ts` - Unit tests
3. `validate-logic.js` - Validation script

## Commit Information

**Branch**: `feat/nested-metadata-filtering`
**Commit**: `9b52aec54`
**Message**: "feat: implement nested metadata filtering support"

## Ready for Review

This implementation is ready for review and merging. The code:
- ✅ Maintains backward compatibility
- ✅ Includes comprehensive tests
- ✅ Follows existing code patterns
- ✅ Addresses the GitHub issue requirements
- ✅ Is performance optimized
- ✅ Includes proper documentation
