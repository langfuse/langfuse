---
name: storybook
description: Use when writing or reviewing Storybook stories (`.stories.tsx`) for React components.
---

# Storybook Component Stories

## Which Components Can Have Stories?

Only create stories for components that **do not** do any of the following:

- Depend on context.
- Fetch data via any private API, including Langfuse’s own tRPC API.

Stories should follow the `ComponentName.stories.tsx` filename pattern. Components covered by stories should have exactly one exported or public component.

If this is not the case, suggest splitting up the file that includes the component to be covered first.

Be mindful of the breadth a story covers. A story should show a component in isolation. Page-level compositions should be rare and intentional.

## What to Do If a Component Violates the Criteria

Suggest abstracting a presentational component that does not violate the criteria and receives relevant data via props.

Make sure the props are well-defined using TypeScript.

Keep the existing component, but update it to use the newly created component for rendering. These presentational components are easier to test and easier to reuse.

## How Stories Should Be Written

- Use "CSF Next" format by default.
- Cover only the relevant component by default.
- Avoid custom render functions by default.
- Use `satisfies` and typed Storybook metadata so invalid args, decorators, and play functions are type-checked.
- Use play functions to test user-relevant interactions after render, not to compensate for complex setup or hidden dependencies.
- Prefix stories whose primary purpose is interaction test coverage with `(Test)` in the Storybook display name, for example `name: "(Test) Opens Menu"`.
- Name stories after the state they represent, not the implementation. Also do not include the component name in the story name.
  - Prefer: `Default`, `Empty`, `WithLongName`, `Error`, `Disabled`, `Loading`
  - Avoid: `Test1`, `CustomRenderExample`, `ButtonWithLongNameAndIcon`
- Set callbacks up as Storybook Actions by default:

  ```ts
  import { fn } from "storybook/test";
  ```

- Avoid large fixtures.
- Use the smallest meaningful data shape needed to render the state.
- If fixtures are required and may be shared, check whether a reusable helper function exists. Otherwise, create one for defining the fixture.

## Variant and Design Showcase Stories

If a component has many variants, and the point of the story is to showcase the design of a component rather than its functionality, stories may render the component multiple times.

For example, a `Button` with a `size: "sm" | "md" | "lg"` prop may have a story that shows three buttons side by side.

If the button also has a `variant: "primary" | "secondary"` prop, consider using a matrix-like UI that showcases all possible combinations.

These compositional stories **should not** contain Storybook play functions. They should also not allow the Storybook user to customize the predefined args, such as `size` and `variant`, via Storybook args. Having an arg for non-bound props, such as `text`, may be acceptable.

## Additional Information

- We do not use MSW and are not planning to add it.
