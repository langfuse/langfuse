# Prompt Search Enhancement

## Summary
Extended the search functionality for the prompt table to include tags in addition to prompt names. Users can now search for prompts by either their name or any of their associated tags using case-insensitive matching.

## Changes Made

### 1. Backend Changes
**File:** `web/src/features/prompts/server/routers/promptRouter.ts`

- **Updated search filter logic** (line ~92):
  - **Before:** Search only matched prompt names
    ```sql
    AND p.name ILIKE '%searchQuery%'
    ```
  - **After:** Search matches both prompt names and tags
    ```sql
    AND (p.name ILIKE '%searchQuery%' OR EXISTS (SELECT 1 FROM UNNEST(p.tags) AS tag WHERE tag ILIKE '%searchQuery%'))
    ```

### 2. Frontend Changes
**File:** `web/src/features/prompts/components/prompts-table.tsx`

- **Updated search configuration** (line ~465):
  - **Before:** `metadataSearchFields: ["Name"]`
  - **After:** `metadataSearchFields: ["Name", "Tags"]`

## Functionality

The enhanced search now supports:

1. **Name-based search**: Find prompts by their name (existing functionality)
2. **Tag-based search**: Find prompts by any of their associated tags (new functionality)
3. **Case-insensitive matching**: Search is case-insensitive for both names and tags
4. **Combined results**: Prompts matching either name or tag criteria are returned

## Examples

- Searching for "customer" will find:
  - Prompts with "customer" in their name (e.g., "customer-support-bot")
  - Prompts with "customer" in their tags (e.g., tags: ["customer", "support"])

- Searching for "EMAIL" will find:
  - Prompts with "email" in their name (case-insensitive)
  - Prompts with "email" in their tags (case-insensitive)

## Technical Implementation

The search uses PostgreSQL's `ILIKE` operator for case-insensitive pattern matching and `UNNEST()` function to search within the tags array. The `EXISTS` clause ensures efficient searching through tag arrays without requiring joins.

## Impact

- **Improved discoverability**: Users can now find prompts based on their categorization (tags)
- **Better organization**: Teams can tag prompts with relevant keywords and easily search for them
- **Maintained performance**: The search query is optimized to handle both name and tag searches efficiently
- **Backward compatibility**: Existing name-based searches continue to work as before