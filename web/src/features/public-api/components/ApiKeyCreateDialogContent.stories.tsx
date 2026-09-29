import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/ui/dialog";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { fn } from "storybook/test";

import { ApiKeyCreateDialogContent } from "./ApiKeyCreateDialogContent";

const sessionWithRoleSelection = {
  expires: "2999-01-01T00:00:00.000Z",
  user: null,
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
    apiKeyRoleSelectionEnabled: true,
  },
} as unknown as Session;

const meta = preview.meta({
  component: ApiKeyCreateDialogContent,
  decorators: [
    (Story) => (
      <SessionProvider session={sessionWithRoleSelection}>
        <Dialog open onOpenChange={fn()}>
          <Story />
        </Dialog>
      </SessionProvider>
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

export const WithoutRoleSelection = meta.story({
  args: {
    type: "form",
    scope: "project",
    onSubmit: fn(),
    isPending: false,
  },
  decorators: [
    (Story) => (
      <SessionProvider session={null}>
        <Dialog open onOpenChange={fn()}>
          <Story />
        </Dialog>
      </SessionProvider>
    ),
  ],
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
