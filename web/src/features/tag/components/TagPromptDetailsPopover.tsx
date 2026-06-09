import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagManager";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagPromptDetailsPopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  promptName: string;
  includeCommentCounts: boolean;
  className?: string;
};

export function TagPromptDetailsPopover({
  tags,
  availableTags,
  projectId,
  promptName,
  includeCommentCounts,
  className,
}: TagPromptDetailsPopoverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "objects:tag" });
  const allVersionsInput = {
    projectId,
    name: promptName,
    includeCommentCounts,
  };

  const utils = api.useUtils();
  const mutTags = api.prompts.updateTags.useMutation({
    onMutate: async () => {
      await Promise.all([
        utils.prompts.byId.cancel(),
        utils.prompts.allVersions.cancel(allVersionsInput),
      ]);
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.prompts.allVersions.getData(allVersionsInput);
      return { prev };
    },
    onError: (err, _newTags, context) => {
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.prompts.allVersions.setData(allVersionsInput, context?.prev);
    },
    onSuccess: (_data, { tags }) => {
      utils.prompts.allVersions.setData(
        allVersionsInput,
        (oldQueryData: RouterOutput["prompts"]["allVersions"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                promptVersions: oldQueryData.promptVersions.map((prompt) => {
                  return prompt.name === promptName
                    ? { ...prompt, tags }
                    : prompt;
                }),
              }
            : undefined;
        },
      );
    },
    onSettled: () => {
      setIsLoading(false);
      utils.prompts.all.invalidate();
      utils.prompts.allVersions.invalidate();
      utils.prompts.filterOptions.invalidate();
    },
  });

  function mutateTags(newTags: string[]) {
    mutTags.mutateAsync({
      projectId,
      name: promptName,
      tags: newTags,
    });
  }

  return (
    <TagManager
      itemName="prompt"
      tags={tags}
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
