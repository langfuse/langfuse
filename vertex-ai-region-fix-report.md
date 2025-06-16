# VertexAI Region Selection Issue - Investigation and Fix

## Problem Summary

Users were unable to select the region when adding a VertexAI LLM connection in Langfuse. The system was always defaulting to `us-central1`, which prevented users from accessing models that are only available in other regions.

## Root Cause Analysis

### Investigation Findings

1. **Form-level Issue**: The `CreateLLMApiKeyForm.tsx` component had dedicated region fields for Bedrock adapter but NO region configuration field for VertexAI adapter.

2. **Backend Implementation Gap**: While the Bedrock adapter properly handled region configuration through `BedrockConfigSchema`, there was no equivalent schema or handling for VertexAI regions.

3. **Default Behavior**: The ChatVertexAI class from LangChain defaults to `us-central1` region when no location parameter is provided.

4. **Missing Schema**: No `VertexAIConfigSchema` existed to handle region configuration like the existing `BedrockConfigSchema`.

## Code Changes Implemented

### 1. Schema Updates

**File**: `packages/shared/src/interfaces/customLLMProviderConfigSchemas.ts`

- Added `VertexAIConfigSchema` similar to existing `BedrockConfigSchema`
- Added `VertexAIConfig` type export

```typescript
export const VertexAIConfigSchema = z.object({ region: z.string() });
export type VertexAIConfig = z.infer<typeof VertexAIConfigSchema>;
```

### 2. Form Schema Updates

**File**: `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx`

- Added `vertexAIRegion` field to form schema
- Added validation rule requiring VertexAI region when using VertexAI adapter
- Added import for `VertexAIConfig` type

### 3. Form UI Updates

**File**: `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx`

- Added VertexAI Region form field that appears when VertexAI adapter is selected
- Added helpful description about region model availability
- Added default value of `us-central1` for backward compatibility
- Updated form default values to include `vertexAIRegion`

### 4. Form Submission Logic

**File**: `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx`

- Updated `onSubmit` function to handle VertexAI config creation
- Modified config variable type to support both `BedrockConfig` and `VertexAIConfig`

### 5. Backend API Updates

**File**: `packages/shared/src/server/llm/fetchLLMCompletion.ts`

- Added `VertexAIConfigSchema` import
- Updated VertexAI ChatVertexAI instantiation to parse region from config
- Added location parameter to ChatVertexAI constructor

**File**: `web/src/features/llm-api-key/server/router.ts`

- Added `VertexAIConfigSchema` import
- Updated `testLLMConnection` function to parse VertexAI config alongside Bedrock config

## Technical Details

### Form Validation

- VertexAI region is now required when VertexAI adapter is selected
- Defaults to `us-central1` for backward compatibility
- Validation error shown if region is not provided

### Backend Region Handling

```typescript
// Parse the region from config, default to us-central1 if not provided
let location = "us-central1";
if (config) {
  const vertexAIConfig = VertexAIConfigSchema.parse(config);
  location = vertexAIConfig.region;
}

chatModel = new ChatVertexAI({
  // ... other params
  location: location,
  // ... other params
});
```

### Config Storage

- VertexAI region configuration is stored in the database `config` field
- Follows the same pattern as Bedrock region configuration
- Encrypted storage ensures security

## Testing

The fix should be tested by:

1. **Creating new VertexAI connection**: Verify region field appears and is required
2. **Updating existing VertexAI connections**: Verify existing connections still work with default region
3. **Different regions**: Test with various VertexAI regions (e.g., `us-east1`, `europe-west1`, `asia-southeast1`)
4. **Model availability**: Confirm that models only available in specific regions can now be accessed

## Backward Compatibility

- Existing VertexAI connections without region config will continue to work with `us-central1` default
- No migration is needed as the system gracefully handles missing region config
- Form updates are additive and don't break existing functionality

## Verification Steps

To verify the fix works:

1. Navigate to LLM API Keys settings
2. Add new LLM API Key
3. Select "VertexAI" adapter
4. Confirm "VertexAI Region" field appears
5. Enter a region other than `us-central1` (e.g., `us-east1`)
6. Complete the form and test the connection
7. Verify the connection uses the specified region for API calls

## Related Files Modified

1. `packages/shared/src/interfaces/customLLMProviderConfigSchemas.ts`
2. `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx`
3. `packages/shared/src/server/llm/fetchLLMCompletion.ts`
4. `web/src/features/llm-api-key/server/router.ts`

## Summary

The issue was successfully resolved by implementing region configuration for VertexAI similar to how Bedrock handles regions. Users can now select their preferred VertexAI region, enabling access to models that may only be available in specific regions. The implementation maintains backward compatibility and follows existing patterns in the codebase.
