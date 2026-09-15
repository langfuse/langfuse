import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

import { CreateProjectMemberDialog } from "./CreateProjectMemberDialog";

const defaultArgs = {
  project: undefined,
  hasOnlySingleProjectAccess: false,
  hasProjectRoleEntitlement: false,
  isPending: false,
  createProjectMember: fn().mockResolvedValue(undefined),
  onSuccess: fn(),
} satisfies ComponentProps<typeof CreateProjectMemberDialog>;

const meta = preview.meta({
  component: CreateProjectMemberDialog,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const OrganizationMember = meta.story({
  args: defaultArgs,
});

export const ProjectMember = meta.story({
  args: {
    ...defaultArgs,
    project: { id: "project-1", name: "Support assistant" },
    hasProjectRoleEntitlement: true,
  },
});

export const SingleProjectAccess = meta.story({
  args: {
    ...defaultArgs,
    project: { id: "project-1", name: "Support assistant" },
    hasOnlySingleProjectAccess: true,
    hasProjectRoleEntitlement: true,
  },
});

export const SubmitsInvitation = meta.story({
  name: "(Test) Submits invitation",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      body.getByRole("textbox", { name: "Email" }),
      "member@example.com",
    );
    await userEvent.click(body.getByRole("button", { name: "Grant access" }));

    await expect(args.createProjectMember).toHaveBeenCalledWith({
      email: "member@example.com",
      orgRole: "MEMBER",
      projectRole: "NONE",
    });
    await expect(args.onSuccess).toHaveBeenCalledOnce();
  },
});
