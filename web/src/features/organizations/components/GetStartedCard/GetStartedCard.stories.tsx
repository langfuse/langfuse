import preview from "@/.storybook/preview";
import { GetStartedCard } from "./GetStartedCard";

const meta = preview.meta({
  component: GetStartedCard,
  args: { canCreateOrganizations: true },
});

export const CanCreateOrganizations = meta.story({});

export const InviteOnly = meta.story({
  args: { canCreateOrganizations: false },
});
