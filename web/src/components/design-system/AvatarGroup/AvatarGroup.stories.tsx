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

const emailOf = (name: string) =>
  `${name.split(" ")[0].toLowerCase()}@example.com`;

const avatars = (count: number): ComponentProps["avatars"] =>
  Array.from({ length: count }, (_, index) => {
    const displayName = people[index % people.length];
    return { id: String(index), displayName, email: emailOf(displayName) };
  });

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

export const WithoutNames = meta.story({
  args: {
    avatars: avatars(3).map((avatar) => ({
      ...avatar,
      displayName: avatar.email ?? avatar.displayName,
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

    // Hover an avatar itself, where its own name tooltip would open.
    await userEvent.hover(canvas.getByText("AL"));

    // Margaret is collapsed into the "+3" count, so only the card names her.
    await waitFor(
      () => expect(body.getByText("Margaret Hamilton")).toBeVisible(),
      { timeout: 2000 },
    );
    // Outlast the tooltip's open delay before checking none appeared.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(body.queryByRole("tooltip")).toBeNull();
  },
});

export const TestKeyboardReachesMemberList = meta.story({
  name: "(Test) Keyboard reaches a long member list",
  args: {
    avatars: avatars(250),
    max: 4,
    label: "250 members",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.tab();
    expect(canvas.getByRole("button", { name: "250 members" })).toHaveFocus();

    const list = await body.findByRole("group", { name: "250 members" });
    await userEvent.tab();
    expect(list).toHaveFocus();
  },
});
