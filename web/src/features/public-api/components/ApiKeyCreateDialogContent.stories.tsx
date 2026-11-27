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

/** selectUsageTab opens a usage tab, from the overflow menu when it doesn't fit the row. */
async function selectUsageTab(name: string) {
  const screen = within(document.body);
  const tab = screen.queryByRole("tab", { name });
  if (tab) {
    await userEvent.click(tab);
    return;
  }
  await userEvent.click(screen.getByRole("button", { name: "More tabs" }));
  // The menu renders in a portal outside the dialog, which the dialog marks aria-hidden.
  await userEvent.click(
    await screen.findByRole("menuitem", { name, hidden: true }),
  );
}
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
  name: "(Test) Created Organization Key Uses Project Id Placeholder",
  args: {
    type: "detail",
    scope: "organization",
    secretKey: SECRET_KEY,
    baseUrl: "https://cloud.langfuse.com",
  },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const screen = within(body);
    await expect(body.textContent).toContain(
      'LANGFUSE_PUBLIC_KEY="<your-project-id>"',
    );
    await expect(body.textContent).not.toContain("pk-lf-");
    await expect(
      screen.getByRole("link", { name: "tracing quickstart" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/get-started",
    );

    await userEvent.click(screen.getByRole("tab", { name: "API" }));
    await expect(body.textContent).toContain(
      "langfuse-project-id: <your-project-id>",
    );

    await userEvent.click(screen.getByRole("tab", { name: "Claude" }));
    await expect(body.textContent).toContain("Authorization: Bearer");
    await expect(body.textContent).not.toContain("Authorization: Basic");

    await expect(body.textContent).toContain(
      "Run in your terminal to connect Claude Code to Langfuse.",
    );
    await expect(body.textContent).toContain("claude mcp add langfuse");
    await userEvent.click(screen.getByRole("tab", { name: "Codex" }));
    await expect(body.textContent).toContain(
      "--bearer-token-env-var LANGFUSE_MCP_TOKEN",
    );
    await expect(body.textContent).not.toContain(SECRET_KEY);

    await selectUsageTab("Cursor");
    await expect(
      screen.getByRole("button", { name: "Add to Cursor" }),
    ).toBeInTheDocument();
    await expect(body.textContent).toContain('"mcpServers"');
    // The install link carries the key, so it is built on click and never rendered.
    await expect(body.innerHTML).not.toContain("cursor-deeplink");
    await expect(body.innerHTML).not.toContain(SECRET_KEY);

    await selectUsageTab("Pi");
    await expect(body.textContent).toContain("pi mcp add langfuse");
  },
});
