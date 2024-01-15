import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";

type TagPopOverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  traceId: string;
  tracesFilter: RouterInput["traces"]["all"];
};

export function TagPopOver({
  tags,
  availableTags,
  projectId,
  traceId,
  tracesFilter,
}: TagPopOverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.all.cancel();
      setIsLoading(true);
      const prevTrace = utils.traces.all.getData(tracesFilter);
      return { prevTrace };
    },
    onError: (err, _newTags, context) => {
      utils.traces.all.setData(tracesFilter, context?.prevTrace);
      console.log("error", err);
      setIsLoading(false);
    },
    onSettled: (data, error, { traceId, tags }) => {
      utils.traces.all.setData(
        tracesFilter,
        (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
          return oldQueryData
            ? oldQueryData.map((trace) => {
                return trace.id === traceId ? { ...trace, tags } : trace;
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
      traceId,
      tags: newTags,
    });
  }

  return (
    <TagManager
      tags={tags}
      availableTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
    />
  );
}
