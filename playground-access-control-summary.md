# Playground Access Control Implementation Summary

## Overview
Implemented access control for creating and editing tools and structured output schemas in the Langfuse playground to prevent users without proper permissions from encountering save failures.

## Problem
Users with MEMBER and VIEWER roles could click on "Create new tool" or "Create new schema" buttons in the playground, fill out the forms, but then get warnings when trying to save because they lacked the necessary permissions.

## Solution
Replaced regular `Button` components with `ActionButton` components that check for proper RBAC permissions and disable the buttons for users without access.

## Changes Made

### Files Modified

#### 1. `/web/src/features/playground/page/components/PlaygroundTools/index.tsx`
- **Added imports**: `ActionButton` and `useHasProjectAccess`
- **Added access check**: `useHasProjectAccess` with scope `"llmTools:CUD"`
- **Replaced buttons** with `ActionButton` components:
  - Plus icon button for adding tools from search dropdown
  - "Create new tool" button in the popover
  - Edit buttons for existing tools

#### 2. `/web/src/features/playground/page/components/StructuredOutputSchemaSection.tsx`
- **Added imports**: `ActionButton` and `useHasProjectAccess`
- **Added access check**: `useHasProjectAccess` with scope `"llmSchemas:CUD"`
- **Replaced buttons** with `ActionButton` components:
  - Plus icon button for adding schemas from search dropdown
  - "Create new schema" button in the popover
  - Edit buttons for existing schemas
- **Fixed TypeScript errors**: Added proper type annotations for `LlmSchema` in callback functions

### RBAC Permissions
The implementation relies on the existing RBAC system:

- **`llmTools:CUD`** scope controls Create, Update, Delete permissions for LLM tools
- **`llmSchemas:CUD`** scope controls Create, Update, Delete permissions for LLM schemas

#### Role Permissions:
- **OWNER**: ✅ Can create/edit tools and schemas
- **ADMIN**: ✅ Can create/edit tools and schemas  
- **MEMBER**: ❌ Can only read tools and schemas
- **VIEWER**: ❌ Can only read tools and schemas

### User Experience
When users with insufficient permissions hover over disabled buttons, they see informative tooltips explaining why the action is not available:

- "You do not have access to this resource, please ask your admin to grant you access."

## Technical Details

### ActionButton Component
The `ActionButton` component from `/web/src/components/ActionButton.tsx` provides:
- Access control via `hasAccess` prop
- Automatic button disabling when access is denied
- Hover tooltips with explanatory messages
- Consistent styling with regular buttons

### Access Check Hook
The `useHasProjectAccess` hook from `/web/src/features/rbac/utils/checkProjectAccess.ts`:
- Takes a `projectId` and RBAC `scope` parameter
- Returns `true` if user has access, `false` otherwise
- Automatically handles admin users (always returns `true`)
- Works with the existing project role system

## Benefits
1. **Better UX**: Users no longer waste time filling forms they can't save
2. **Clear feedback**: Tooltips explain why actions are disabled
3. **Consistent**: Uses the same RBAC system as other features
4. **Type-safe**: Proper TypeScript annotations prevent runtime errors

## Testing
To test the implementation:
1. Create users with different roles (MEMBER/VIEWER vs OWNER/ADMIN)
2. Navigate to the playground
3. Verify that create/edit buttons are disabled for MEMBER/VIEWER users
4. Verify tooltips appear on hover for disabled buttons
5. Confirm OWNER/ADMIN users can still create and edit tools/schemas normally