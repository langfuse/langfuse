import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";

type TagPromptPopverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  promptName: string;
  promptsFilter: RouterInput["prompts"]["all"];
};

export function TagPromptPopver({
  tags,
  availableTags,
  projectId,
  promptName,
  promptsFilter,
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
      console.log("error", err);
      setIsLoading(false);
    },
    onSettled: (data, error, { name, tags }) => {
      utils.prompts.all.setData(
        promptsFilter,
        (oldQueryData: RouterOutput["prompts"]["all"] | undefined) => {
          return oldQueryData
            ? oldQueryData.map((prompt) => {
                return prompt.name === name ? { ...prompt, tags } : prompt;
              })
            : [];
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
    />
  );
}
