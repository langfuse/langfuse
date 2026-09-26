import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/ui/dialog";
import { fn } from "storybook/test";

import { ApiKeyCreateDialogContent } from "./ApiKeyCreateDialogContent";

const meta = preview.meta({
  component: ApiKeyCreateDialogContent,
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <Story />
      </Dialog>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    type: "form",
    scope: "project",
    onSubmit: fn(),
    isPending: false,
  },
});

export const OrganizationScope = meta.story({
  args: {
    type: "form",
    scope: "organization",
    onSubmit: fn(),
    isPending: false,
  },
});

export const Created = meta.story({
  args: {
    type: "detail",
    scope: "project",
    secretKey: "sk-lf-1234567890abcdef",
    publicKey: "pk-lf-1234567890abcdef",
    baseUrl: "https://cloud.langfuse.com",
  },
});
