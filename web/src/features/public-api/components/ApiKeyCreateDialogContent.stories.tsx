/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/ui/dialog";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { expect, fn, spyOn, userEvent, within } from "storybook/test";

import { ApiKeyCreateDialogContent } from "./ApiKeyCreateDialogContent";

const sessionWithRoleSelection = {
  expires: "2999-01-01T00:00:00.000Z",
  user: null,
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
    apiKeyProjectRoleSelectionEnabled: true,
    apiKeyOrgRoleSelectionEnabled: true,
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

const SECRET_KEY = "sk-lf-4d164bc4-3275-43dd-8b18-150e006da4e7";
const PROJECT_ID = "cm1demoproject00000000001";

export const Created = meta.story({
  name: "(Test) Created Masks Secret Key",
  args: {
    type: "detail",
    scope: "project",
    secretKey: SECRET_KEY,
    projectId: PROJECT_ID,
    baseUrl: "https://cloud.langfuse.com",
  },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const screen = within(body);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      await expect(body.textContent).toContain(
        `LANGFUSE_PUBLIC_KEY="${PROJECT_ID}"`,
      );
      await expect(body.textContent).not.toContain("pk-lf-");
      await expect(body.textContent).not.toContain(SECRET_KEY);

      await userEvent.click(screen.getByRole("button", { name: "Copy key" }));
      await expect(writeText).toHaveBeenLastCalledWith(SECRET_KEY);
      await expect(body.textContent).not.toContain(SECRET_KEY);

      await userEvent.click(
        screen.getAllByRole("button", { name: "Show key" })[0]!,
      );
      await expect(screen.getByText(SECRET_KEY)).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});

export const CreatedOrganizationKey = meta.story({
  name: "(Test) Created Organization Key Uses Selected Project",
  args: {
    type: "detail",
    scope: "organization",
    secretKey: SECRET_KEY,
    projects: [
      { id: "cm1alphaproject0000000001", name: "Alpha" },
      { id: "cm1betaproject00000000001", name: "Beta" },
    ],
    baseUrl: "https://cloud.langfuse.com",
  },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const screen = within(body);
    await expect(body.textContent).toContain(
      'LANGFUSE_PUBLIC_KEY="cm1alphaproject0000000001"',
    );
    await expect(body.textContent).not.toContain("pk-lf-");

    await userEvent.click(screen.getByRole("combobox", { name: "Project" }));
    // The open select hides everything else from the accessibility tree,
    // including its own options while it positions them.
    await userEvent.click(
      await screen.findByRole("option", { name: "Beta", hidden: true }),
    );
    await expect(body.textContent).toContain(
      'LANGFUSE_PUBLIC_KEY="cm1betaproject00000000001"',
    );
  },
});
