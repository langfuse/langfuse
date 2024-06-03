import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagTracePopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  traceId: string;
  tracesFilter: RouterInput["traces"]["all"];
  className?: string;
};

export function TagTracePopover({
  tags,
  availableTags,
  projectId,
  traceId,
  tracesFilter,
  className,
}: TagTracePopoverProps) {
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
      trpcErrorToast(err);
      setIsLoading(false);
    },
    onSettled: (data, error, { traceId, tags }) => {
      utils.traces.all.setData(
        tracesFilter,
        (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
          return oldQueryData
            ? {
                totalCount: oldQueryData.totalCount,
                traces: oldQueryData.traces.map((trace) => {
                  return trace.id === traceId ? { ...trace, tags } : trace;
                }),
              }
            : { totalCount: undefined, traces: [] };
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
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
