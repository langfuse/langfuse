---
name: react-component-cleaner
description: Use this skill to clean up a React component. Only use this skill when instructed to do so by the user.
---

The goal of this skill is to clean up a React component. The changes are meant to be non-breaking and auditable, therefore the instructions below should be followed carefully.

Avoid making any additional edits besides the ones instructed in this skill. If you are unsure about any of the instructions or need to do a one-off edit, ask the user for confirmation. You are allowed to invoke formatting and linting commands. If there are formatting / linting issues, do not make manual edits to reformat code, always use the fix variants of the commands.

Before starting to do any changes, audit the component you were instructed to fix by reading the [react-component-guidelines](../react-component-guidelines/SKILL.md) skill. Do not audit the callsites of the component, these will be looked at later in the skill.

This skill references a `sweepy` cli tool. This can be found under https://github.com/bezbac/sweepy. Follow its instructions to install it. Do this in a safe manner and comply with other security guidelines of the repository. If you are unsure about any of the instructions, ask the user for confirmation.

Now, you are ready to start cleaning up the component. Copy the contents of the [component cleanup todolist](./references/component-cleanup-todolist.md) verbatim into a TODO file (Use `cp` no manual edit) and follow the instructions in order, adding ✅ to the items you have completed. Do not commit the todo file, it is only for your reference.

---

Notes:

- When moving classes into a variant, the variant must own the complete set of classes for every CSS property it changes.
  - Remove those property classes from the component's base classes.
  - Ensure exactly one variant branch supplies each property. Do not rely on `cn`, `tailwind-merge`, CSS order, or specificity to resolve conflicting classes. Prefer an exhaustive lookup table or `cva` variants.

- The `sweepy` cli by default assumes an interactive mode, but it can be run in a non-interactive mode by passing the `--yes` flag. This will automatically accept all changes and is useful for automation.

- The `sweepy` cli has a `--dry-run` flag that can be used to preview the changes that will be made without actually making them.
