import { type ComponentProps } from "react";

import { type MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";

export type MemberOption = ComponentProps<
  typeof MultiSelectInput
>["options"][number];

export type GroupMember = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export const memberDisplayName = (member: {
  name: string | null;
  email: string | null;
}) => member.name ?? member.email ?? "";

export const memberCountLabel = (count: number) =>
  `${count} ${count === 1 ? "member" : "members"}`;

export const toMemberOption = (user: {
  id: string;
  name: string | null;
  email: string | null;
}): MemberOption => ({
  value: user.id,
  label: user.name ?? user.email ?? user.id,
  secondaryLabel: user.name ? (user.email ?? undefined) : undefined,
});
