import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagManager";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagSkillPopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  skillName: string;
  skillsFilter: RouterInput["skills"]["all"];
  className?: string;
};

export function TagSkillPopover({
  tags,
  availableTags,
  projectId,
  skillName,
  skillsFilter,
  className,
}: TagSkillPopoverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.skills.updateTags.useMutation({
    onMutate: async () => {
      await utils.skills.all.cancel();
      setIsLoading(true);
      const prevSkill = utils.skills.all.getData(skillsFilter);
      return { prevSkill };
    },
    onError: (err, _newTags, context) => {
      utils.skills.all.setData(skillsFilter, context?.prevSkill);
      trpcErrorToast(err);
      setIsLoading(false);
    },
    onSettled: (data, error, { name, tags }) => {
      utils.skills.all.setData(
        skillsFilter,
        (oldQueryData: RouterOutput["skills"]["all"] | undefined) => {
          const updatedSkills = oldQueryData
            ? oldQueryData.skills.map((skill) => {
                return skill.name === name ? { ...skill, tags } : skill;
              })
            : [];
          return { skills: updatedSkills, totalCount: updatedSkills.length };
        },
      );
      setIsLoading(false);
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
      isTableCell
    />
  );
}
