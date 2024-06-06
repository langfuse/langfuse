import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagPromptDetailsPopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  promptName: string;
  className?: string;
};

export function TagPromptDetailsPopover({
  tags,
  availableTags,
  projectId,
  promptName,
  className,
}: TagPromptDetailsPopoverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.prompts.updateTags.useMutation({
    onMutate: async () => {
      await utils.prompts.byId.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.prompts.allVersions.getData({
        projectId: projectId,
        name: promptName,
      });
      return { prev };
    },
    onError: (err, _newTags, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.prompts.allVersions.setData(
        { projectId: projectId, name: promptName },
        context?.prev,
      );
    },
    onSettled: (data, error, { projectId: projectId, tags }) => {
      setIsLoading(false);
      utils.prompts.allVersions.setData(
        { projectId: projectId, name: promptName },
        (oldQueryData: RouterOutput["prompts"]["allVersions"] | undefined) => {
          return oldQueryData
            ? {
                promptVersions: oldQueryData.promptVersions.map((prompt) => {
                  return prompt.name === promptName
                    ? { ...prompt, tags }
                    : prompt;
                }),
                totalCount: oldQueryData.totalCount,
              }
            : undefined;
        },
      );
      void utils.prompts.all.invalidate();
      void utils.prompts.allVersions.invalidate();
      void utils.prompts.filterOptions.invalidate();
    },
  });

  function mutateTags(newTags: string[]) {
    void mutTags.mutateAsync({
      projectId,
      name: promptName,
      tags: newTags,
    });
  }

  return (
    <TagManager
      tags={tags}
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
