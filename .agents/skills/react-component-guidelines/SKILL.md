---
name: react-component-guidelines
description: Guidelines for writing React components. Use this when creating a new react component.
---

Components are useful because they act as an encapsulated unit and therefore promote composition. For this to work, a component needs to be isolatable and neither leak implementation details nor depend on its placement or usage context. The interface of a component is defined by its props, and therefore the props should be designed to be as explicit and unambiguous as possible.

## Minimal Interface

- No unused props
- No default values unless they bring a MAJOR benefit for ergonomics, use your best judgement here.
- Avoid optional props
- No conflicting props (e.g. having both `onClick` & `onSelect`)

## Composition

- Shared components should own meaningful presentation or complex logic. There must be a reason for code to be a component over a pure function or hook. When most logic is JSX-independent, use a pure function and keep trivial JSX at each call site. Use a hook over a pure function only when React lifecycle or state is required.
- Avoid polymorphic components:
  - **Presentation:** A component should own one concrete presentation. When an action needs different presentations across contexts (e.g. sometimes a button, sometimes an icon), keep them separate rather than selecting between them with mode props or flags.
  - **Behavior:** A component should own one cohesive workflow. When a prop selects fundamentally different workflows, split them into separate behavior-owning components. For example, prefer dedicated create, update, and delete dialog controllers over one action component whose `mode` changes the entire interaction.
- Extract only what is shared across call sites. Reuse a presentational component when the presentation is shared; when only state or behavior is shared, encapsulate it in a wrapper/render-prop component and let each call site provide its own presentation.

## Explicit States

- Always prefer `Pick<>` over `Omit<>` for prop types as this is more explicit.
- When spreading props, you must exclude the props that are manually applied on an element in the type definition of the component via `Pick<>`
- Use discriminated unions to communicate intent instead of relying on nullability / optionality
- Use discriminated unions to make impossible states impossible to represent in the type system instead of relying on runtime checks (e.g. if there is a `loading` and `data` type in the prop, then it should not be possible to have a state where `loading` is true and `data` is not null)

## Encapsulation

- No className / style props unless the component itself is a headless component that does not contain any styling or layout logic itself.
- Internals such as cva classes or helper functions should not be exported

## Ownership

- Margin should be applied by the parent component, not contained in a component. The child component should only define the inner spacing of itself and its contents.
- It's bad practice to have a component that returns `null` or `undefined`. Most of the time this suggests that the condition that leads to this state should be handled by the parent component instead, often this can be done in a way close to the current component by using a hook or a HOC.

## Overlays

- Compose overlays with `DropdownMenuController`, `PopoverController`, or `DialogController`. Trigger presentation should remain in the caller and not be abstracted. If additional behavior is needed, add a feature-specific wrapper that handles things such as permissions, analytics, mutations, or other workflow behavior that should be shared.
- Keep the controller components outside transient overlays that can trigger it. A popover or dialog opened from a dropdown item must not be owned by `DropdownMenuContent`, which unmounts when the dropdown closes.
- Consume the controller's render-prop controls instead of duplicating their shape. Do not move the passed `Trigger` into components. Abstract trigger presentation through a ref-forwarding component with explicit variants, while keeping `<Trigger asChild>` at each call site.
- Compose `<Trigger asChild>` in the caller around a semantic child that forwards its ref and injected props. For example, use `DropdownMenuItem` directly rather than nesting a `Button` inside it.

## Deterministic Styling

- Avoid conflicting style names in CSS definitions, even though they might be removed by tailwind-merge or the likes. Make the variants explicit instead by using cva, conditions or lookup tables.
