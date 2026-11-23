import type React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { AvatarGroup } from "./AvatarGroup";

type ComponentProps = React.ComponentProps<typeof AvatarGroup>;

const meta = preview.meta({
  component: AvatarGroup,
});

const people = [
  "Ada Lovelace",
  "Ben Bachem",
  "Grace Hopper",
  "Alan Turing",
  "Katherine Johnson",
  "Linus Torvalds",
  "Margaret Hamilton",
];

const avatars = (count: number): ComponentProps["avatars"] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    displayName: people[index % people.length],
  }));

export const Default = meta.story({
  args: {
    avatars: avatars(3),
    max: 4,
    label: "3 members",
  },
});

export const WithImages = meta.story({
  args: {
    avatars: avatars(3).map((avatar) => ({
      ...avatar,
      src: "/apple-touch-icon.png",
    })),
    max: 4,
    label: "3 members",
  },
});

export const WithEmails = meta.story({
  args: {
    avatars: avatars(3).map((avatar) => ({
      ...avatar,
      email: `${avatar.displayName.split(" ")[0].toLowerCase()}@example.com`,
    })),
    max: 4,
    label: "3 members",
  },
});

export const WithCount = meta.story({
  args: {
    avatars: avatars(7),
    max: 4,
    label: "7 members",
  },
});

export const WithLargeCount = meta.story({
  args: {
    avatars: avatars(250),
    max: 4,
    label: "250 members",
  },
});

export const TestHoverListsEveryone = meta.story({
  name: "(Test) Hover lists everyone in one card",
  args: {
    avatars: avatars(7),
    max: 4,
    label: "7 members",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(canvas.getByLabelText("7 members"));

    // Margaret is collapsed into the "+3" count, so only the card names her.
    await waitFor(
      () => expect(body.getByText("Margaret Hamilton")).toBeVisible(),
      { timeout: 2000 },
    );
    expect(body.queryByRole("tooltip")).toBeNull();
  },
});
