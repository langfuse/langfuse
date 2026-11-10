import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { ManageFacetsDialog, type ManagedFacet } from "./ManageFacetsDialog";

const facets: ManagedFacet[] = [
  ...DEFAULT_TOPIC_FACETS.map((preset, index) => ({
    id: `built-in-${index}`,
    ...preset,
    version: 1,
    isBuiltIn: true,
    enabled: index !== 1,
  })),
  {
    id: "custom-1",
    name: "Escalation reason",
    description: "Why the user asked for a human.",
    prompt:
      "Describe why the user asked to talk to a human.\n\nFormat: one sentence naming the trigger.",
    version: 3,
    isBuiltIn: false,
    enabled: true,
  },
];

const meta = preview.meta({
  component: ManageFacetsDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
  args: {
    facets,
    canWrite: true,
    maxEnabled: 5,
    onEnabledChange: fn(async () => {}),
    onSave: fn(async () => {}),
  },
});

export const Default = meta.story({});

export const ReadOnly = meta.story({ args: { canWrite: false } });
