# Friendly Dataset Item IDs Migration

## Overview

This migration introduces user-friendly dataset item IDs that follow the format `{PROJECT_NAME}-{SEQUENCE_NUMBER}` (e.g., `AIR-0001`, `AIR-0002`).

## Changes Made

### 1. New Service

- Added `DatasetItemIdService` to generate friendly IDs
- Implements project name normalization and sequence number management
- Thread-safe ID generation using database transactions

### 2. Modified Creation Methods

- Updated `createDatasetItem` in dataset router
- Updated `createManyDatasetItems` in dataset router
- Updated Public API dataset item creation endpoint

### 3. ID Format

- **Format**: `{PROJECT_NAME}-{SEQUENCE_NUMBER}`
- **Project Name**: Normalized to uppercase, max 10 characters, special chars become underscores
- **Sequence**: 4-digit zero-padded number (0001, 0002, etc.)
- **Examples**:
  - "AIR" project → `AIR-0001`, `AIR-0002`
  - "My Project 2024" → `MY_PROJECT-0001`

## Backward Compatibility

### Existing Data

- **No migration required** for existing dataset items
- Existing items with CUID/UUID IDs will continue to work normally
- New items will use the friendly ID format
- Mixed ID formats are supported in the same project

### API Compatibility

- Public API still accepts user-provided IDs (maintains existing behavior)
- If no ID provided, friendly ID is generated instead of UUID
- All existing API endpoints continue to work with any ID format

### Database Schema

- **No schema changes required**
- The `id` field remains a string that can hold any format
- Existing constraints and relationships are unchanged

## Implementation Details

### Thread Safety

- Uses Prisma transactions to ensure sequence numbers are generated atomically
- Concurrent requests will receive consecutive sequence numbers

### Performance

- Minimal impact: one additional database query to fetch project name
- Sequence number calculation is efficient with proper indexing

### Error Handling

- Falls back gracefully if project not found
- Maintains existing error handling for duplicate IDs
- Compatible with existing validation logic

## Migration Steps

### For New Deployments

1. Deploy the new code
2. New dataset items will automatically use friendly IDs

### For Existing Deployments

1. Deploy the new code
2. **No database migration needed**
3. Existing items keep their current IDs
4. New items get friendly IDs
5. Both formats coexist seamlessly

## Testing

- Unit tests for ID generation logic
- Integration tests for the full creation flow
- Backward compatibility tests with mixed ID formats

## Rollback Plan

If needed, rollback involves:

1. Reverting code changes to use original ID generation
2. No database changes needed (all IDs remain valid strings)
3. Existing friendly IDs will continue to work as regular string IDs
