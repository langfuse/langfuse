# Prompt Config Filtering Implementation

This document describes the implementation of filtering prompts by their configuration values, similar to how traces can be filtered by metadata.

## Implementation Overview

The implementation adds a new "Config" column to the prompts table that allows users to filter prompts based on key-value pairs in their configuration JSON.

### Key Changes Made

1. **Added Config Column to Table Definition**
   - File: `web/src/server/api/definitions/promptsTable.ts`
   - Added a new column definition for "Config" with type `stringObject`
   - This enables JSON key-value filtering on the `config` field

2. **Database Schema Already Supports Config**
   - The `Prompt` model in `packages/shared/prisma/schema.prisma` already has a `config` field of type `Json`
   - Default value is `"{}"` (empty JSON object)
   - No database migration needed

3. **Filtering Infrastructure Already Exists**
   - The existing `stringObject` filter type supports JSON key-value filtering
   - Filter builder UI components already handle `stringObject` types
   - Backend filtering logic in `tableColumnsToSqlFilterAndPrefix` already supports this

## How It Works

### Backend Filtering
The filtering uses PostgreSQL's JSON operators to filter on specific keys within the config JSON:

```sql
-- Example generated SQL for filtering config.temperature = 0.5
WHERE p.config ->> 'temperature' = '0.5'
```

### Frontend Filter Builder
The filter builder UI automatically provides:
- Column selector showing "Config"
- Key input field for specifying the JSON key (e.g., "temperature")
- Operator selector (=, contains, starts with, etc.)
- Value input field for the filter value

### Filter State Structure
```typescript
{
  type: "stringObject",
  column: "Config",
  key: "temperature",        // The JSON key to filter on
  operator: "=",            // The comparison operator
  value: "0.5"              // The value to compare against
}
```

## Usage Examples

### 1. Filter by Temperature Configuration
- Column: Config
- Key: temperature
- Operator: =
- Value: 0.5

This will find all prompts where `config.temperature` equals `0.5`.

### 2. Filter by Model Configuration
- Column: Config
- Key: model
- Operator: contains
- Value: gpt-4

This will find all prompts where `config.model` contains "gpt-4".

### 3. Filter by Custom Configuration Keys
- Column: Config
- Key: max_tokens
- Operator: >
- Value: 1000

This will find all prompts where `config.max_tokens` is greater than 1000.

## Technical Details

### Filter Type Support
The Config column supports all `stringObject` filter operators:
- `=` (equals)
- `contains` (partial match)
- `does not contain` (negative partial match)
- `starts with` (prefix match)
- `ends with` (suffix match)

### JSON Path Support
The implementation uses PostgreSQL's `->>` operator for JSON path queries, which:
- Extracts the value at the specified key as text
- Returns null if the key doesn't exist
- Supports only first-level keys (not nested paths)

### Performance Considerations
- JSON filtering is slower than regular column filtering
- Consider adding database indexes for frequently filtered config keys
- The implementation matches the existing metadata filtering performance characteristics

## Abstraction Usage

This implementation leverages the existing abstractions:

1. **Column Definition System**: Uses the same structure as other filterable columns
2. **Filter Type System**: Reuses the `stringObject` filter type
3. **Filter Builder UI**: Automatically works with the new column
4. **Backend Filtering**: Uses the same `tableColumnsToSqlFilterAndPrefix` function

No custom implementation was needed beyond adding the column definition - the existing filtering infrastructure handles everything else.

## Testing

The feature can be tested by:
1. Creating prompts with various config values
2. Using the filter builder in the prompts table
3. Verifying that filtering works correctly for different operators and values

## Limitations

1. **First-level Keys Only**: Only supports filtering on top-level keys in the config JSON
2. **String Comparison**: All values are compared as strings (following PostgreSQL's `->>` operator behavior)
3. **Performance**: JSON filtering is inherently slower than regular column filtering

## Future Enhancements

Possible improvements could include:
- Support for nested JSON path filtering
- Numeric comparison operators for numeric config values
- Pre-defined key suggestions based on existing config keys
- Database indexes for common config keys