# Manual Testing Guide for Saved Table Views

This guide provides a structured approach to manually test the saved table views functionality.

## Prerequisites

- A test environment with populated data tables
- Access to multiple browsers for testing permalink sharing
- Developer tools for inspecting network requests and local storage

## Basic Functionality Tests

### 1. View Creation

- [ ] Open any table (e.g., Traces, Scores, Sessions, Models)
- [ ] Apply various filters, sort by different columns, and change column visibility
- [ ] Click "Create New View" and provide a name
- [ ] Verify the view is saved and appears in the dropdown
- [ ] Verify the view is correctly applied when selected

### 2. View Updates

- [ ] Select an existing view
- [ ] Change table configuration (filters, sorting, column visibility)
- [ ] Click "Update" on the selected view
- [ ] Verify changes are saved
- [ ] Navigate away and back, confirm changes persist

### 3. View Deletion

- [ ] Create a test view for deletion
- [ ] Open the view dropdown and select the delete option
- [ ] Confirm deletion in the modal
- [ ] Verify the view is removed from the list
- [ ] Check browser storage to ensure it's fully removed

### 4. Permalink Functionality

- [ ] Select a view
- [ ] Click the link icon to generate a permalink
- [ ] Verify the permalink is copied to clipboard
- [ ] Open the permalink in a new browser/incognito window
- [ ] Verify the view loads correctly with all settings applied

## Edge Case Tests

### 1. Backwards Compatibility

- [ ] Create a view with specific columns and filters
- [ ] Modify the table structure (e.g., rename a column in the code)
- [ ] Reload and select the saved view
- [ ] Verify graceful degradation - view should load but ignore invalid columns
- [ ] Confirm appropriate warning is shown for outdated view

### 2. Validation Tests

- [ ] Create a view with complex filters
- [ ] Manually modify the saved view data to include invalid filters
  - This can be done via browser console: `localStorage.setItem('savdView_X', JSON.stringify(modifiedData))`
- [ ] Load the view and verify the system correctly identifies and handles invalid data
- [ ] Check that valid parts of the configuration are still applied

### 3. Performance Tests

- [ ] Create 10+ saved views
- [ ] Measure load time for the views dropdown
- [ ] Test rapid switching between views
- [ ] Check memory usage in browser dev tools

### 4. Cross-Browser Testing

- [ ] Test core functionality in Chrome, Firefox, Safari, and Edge
- [ ] Verify permalinks work across different browsers
- [ ] Test on mobile devices to ensure responsive behavior

## Analytics Testing

- [ ] Use browser network tools or PostHog dashboard to verify events are firing
- [ ] Create a view and verify `saved_views:create` event is captured
- [ ] Update a view and verify `saved_views:update_config` event is captured
- [ ] Delete a view and verify `saved_views:delete` event is captured
- [ ] Generate a permalink and verify `saved_views:permalink_generate` event is captured
- [ ] Visit a permalink and verify `saved_views:permalink_visit` event is captured

## Regression Testing

After code changes:

- [ ] Verify all existing views still load correctly
- [ ] Test permalink functionality still works
- [ ] Ensure warning toasts display correctly for outdated views
- [ ] Check that table state is correctly persisted in session storage

## Bug Reporting Template

When reporting bugs, include:

1. Table name and view name
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Browser and device information
6. Screenshots or screen recordings if applicable
7. Any console errors
