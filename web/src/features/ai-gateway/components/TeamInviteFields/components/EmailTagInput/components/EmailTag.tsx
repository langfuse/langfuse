import { Mail } from "@langfuse/icons";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import type { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";

export type EmailTagProps = {
  email: string;
  kind: ReturnType<typeof getInviteeKind>;
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
      icon={kind === "external" ? Mail : undefined}
      status={kind === "invalid" ? "error" : "default"}
      remove={{ onRemove: handleRemove }}
    />
  );
}
