import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
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
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });

  const utils = api.useUtils();
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.byId.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.traces.byId.getData({ traceId });

      return { prev };
    },
    onError: (err, _newTags, context) => {
      setIsLoading(false);
      trpcErrorToast(err);
      // Rollback to the previous value if mutation fails
      utils.traces.byId.setData({ traceId }, context?.prev);
    },
    onSettled: (data, error, { traceId, tags }) => {
      setIsLoading(false);
      utils.traces.byId.setData(
        { traceId },
        (oldQueryData: RouterOutput["traces"]["byId"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                tags: tags,
              }
            : undefined;
        },
      );
      void utils.traces.all.invalidate();
      void utils.traces.byId.invalidate();
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
      tags={tags}
      allTags={availableTags}
      hasAccess={hasAccess}
      isLoading={isLoading}
      mutateTags={mutateTags}
      className={className}
    />
  );
}
