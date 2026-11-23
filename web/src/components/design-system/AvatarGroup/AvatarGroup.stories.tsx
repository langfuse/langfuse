import type React from "react";

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
  },
});

export const WithImages = meta.story({
  args: {
    avatars: avatars(3).map((avatar) => ({
      ...avatar,
      src: "/apple-touch-icon.png",
    })),
    max: 4,
  },
});

export const WithCount = meta.story({
  args: {
    avatars: avatars(7),
    max: 4,
  },
});

export const WithLargeCount = meta.story({
  args: {
    avatars: avatars(250),
    max: 4,
  },
});
