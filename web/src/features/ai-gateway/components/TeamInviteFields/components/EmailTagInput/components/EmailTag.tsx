import { Mail } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import type { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";

type InviteeKind = ReturnType<typeof getInviteeKind>;

/** Why an address gets no email, shown after its name. */
const NOT_NOTIFIED_REASON: Partial<Record<InviteeKind, string>> = {
  self: "(you)",
  memberWithoutAccess: "(role can't use the gateway)",
};

function getTagStatus(kind: InviteeKind) {
  if (kind === "invalid") return "error";
  if (kind === "memberWithoutAccess") return "warning";
  return "default";
}

export type EmailTagProps = {
  email: string;
  kind: InviteeKind;
  /** Shown instead of the address for members with a name. */
  memberName: string | null | undefined;
  onRemove: (email: string) => void;
};

export function EmailTag({ email, kind, memberName, onRemove }: EmailTagProps) {
  function handleRemove() {
    onRemove(email);
  }

  return (
    <Tag
      text={memberName ?? email}
      secondaryText={NOT_NOTIFIED_REASON[kind]}
      icon={kind === "external" ? Mail : undefined}
      status={getTagStatus(kind)}
      remove={{ onRemove: handleRemove }}
    />
  );
}
