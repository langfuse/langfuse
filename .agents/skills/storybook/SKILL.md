---
name: storybook
description: Use when writing or reviewing Storybook stories (`.stories.tsx`) for React components.
---

# Storybook Component Stories

Before writing or reviewing Storybook stories, read and follow the canonical
[Writing Good Stories](../../../web/.storybook/docs/WritingGoodStories.mdx)
guide.

## CI flakes

`tests-storybook` fails on hover and focus in stories the diff did not touch:

- `(Test) Hover and focus` in
  `web/src/components/design-system/Tooltip/Tooltip.stories.tsx`
- header-controls hover and focus in
  `web/src/components/ui/MarkdownViewer.stories.tsx`

When the failure is only those stories, leave the files alone and say the
job flaked. Do not edit them to make the check green.
