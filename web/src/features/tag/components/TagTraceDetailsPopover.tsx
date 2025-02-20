import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type RouterOutput } from "@/src/utils/types";
import TagManager from "@/src/features/tag/components/TagMananger";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type TagTraceDetailsPopoverProps = {
  tags: string[];
  availableTags: string[];
  projectId: string;
  traceId: string;
  className?: string;
};

export function TagTraceDetailsPopover({
  tags,
  availableTags,
  projectId,
  traceId,
  className,
}: TagTraceDetailsPopoverProps) {
  const [isLoading, setIsLoading] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.byIdWithObservationsAndScores.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.traces.byIdWithObservationsAndScores.getData({
        traceId,
        projectId,
      });

      return { prev };
    },
    onError: (err, _newTags, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.traces.byIdWithObservationsAndScores.setData(
        { traceId, projectId },
        context?.prev,
      );
    },
    onSettled: (data, error, { traceId, tags }) => {
      setIsLoading(false);
      utils.traces.byIdWithObservationsAndScores.setData(
        { traceId, projectId },
        (
          oldQueryData:
            | RouterOutput["traces"]["byIdWithObservationsAndScores"]
            | undefined,
        ) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                tags: tags,
              }
            : undefined;
        },
      );
      void utils.traces.all.invalidate();
      void utils.traces.byIdWithObservationsAndScores.invalidate();
      void utils.traces.filterOptions.invalidate();
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
      itemName="trace"
      tags={tags}
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
