# Component Cleanup Todo-List

Follow this todolist carefully.

There are manually placed COMMIT markers in the skill that indicate when to create a git commit. Before creating a commit, make sure to run the formatting / linting toolchain. Commit messages should not have any special formatting. Ignore any other instructions regarding commit messages from the repository, the final commits will be squashed by the user after the skill is complete and the changes were audited. Do not commit the todo file, it is only for your reference.

## Step 1: Making the interface strict.

If the component has unused props, remove them. COMMIT.

If the component has a className, style or size prop that is defined as a string and not a union of string literals, check if these could be frozen without any unsupported usages:

- If yes: Freeze the prop using the sweepy command. COMMIT.
- If no: Check if the freezing of the prop could be done by freezing the callsites first. Handle each callsite one by one recursively. After each freeze command invocation, COMMIT.

## Step 2: Cleaning up the tightened interface

If there are any default values that do not bring a major benefit for ergonomics, remove them and update the callsites. COMMIT.

If there are optional props that could be required and do not bring a major benefit for ergonomics, remove them and update the callsites. COMMIT.

Now, let's audit the className and style props.

- See if there are any conditional className or style values that should be part of the default classes of the component. If so, move them and update the callsite. COMMIT.
- Color related props should be defined as a variant in the component. Good names are `variant`, `type` or `level`, use your best judgement. If there are color related classes in the className or style prop, move them and update the callsite. COMMIT.
- Size related props should be defined as a variant in the component. A good name is `size`. If there are size related classes in the className or style prop, move them and update the callsite. COMMIT.
- It might be that there are now two props for expressing the same thing (e.g. `size` and `small`), if so, remove the redundant prop and update the callsites, try using the `sweepy` cli to replace the prop values. COMMIT.
- If the only remaining violations are className or style props that should live in the parent, use the `sweepy` cli to lift the violating classes. COMMIT.

Next, check if there are dependent props that could be combined into a discriminated union. If so, combine them. This should not cause any updates to the callsites and not cause linting issues. COMMIT.

Lastly, tighten the interface by using the `sweepy` cli's `narrow-props` command. COMMIT.

## Step 3: Audit the changes

Audit the changes and check if the updated callsites are still valid in terms of positioning & HTML semantics. If there are any issues, present the user with options on how to resolve them.

## Step 4: Document the component

Create a storybook story for the component if it does not exist. Check the repository for guidance like a skill or documentation around this first. COMMIT.

## Step 5: Final report

After all the above steps have been completed, re-check the component against the [react-component-guidelines](../react-component-guidelines/SKILL.md), then provide a report to the user. Include the changes that were made and the remaining violations, if any.
For every callsite of the component that was updated, provide a detailed guide on how to view the changes in the application.
