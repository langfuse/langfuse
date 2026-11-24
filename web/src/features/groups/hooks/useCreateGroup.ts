import { useState } from "react";
import { type Role } from "@langfuse/shared/src/db";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useRefreshGroups } from "@/src/features/groups/hooks/useRefreshGroups";
import { api } from "@/src/utils/api";

type NewGroupInput = {
  orgId: string;
  displayName: string;
  role: Role;
  userIds: string[];
};

/** useCreateGroup creates a group, then gives it its organization role and members, and confirms it in one toast. */
export function useCreateGroup() {
  const refresh = useRefreshGroups();
  const create = api.groups.create.useMutation();
  const setOrgRole = api.groups.setOrgRole.useMutation();
  const addMembers = api.groups.addMembers.useMutation();
  const [isPending, setIsPending] = useState(false);

  /** Rejects when the group was not created. `partlySaved` means the role or the members failed. */
  const createGroup = async ({
    orgId,
    displayName,
    role,
    userIds,
  }: NewGroupInput) => {
    setIsPending(true);
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
      await refresh();
      const partlySaved = results.some(
        (result) => result.status === "rejected",
      );
      if (!partlySaved)
        showSuccessToast({
          operation: "group.create",
          title: "Group created",
          description:
            userIds.length > 0
              ? `${group.displayName} created with ${memberCountLabel(userIds.length)}`
              : `${group.displayName} created`,
          duration: 3000,
        });
      return { group, partlySaved };
    } finally {
      setIsPending(false);
    }
  };

  return { createGroup, isPending, error: create.error };
}
