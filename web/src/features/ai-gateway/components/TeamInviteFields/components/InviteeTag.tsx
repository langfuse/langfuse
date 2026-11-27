import { type ComponentProps } from "react";
import { Mail } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

/** Why an address gets no email, shown after its name. */
const NOT_NOTIFIED_REASON: Partial<
  Record<ReturnType<typeof getInviteeKind>, string>
> = {
  self: "(you)",
  memberWithoutAccess: "(role can't use the gateway)",
};

/** An invitee chip: the member's name when known, and whether they get an email. */
export function InviteeTag({
  email,
  members,
  remove,
}: {
  email: string;
  members: TeamInviteMembers;
  remove: ComponentProps<typeof Tag>["remove"];
}) {
  const kind = getInviteeKind(email, members);
  return (
    <Tag
      text={members.get(email)?.name ?? email}
      secondaryText={NOT_NOTIFIED_REASON[kind]}
      icon={kind === "external" ? Mail : undefined}
      status={kind === "memberWithoutAccess" ? "warning" : "default"}
      remove={remove}
    />
  );
}
