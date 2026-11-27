import { type ComponentProps, useState } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { MAX_MEMBER_INVITES_PER_REQUEST } from "@/src/features/rbac/constants/memberInvites";

import { CreateProjectMemberDialog } from "./CreateProjectMemberDialog";

type InviteMembers = ComponentProps<
  typeof CreateProjectMemberDialog
>["inviteMembers"];

const defaultArgs = {
  project: undefined,
  organizationName: "Acme",
  hasOnlySingleProjectAccess: false,
  hasProjectRoleEntitlement: false,
  canManageOrgOwnership: true,
  canManageProjectOwnership: true,
  isAiGatewayEnabled: true,
  isPending: false,
  seatLimit: undefined,
  isCountingSeats: false,
  inviteMembers: fn<InviteMembers>(async ({ emails }) => ({
    invited: emails,
    added: [],
    addedToProject: [],
    failed: [],
  })),
  onAllInvited: fn(),
  onBeforeOpenBilling: fn(),
  onDone: fn(),
} satisfies ComponentProps<typeof CreateProjectMemberDialog>;

const billingHref = "/organization/org-1/settings/billing";

/** A Hobby organization as its owner sees it, with `used` of `max` seats taken. */
const ownerSeats = (used: number, max: number) => ({
  used,
  max,
  planName: "Hobby",
  upgradePlanName: "Core",
  billingHref,
});

/** Fills the plan once a send resolves, as the counts refetched after a send would. */
function FillsSeatsOnSend(
  args: ComponentProps<typeof CreateProjectMemberDialog>,
) {
  const [seatLimit, setSeatLimit] = useState(args.seatLimit);
  return (
    <CreateProjectMemberDialog
      {...args}
      seatLimit={seatLimit}
      inviteMembers={async (values) => {
        const result = await args.inviteMembers(values);
        setSeatLimit((seats) => seats && { ...seats, used: seats.max });
        return result;
      }}
    />
  );
}

type Body = ReturnType<typeof within>;

const roleNameOrder = [
  "Owner",
  "Admin",
  "Member",
  "Viewer",
  "AI Gateway",
  "None",
];

/** Opens a role dropdown by its label and returns its list. */
async function openRoles(body: Body, label: string) {
  await userEvent.click(body.getByRole("combobox", { name: label }));
  return within(await body.findByRole("listbox"));
}

/** The roles a dropdown's list offers, in order. */
function roleNames(listbox: Body) {
  return listbox
    .getAllByRole("option")
    .map((option: HTMLElement) =>
      roleNameOrder.find((name) => option.textContent?.startsWith(name)),
    );
}

async function pickRole(body: Body, label: string, role: string) {
  const listbox = await openRoles(body, label);
  await userEvent.click(
    listbox.getByRole("option", { name: (name) => name.startsWith(role) }),
  );
}

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

export const LimitedPlan = meta.story({
  args: { ...defaultArgs, seatLimit: ownerSeats(1, 2) },
});

export const SingleProjectAccess = meta.story({
  args: {
    ...defaultArgs,
    project: { id: "project-1", name: "Support assistant" },
    hasOnlySingleProjectAccess: true,
    hasProjectRoleEntitlement: true,
  },
});

export const WithoutOwnershipAccess = meta.story({
  name: "(Test) Owner role requires ownership access",
  args: {
    ...defaultArgs,
    canManageOrgOwnership: false,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const roles = await openRoles(body, "Invite as");

    await expect(roles.getByRole("option", { name: /^Owner/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(
      roles.getByRole("option", { name: /^Member/ }),
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.click(
      roles.getByRole("button", { name: "View Member permissions" }),
    );
    await expect(
      await body.findByRole("dialog", { name: /Member/ }),
    ).toBeInTheDocument();
  },
});

export const FocusAfterPermissions = meta.story({
  name: "(Test) Returns the focus to the role dropdown when its permissions close",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const roles = await openRoles(body, "Invite as");

    await userEvent.click(
      roles.getByRole("button", { name: "View Admin permissions" }),
    );
    await body.findByRole("dialog", { name: /Admin/ });
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(body.getByRole("combobox", { name: "Invite as" })).toHaveFocus(),
    );
  },
});

export const OverridesProjectRole = meta.story({
  name: "(Test) Sets a project role in its own dropdown",
  args: {
    ...defaultArgs,
    project: { id: "project-1", name: "Support assistant" },
    hasProjectRoleEntitlement: true,
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // The project role stays out of the way until asked for.
    await expect(
      body.queryByRole("combobox", { name: "Project role" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Set a project role" }),
    );
    // None keeps the organization role, as before.
    await expect(
      body.getByRole("combobox", { name: "Project role" }),
    ).toHaveTextContent("None (keep default role)");
    await expect(
      body.getByText("Overrides the organization role in this project."),
    ).toBeInTheDocument();
    await expect(roleNames(await openRoles(body, "Project role"))).toEqual([
      "Owner",
      "Admin",
      "Member",
      "Viewer",
      "None",
    ]);
    await userEvent.keyboard("{Escape}");

    await pickRole(body, "Project role", "Viewer");
    await userEvent.paste("ada@example.com");
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(args.inviteMembers).toHaveBeenCalledWith({
      emails: ["ada@example.com"],
      orgRole: "MEMBER",
      projectRole: "VIEWER",
    });
  },
});

export const ReadOnlyWhileSending = meta.story({
  name: "(Test) Takes no edits while the list is being sent",
  args: { ...defaultArgs, isPending: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const emails = body.getByRole("textbox", { name: "Email addresses" });

    await userEvent.type(emails, "ada@example.com ");
    await userEvent.paste("grace@example.com");

    await expect(emails).toHaveValue("");
    await expect(
      body.queryByRole("button", { name: /^Remove / }),
    ).not.toBeInTheDocument();
  },
});

export const PastesAfterPickingRole = meta.story({
  name: "(Test) Takes a paste right after a role is picked",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await pickRole(body, "Invite as", "Viewer");
    await waitFor(() =>
      expect(
        body.getByRole("textbox", { name: "Email addresses" }),
      ).toHaveFocus(),
    );
    await userEvent.paste("ada@example.com, grace@example.com");

    await expect(
      body.getByRole("button", { name: "Remove ada@example.com" }),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("combobox", { name: "Invite as" }),
    ).toHaveTextContent("Viewer");
  },
});

export const InvitesPastedEmails = meta.story({
  name: "(Test) Invites a pasted list in one submit",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    // The input has focus on open, so the list is pasted without a click.
    await expect(
      body.getByRole("textbox", { name: "Email addresses" }),
    ).toHaveFocus();
    // An email client's To: line, a repeat in another case included.
    await userEvent.paste(
      "Ada Lovelace <ada@example.com>; grace@example.com, alan@example.com\nADA@example.com, edsger@example.com",
    );
    await pickRole(body, "Invite as", "Viewer");
    await expect(
      body
        .getAllByRole("button", { name: /^Remove / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Remove ada@example.com",
      "Remove grace@example.com",
      "Remove alan@example.com",
      "Remove edsger@example.com",
    ]);
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(args.inviteMembers).toHaveBeenCalledWith({
      emails: [
        "ada@example.com",
        "grace@example.com",
        "alan@example.com",
        "edsger@example.com",
      ],
      orgRole: "VIEWER",
      projectRole: "NONE",
    });
    await expect(args.onAllInvited).toHaveBeenCalledOnce();
  },
});

export const SendsTypedAddress = meta.story({
  name: "(Test) Sends a typed address, committed as the button is pressed",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      body.getByRole("textbox", { name: "Email addresses" }),
      "ada@example.com",
    );
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(args.inviteMembers).toHaveBeenCalledWith({
      emails: ["ada@example.com"],
      orgRole: "MEMBER",
      projectRole: "NONE",
    });
  },
});

export const KeepsOnlyFailedEmails = meta.story({
  name: "(Test) Keeps only the failed emails, each with its reason",
  render: (args) => <FillsSeatsOnSend {...args} />,
  args: {
    ...defaultArgs,
    seatLimit: ownerSeats(1, 5),
    inviteMembers: fn<InviteMembers>(async () => ({
      invited: ["ada@example.com"],
      added: ["grace@example.com"],
      addedToProject: [],
      failed: [
        { email: "alan@example.com", reason: "already_member" },
        { email: "edsger@example.com", reason: "seat_limit" },
      ],
    })),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste(
      "ada@example.com, grace@example.com, alan@example.com, edsger@example.com,",
    );
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(
      await body.findByText("2 invites sent. 2 weren't sent."),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("textbox", { name: "Email addresses" }),
    ).toHaveFocus();
    await expect(
      body
        .getAllByRole("button", { name: /^Remove / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Remove alan@example.com", "Remove edsger@example.com"]);
    await expect(
      body.getByTitle("alan@example.com (already a member)"),
    ).toBeInTheDocument();
    await expect(
      body.getByTitle("edsger@example.com (no seat left on your plan)"),
    ).toBeInTheDocument();
    // Neither failure can pass on a retry, so the dialog offers Done.
    await expect(
      body.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Done" }));
    await expect(args.onDone).toHaveBeenCalledOnce();
    await expect(args.onAllInvited).not.toHaveBeenCalled();
  },
});

export const RetriesOnlyRetryable = meta.story({
  name: "(Test) Retries only the failures a retry can fix",
  render: (args) => <FillsSeatsOnSend {...args} />,
  args: {
    ...defaultArgs,
    seatLimit: ownerSeats(1, 5),
    inviteMembers: fn<InviteMembers>(async ({ emails }) =>
      emails.length === 3
        ? {
            invited: ["ada@example.com"],
            added: [],
            addedToProject: [],
            failed: [
              { email: "grace@example.com", reason: "other" },
              { email: "alan@example.com", reason: "seat_limit" },
            ],
          }
        : { invited: emails, added: [], addedToProject: [], failed: [] },
    ),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste(
      "ada@example.com, grace@example.com, alan@example.com",
    );
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Try again" }),
    );

    await expect(args.inviteMembers).toHaveBeenLastCalledWith({
      emails: ["grace@example.com"],
      orgRole: "MEMBER",
      projectRole: "NONE",
    });
    await expect(
      await body.findByText("1 invite sent. 1 wasn't sent."),
    ).toBeInTheDocument();
    await expect(
      body
        .getAllByRole("button", { name: /^Remove / })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Remove alan@example.com"]);
    await expect(body.getByRole("button", { name: "Done" })).toBeEnabled();
  },
});

export const RetriesSeatLimitOnceSeatOpens = meta.story({
  name: "(Test) Retries a seat-limit failure once a seat is open",
  args: {
    ...defaultArgs,
    seatLimit: ownerSeats(1, 3),
    inviteMembers: fn<InviteMembers>(async ({ emails }) =>
      emails.length === 2
        ? {
            invited: ["ada@example.com"],
            added: [],
            addedToProject: [],
            failed: [{ email: "alan@example.com", reason: "seat_limit" }],
          }
        : { invited: emails, added: [], addedToProject: [], failed: [] },
    ),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste("ada@example.com, alan@example.com");
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Try again" }),
    );

    await expect(args.inviteMembers).toHaveBeenLastCalledWith({
      emails: ["alan@example.com"],
      orgRole: "MEMBER",
      projectRole: "NONE",
    });
  },
});

export const WaitsForSeatCount = meta.story({
  name: "(Test) Holds the send until a limited plan's seats are counted",
  args: { ...defaultArgs, isCountingSeats: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste("ada@example.com");

    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeDisabled();
  },
});

export const SendsEditedResult = meta.story({
  name: "(Test) Sends the list again once a failed chip is edited",
  args: {
    ...defaultArgs,
    inviteMembers: fn<InviteMembers>(async () => ({
      invited: [],
      added: [],
      addedToProject: [],
      failed: [
        { email: "grace@example.com", reason: "pending_invite" },
        { email: "alan@example.com", reason: "already_member" },
      ],
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste("grace@example.com, alan@example.com");
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));
    await expect(
      await body.findByText("No invites sent. 2 weren't sent."),
    ).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Remove alan@example.com" }),
    );

    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeEnabled();
    await expect(
      body.getByRole("textbox", { name: "Email addresses" }),
    ).toHaveFocus();
  },
});

export const HoldsTextLeftInField = meta.story({
  name: "(Test) Holds the send while text left in the field isn't an address",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Email addresses" });

    await userEvent.paste("ada@example.com");
    await userEvent.type(input, "asdf");
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(args.inviteMembers).not.toHaveBeenCalled();
    await expect(
      body.getByRole("button", { name: "Edit asdf, not an email address" }),
    ).toBeInTheDocument();
    await expect(
      body.getByText("“asdf” isn't an email address. Select it to fix it."),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeDisabled();
    await expect(input).toHaveValue("");
  },
});

export const OwnerLastSeat = meta.story({
  name: "(Test) Warns past the last seat but still sends",
  args: { ...defaultArgs, seatLimit: ownerSeats(1, 2) },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste("ada@example.com, grace@example.com");
    await expect(
      body.getByText("You have 1 open seat, so 1 of these won't be sent."),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Send invites" }));

    await expect(args.inviteMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        emails: ["ada@example.com", "grace@example.com"],
      }),
    );
  },
});

export const OwnerSeatsTaken = meta.story({
  name: "(Test) Opens a full plan with Send off and an upgrade that keeps the chips",
  args: { ...defaultArgs, seatLimit: ownerSeats(2, 2) },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const open = spyOn(window, "open").mockReturnValue(null);

    await userEvent.paste("ada@example.com");
    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeDisabled();
    await userEvent.click(
      body.getByRole("button", {
        name: "Upgrade to Core for unlimited seats ↗",
      }),
    );

    await expect(args.onBeforeOpenBilling).toHaveBeenCalledWith(1);
    await expect(open).toHaveBeenCalledWith(billingHref, "_blank", "noopener");
    await expect(
      body.getByRole("button", { name: "Remove ada@example.com" }),
    ).toBeInTheDocument();
    open.mockRestore();
  },
});

export const InvalidEntry = meta.story({
  name: "(Test) Blocks the submit until an invalid entry is fixed",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Email addresses" });

    await userEvent.paste("ada@example.com, grace@example,");
    await expect(
      body.getByText(
        "“grace@example” isn't an email address. Select it to fix it.",
      ),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeDisabled();

    await userEvent.click(
      body.getByRole("button", {
        name: "Edit grace@example, not an email address",
      }),
    );
    await expect(input).toHaveValue("grace@example");
    await expect(input).toHaveFocus();
    await userEvent.type(input, ".com,");
    await expect(
      body.getByRole("button", { name: "Send invites" }),
    ).toBeEnabled();
  },
});

export const OverInviteCap = meta.story({
  name: "(Test) Leaves out the addresses past the cap",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.paste(
      Array.from(
        { length: MAX_MEMBER_INVITES_PER_REQUEST + 2 },
        (_, index) => `person-${index}@example.com`,
      ).join(", ") + ",",
    );
    await expect(
      body.getByText(
        `You can invite up to ${MAX_MEMBER_INVITES_PER_REQUEST} people at a time, so the last 2 weren't added. Send them next.`,
      ),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("button", {
        name: "Send invites",
      }),
    ).toBeEnabled();
  },
});

export const AiGatewayDisabled = meta.story({
  name: "(Test) Hides the AI Gateway role when the gateway is off",
  args: { ...defaultArgs, isAiGatewayEnabled: false },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(roleNames(await openRoles(body, "Invite as"))).toEqual([
      "Owner",
      "Admin",
      "Member",
      "Viewer",
      "None",
    ]);
  },
});

export const AiGatewayEnabled = meta.story({
  name: "(Test) Offers the AI Gateway role when the gateway is on",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(roleNames(await openRoles(body, "Invite as"))).toContain(
      "AI Gateway",
    );
  },
});
