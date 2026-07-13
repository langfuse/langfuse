---
name: changelog-writing
description: |
  Shared workflow for writing Langfuse changelog entries after a feature is complete.
  Use when a branch is ready for merge and a changelog entry or changelog draft is needed.
---

# Changelog Writing

Use this skill when a completed feature branch needs a changelog entry.

## Workflow

1. Understand the change set.
2. Study recent changelog patterns in `../langfuse-docs/pages/changelog`.
3. Find related documentation links in `../langfuse-docs/pages`.
4. Draft a user-focused changelog entry.
5. Recommend whether an image or screenshot should be added.

## What To Gather

- The branch diff relative to `main`
- The Linear issue, if the branch name includes an `lfe-XXXX` identifier
- The affected product areas
- Relevant docs pages to link or create

## Writing Rules

- Write for users, not internal implementation detail
- Prefer second person: "you can now..."
- Focus on what changed, why it matters, and how to use it
- Match the structure and tone of recent changelog posts
- Keep technical detail only where it improves user understanding

## Output Format

Provide:

1. A short summary of what changed
2. The complete changelog post content
3. Whether an image should be added and what it should show
4. Any docs pages that should be linked or created

## Reference Files

- Changelog destination: `../langfuse-docs/pages/changelog`
- Recent changelog examples: inspect 3-5 recent files in that directory
- Existing docs: `../langfuse-docs/pages`
