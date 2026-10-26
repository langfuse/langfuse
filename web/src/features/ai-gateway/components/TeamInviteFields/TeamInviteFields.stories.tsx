import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { TeamInviteFields } from "./TeamInviteFields";

const meta = preview.meta({ component: TeamInviteFields });

const previewMembers = [
  { id: "user-1", name: "Ada Lovelace", email: "ada@company.com", image: null },
  {
    id: "user-2",
    name: "Grace Hopper",
    email: "grace@company.com",
    image: null,
  },
  { id: "user-3", name: null, email: "alan@company.com", image: null },
  {
    id: "user-4",
    name: "Edsger Dijkstra",
    email: "edsger@company.com",
    image: null,
  },
];

const members = new Map([
  ["ada@company.com", { name: "Ada Lovelace" }],
  ["sam@contractor.dev", null],
  ["kim@contractor.dev", null],
]);

export const Empty = meta.story({
  args: {
    emails: [],
    onEmailsChange: fn(),
    members: new Map(),
    memberSuggestions: {
      memberCount: 12,
      previewMembers,
      isAllSelected: false,
      onAllSelectedChange: fn(),
    },
  },
});

export const WithMemberAndExternal = meta.story({
  args: {
    ...Empty.input.args,
    emails: ["ada@company.com", "sam@contractor.dev"],
    members,
  },
});

/** Two people to invite, and one address still being looked up. */
export const WithPendingLookup = meta.story({
  args: {
    ...Empty.input.args,
    emails: ["sam@contractor.dev", "kim@contractor.dev", "new@company.com"],
    members,
  },
});

export const AllMembersSelected = meta.story({
  args: {
    ...WithMemberAndExternal.input.args,
    memberSuggestions: {
      ...Empty.input.args.memberSuggestions,
      isAllSelected: true,
    },
  },
});

export const WithError = meta.story({
  args: {
    ...WithMemberAndExternal.input.args,
    emails: [...WithMemberAndExternal.input.args.emails, "not-an-email"],
    errorMessage: "You can invite up to 50 people at once.",
  },
});

export const WithoutMembersToNotify = meta.story({
  args: {
    emails: ["sam@contractor.dev"],
    onEmailsChange: fn(),
    members,
  },
});

export const TestSpaceCommitsEmail = meta.story({
  name: "(Test) Space commits an email",
  args: { emails: [], onEmailsChange: fn(), members: new Map() },
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Email addresses",
    });
    await userEvent.type(input, "ada@company.com ");
    await expect(args.onEmailsChange).toHaveBeenCalledWith(["ada@company.com"]);
    await expect(input).toHaveValue("");
  },
});

export const TestMemberSuggestionAddsEmail = meta.story({
  name: "(Test) Member suggestions add the member or everyone",
  args: {
    ...WithMemberAndExternal.input.args,
    onEmailsChange: fn(),
    memberSuggestions: {
      ...Empty.input.args.memberSuggestions,
      onAllSelectedChange: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Ada Lovelace" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Grace Hopper" }));
    await expect(args.onEmailsChange).toHaveBeenCalledWith([
      "ada@company.com",
      "sam@contractor.dev",
      "grace@company.com",
    ]);

    await userEvent.click(
      canvas.getByRole("button", { name: "All existing members (12)" }),
    );
    await expect(
      args.memberSuggestions?.onAllSelectedChange,
    ).toHaveBeenCalledWith(true);
  },
});
