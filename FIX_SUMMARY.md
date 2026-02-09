# Fix Summary: LFE-8160 - Price Entry Input Bug

## Problem
When editing model prices in the UI, typing a key name that partially matches an existing key (like typing "input" when "input" already exists as a price key) would cause the new price entry to disappear. This happened when users tried to create keys like "input_document" - as soon as they typed "input", the entry would be deleted.

## Root Cause
The issue was in `/web/src/features/models/components/pricing-tiers/TierPriceEditor.tsx`:

1. **Unstable React Keys**: The component used `priceIndex` (array index) as the React `key` prop instead of the actual price key name. This caused React to incorrectly reuse DOM elements when the prices object changed.

2. **Key Overwriting**: When a user edited a price key (e.g., changing "new_usage_type" to "input"), the onChange handler would:
   - Delete the old key from the prices object
   - Create a new key with the typed value
   - If the new key matched an existing key (like "input"), it would overwrite that existing entry
   - This caused one entry to disappear from the UI

## Solution
Made two key changes in `TierPriceEditor.tsx`:

### 1. Use Stable React Keys (Line 32)
```tsx
// Before:
{Object.entries(prices).map(([key, value], priceIndex) => (
  <div key={priceIndex} className="grid grid-cols-2 gap-1">

// After:
{Object.entries(prices).map(([key, value]) => (
  <div key={key} className="grid grid-cols-2 gap-1">
```

This ensures React correctly tracks each price entry based on its actual key name, not its position in the array.

### 2. Prevent Key Conflicts (Lines 40-43)
```tsx
onChange={(e) => {
  const newKey = e.target.value;
  
  // Prevent overwriting existing keys (unless it's the same key)
  if (newKey !== key && prices[newKey] !== undefined) {
    return; // Don't allow the change
  }
  
  // ... rest of the logic
}}
```

This prevents users from typing a key name that would overwrite an existing price entry.

## User Experience Impact

### Before the fix:
- Typing "input" when trying to create "input_document" would cause the entry to disappear
- Users had to use workarounds like typing the suffix first ("_document") then prepending "input"

### After the fix:
- When typing a key that would conflict with an existing one, the input stops accepting characters at the conflict point
- The entry no longer disappears
- Users can:
  - Backspace and choose a different name
  - Continue typing with a different prefix
  - Still use the workaround of typing suffixes first if preferred

## Testing
- Linting passed
- Code formatting verified with Prettier
- Manual testing recommended to verify the user experience

## Commit
- Commit: `3de2c8faa`
- Branch: `cursor/LFE-8160-price-entry-input-bug-aa75`
- Changes pushed to remote repository

## Future Improvements
For better UX, consider:
- Adding visual feedback (error message) when a key conflict is detected
- Implementing on-blur validation instead of on-change blocking
- Auto-suggesting unique key names when conflicts occur
