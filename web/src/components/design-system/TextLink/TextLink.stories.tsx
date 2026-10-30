import { User } from "@langfuse/icons";

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

export const External = meta.story({
  args: {
    path: "https://langfuse.com/docs",
    value: "Docs",
    external: true,
  },
});

export const Inline = meta.story({
  render: () => (
    <p className="text-muted-foreground text-sm">
      GitHub API endpoint for repository dispatch.{" "}
      <TextLink
        path="https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event"
        value="Learn more"
        variant="inline"
        external
      />
    </p>
  ),
});
