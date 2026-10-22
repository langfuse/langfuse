import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { NotifyMembersToggle } from "./NotifyMembersToggle";

const meta = preview.meta({ component: NotifyMembersToggle });

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

export const WithOverflow = meta.story({
  args: {
    memberCount: 12,
    previewMembers,
    checked: true,
    onCheckedChange: fn(),
  },
});

export const SingleMember = meta.story({
  args: {
    ...WithOverflow.input.args,
    memberCount: 1,
    previewMembers: previewMembers.slice(0, 1),
    checked: false,
  },
});
