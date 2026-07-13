import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagManager";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagSkillDetailsPopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  skillName: string;
  includeCommentCounts: boolean;
  className?: string;
};

export function TagSkillDetailsPopover({
  tags,
  availableTags,
  projectId,
  skillName,
  includeCommentCounts,
  className,
}: TagSkillDetailsPopoverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "objects:tag" });
  const allVersionsInput = {
    projectId,
    name: skillName,
    includeCommentCounts,
  };

  const utils = api.useUtils();
  const mutTags = api.skills.updateTags.useMutation({
    onMutate: async () => {
      await Promise.all([
        utils.skills.byId.cancel(),
        utils.skills.allVersions.cancel(allVersionsInput),
      ]);
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.skills.allVersions.getData(allVersionsInput);
      return { prev };
    },
    onError: (err, _newTags, context) => {
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.skills.allVersions.setData(allVersionsInput, context?.prev);
    },
    onSuccess: (_data, { tags }) => {
      utils.skills.allVersions.setData(
        allVersionsInput,
        (oldQueryData: RouterOutput["skills"]["allVersions"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                skillVersions: oldQueryData.skillVersions.map((skill) => {
                  return skill.name === skillName ? { ...skill, tags } : skill;
                }),
              }
            : undefined;
        },
      );
    },
    onSettled: () => {
      setIsLoading(false);
      utils.skills.all.invalidate();
      utils.skills.allVersions.invalidate();
      utils.skills.filterOptions.invalidate();
    },
  });

  function mutateTags(newTags: string[]) {
    mutTags.mutateAsync({
      projectId,
      name: skillName,
      tags: newTags,
    });
  }

  return (
    <TagManager
      itemName="skill"
      tags={tags}
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
