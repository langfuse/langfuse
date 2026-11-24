import { useState } from "react";

import { type NewGroup } from "@/src/features/groups/components/CreateGroupDialog";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/** useCreateGroup creates a group, gives it the picked role and members, and confirms it in one toast. */
export function useCreateGroup({
  orgId,
  onDone,
  onPartlySaved,
}: {
  orgId: string;
  onDone: () => void;
  /** Called with the new group when its role or members could not be saved. */
  onPartlySaved: (group: { id: string }) => void;
}) {
  const utils = api.useUtils();
  const create = api.groups.create.useMutation();
  const setOrgRole = api.groups.setOrgRole.useMutation();
  const addMembers = api.groups.addMembers.useMutation();
  const [isSaving, setIsSaving] = useState(false);

  const submit = async ({ displayName, role, userIds }: NewGroup) => {
    setIsSaving(true);
    try {
      const group = await create.mutateAsync({ orgId, displayName });
      const results = await Promise.allSettled([
        role === "NONE" || role === "OWNER"
          ? undefined
          : setOrgRole.mutateAsync({ orgId, groupId: group.id, role }),
        userIds.length === 0
          ? undefined
          : addMembers.mutateAsync({ orgId, groupId: group.id, userIds }),
      ]);
      await utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      onDone();
      if (results.some((result) => result.status === "rejected")) {
        onPartlySaved(group);
        return;
      }
      showSuccessToast({
        operation: "group.create",
        title: "Group created",
        description:
          userIds.length > 0
            ? `${group.displayName} created with ${memberCountLabel(userIds.length)}`
            : `${group.displayName} created`,
        duration: 3000,
      });
    } catch {
      // The create error shows in the dialog.
    } finally {
      setIsSaving(false);
    }
  };

  return { submit, isSaving, error: create.error?.message };
}
