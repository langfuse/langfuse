import { User } from "lucide-react";

import preview from "../../../../.storybook/preview";
import { TextLink } from "./TextLink";

const meta = preview.meta({
  component: TextLink,
});

export const Default = meta.story({
  args: {
    path: "#",
    value: "View user",
  },
});

export const WithIcon = meta.story({
  name: "With Icon",
  args: {
    path: "#",
    value: "View user",
    icon: User,
  },
});
