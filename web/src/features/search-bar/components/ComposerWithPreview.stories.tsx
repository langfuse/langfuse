import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SearchComposer } from "./SearchComposer";
import { SearchBarStoreProvider } from "../store/SearchBarStoreProvider";
import { createSearchBarStore } from "../store/searchBarStore";

function ComposerHost({
  draft = "",
  ...props
}: ComponentProps<typeof SearchComposer> & { draft?: string }) {
  const [store] = useState(() => {
    const created = createSearchBarStore();
    if (draft.length > 0) created.getState().actions.setDraft(draft);
    return created;
  });
  return (
    <SearchBarStoreProvider store={store} commit={fn()}>
      <SearchComposer {...props} />
    </SearchBarStoreProvider>
  );
}

const meta = preview.meta({
  component: SearchComposer,
  render: (args) => <ComposerHost {...args} />,
  args: { observed: undefined, onActivateAi: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const WithTokens = meta.story({
  render: (args) => (
    <ComposerHost {...args} draft="type:GENERATION name:pii-guardrail" />
  ),
});

/** `default` for embedded toolbars, `large` for full-page lists. */
export const Sizes = meta.story({
  render: (args) => (
    <div className="flex flex-col gap-3">
      <ComposerHost {...args} size="default" draft="type:GENERATION" />
      <ComposerHost {...args} size="large" draft="type:GENERATION" />
    </div>
  ),
});
