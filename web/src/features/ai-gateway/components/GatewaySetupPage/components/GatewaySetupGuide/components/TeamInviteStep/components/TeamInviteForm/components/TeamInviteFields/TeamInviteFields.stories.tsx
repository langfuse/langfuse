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

export const Empty = meta.story({
  args: {
    emails: [],
    onEmailsChange: fn(),
    notifyMembers: {
      memberCount: 12,
      previewMembers,
      checked: true,
      onCheckedChange: fn(),
    },
  },
});

export const WithEmails = meta.story({
  args: {
    ...Empty.input.args,
    emails: ["tobi@langfuse.com", "beer@beer.com", "not-an-email"],
  },
});

export const WithError = meta.story({
  args: {
    ...WithEmails.input.args,
    errorMessage: "You can invite up to 100 people at once.",
  },
});

export const WithoutMembersToNotify = meta.story({
  args: {
    emails: [],
    onEmailsChange: fn(),
  },
});

export const TestSpaceCommitsEmail = meta.story({
  name: "(Test) Space commits an email",
  args: { emails: [], onEmailsChange: fn() },
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Email addresses",
    });
    await userEvent.type(input, "ada@company.com ");
    await expect(args.onEmailsChange).toHaveBeenCalledWith(["ada@company.com"]);
    await expect(input).toHaveValue("");
  },
});
