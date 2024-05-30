import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagPromptPopverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  promptName: string;
  promptsFilter: RouterInput["prompts"]["all"];
  className?: string;
};

export function TagPromptPopover({
  tags,
  availableTags,
  projectId,
  promptName,
  promptsFilter,
  className,
}: TagPromptPopverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.prompts.updateTags.useMutation({
    onMutate: async () => {
      await utils.prompts.all.cancel();
      setIsLoading(true);
      const prevPrompt = utils.prompts.all.getData(promptsFilter);
      return { prevPrompt };
    },
    onError: (err, _newTags, context) => {
      utils.prompts.all.setData(promptsFilter, context?.prevPrompt);
      trpcErrorToast(err);
      setIsLoading(false);
    },
    onSettled: (data, error, { name, tags }) => {
      utils.prompts.all.setData(
        promptsFilter,
        (oldQueryData: RouterOutput["prompts"]["all"] | undefined) => {
          const updatedPrompts = oldQueryData
            ? oldQueryData.prompts.map((prompt) => {
                return prompt.name === name ? { ...prompt, tags } : prompt;
              })
            : [];
          return { prompts: updatedPrompts, totalCount: updatedPrompts.length };
        },
      );
      setIsLoading(false);
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
