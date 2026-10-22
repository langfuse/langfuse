import { fn } from "storybook/test";

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

export const WithoutMembersToNotify = meta.story({
  args: {
    emails: [],
    onEmailsChange: fn(),
  },
});
