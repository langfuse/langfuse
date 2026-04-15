---
description: Load Turborepo skill for creating workflows, tasks, and pipelines in monorepos. Use when users ask to "create a workflow", "make a task", "generate a pipeline", or set up build orchestration.
---

Load the Turborepo skill and help with monorepo task orchestration: creating workflows, configuring tasks, setting up pipelines, and optimizing builds.

## Workflow

### Step 1: Load turborepo skill

```
skill({ name: 'turborepo' })
```

### Step 2: Identify task type from user request

Analyze $ARGUMENTS to determine:

- **Topic**: configuration, caching, filtering, environment, CI, or CLI
- **Task type**: new setup, debugging, optimization, or implementation

Use decision trees in SKILL.md to select the relevant reference files.

### Step 3: Read relevant reference files

Based on task type, read from `references/<topic>/`:

| Task                 | Files to Read                                           |
| -------------------- | ------------------------------------------------------- |
| Configure turbo.json | `configuration/RULE.md` + `configuration/tasks.md`      |
| Debug cache issues   | `caching/gotchas.md`                                    |
| Set up remote cache  | `caching/remote-cache.md`                               |
| Filter packages      | `filtering/RULE.md` + `filtering/patterns.md`           |
| Environment problems | `environment/gotchas.md` + `environment/modes.md`       |
| Set up CI            | `ci/RULE.md` + `ci/github-actions.md` or `ci/vercel.md` |
| CLI usage            | `cli/commands.md`                                       |

### Step 4: Execute task

Apply Turborepo-specific patterns from references to complete the user's request.

**CRITICAL - When creating tasks/scripts/pipelines:**

1. **DO NOT create Root Tasks** - Always create package tasks
2. Add scripts to each relevant package's `package.json` (e.g., `apps/web/package.json`, `packages/ui/package.json`)
3. Register the task in root `turbo.json`
4. Root `package.json` only contains `turbo run <task>` - never actual task logic

**Other things to verify:**

- `outputs` defined for cacheable tasks
- `dependsOn` uses correct syntax (`^task` vs `task`)
- Environment variables in `env` key
- `.env` files in `inputs` if used
- Use `turbo run` (not `turbo`) in package.json and CI

### Step 5: Summarize

```
=== Turborepo Task Complete ===

Topic: <configuration|caching|filtering|environment|ci|cli>
Files referenced: <reference files consulted>

<brief summary of what was done>
```

<user-request>
$ARGUMENTS
</user-request>
