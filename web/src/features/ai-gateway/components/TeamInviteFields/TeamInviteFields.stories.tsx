import { expect, fn, userEvent, within } from "storybook/test";

import { useState } from "react";

import preview from "@/.storybook/preview";
import {
  TeamInviteFields,
  type TeamInviteFieldsProps,
} from "./TeamInviteFields";

/** Keeps the typed text in state so typing behaves like the real form. */
function TeamInviteFieldsWithDraft(props: TeamInviteFieldsProps) {
  const [draft, setDraft] = useState(props.draft);
  return <TeamInviteFields {...props} draft={draft} onDraftChange={setDraft} />;
}

const meta = preview.meta({ component: TeamInviteFields });

const suggestedMembers = [
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
  [
    "ada@company.com",
    { name: "Ada Lovelace", isSelf: false, canUseGateway: true },
  ],
  ["me@company.com", { name: "Tobi", isSelf: true, canUseGateway: true }],
  [
    "viewer@company.com",
    { name: "Vera Viewer", isSelf: false, canUseGateway: false },
  ],
  ["sam@contractor.dev", null],
  ["kim@contractor.dev", null],
]);

export const Empty = meta.story({
  args: {
    emails: [],
    onEmailsChange: fn(),
    draft: "",
    onDraftChange: fn(),
    members: new Map(),
    memberSuggestions: {
      memberCount: 12,
      suggestedMembers,
      onMemberAdd: fn(),
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

/** The sender and a member whose role can't use the gateway get no email. */
export const WithMembersNotNotified = meta.story({
  args: {
    ...Empty.input.args,
    emails: ["me@company.com", "viewer@company.com"],
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

/** While typing, only matching members are offered and "All existing members" steps aside. */
export const Searching = meta.story({
  args: {
    ...Empty.input.args,
    draft: "gra",
    memberSuggestions: {
      ...Empty.input.args.memberSuggestions,
      suggestedMembers: suggestedMembers.slice(1, 2),
    },
  },
});

export const WithoutMembersToNotify = meta.story({
  args: {
    emails: ["sam@contractor.dev"],
    onEmailsChange: fn(),
    draft: "",
    onDraftChange: fn(),
    members,
  },
});

export const TestPickingSuggestions = meta.story({
  name: "(Test) Suggestions pick members by click or Enter, never the typed text",
  args: {
    ...Empty.input.args,
    memberSuggestions: {
      ...Empty.input.args.memberSuggestions,
      onMemberAdd: fn(),
      onAllSelectedChange: fn(),
    },
  },
  render: (args) => <TeamInviteFieldsWithDraft {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Email addresses" });
    const onMemberAdd = args.memberSuggestions?.onMemberAdd;

    await userEvent.click(
      canvas.getByRole("button", { name: "All existing members (12)" }),
    );
    await expect(
      args.memberSuggestions?.onAllSelectedChange,
    ).toHaveBeenCalledWith(true);

    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await expect(onMemberAdd).not.toHaveBeenCalled();

    // Pressing a pill must not blur the input and commit the half-typed address.
    await userEvent.type(input, "grace@");
    await userEvent.click(canvas.getByRole("button", { name: "Grace Hopper" }));
    await expect(onMemberAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "grace@company.com" }),
    );
    await expect(args.onEmailsChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "ada{Enter}");
    await expect(onMemberAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "ada@company.com" }),
    );
  },
});
