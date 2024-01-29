import { TrashIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { usePostHog } from "posthog-js/react";

export function DeleteTrace({
  traceId,
  projectId,
  isTableAction,
}: {
  traceId: string;
  projectId: string;
  isTableAction?: boolean;
}) {
  const [isDeleted, setIsDeleted] = useState(false);
  const router = useRouter();
  const utils = api.useUtils();
  const posthog = usePostHog();

  const hasAccess = useHasAccess({ projectId, scope: "traces:delete" });

  const mutDeleteTraces = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      setIsDeleted(true);
      if (!isTableAction) {
        void router
          .push(`/project/${projectId}/traces`)
          .then(() => utils.traces.invalidate());
      } else {
        void utils.traces.invalidate();
      }
    },
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Popover key={traceId}>
      <PopoverTrigger asChild>
        {isTableAction ? (
          <Button variant="ghost" size="xs">
            <TrashIcon className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" type="button" size="icon">
            <TrashIcon className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action cannot be undone and removes all the data associated with
          this trace.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutDeleteTraces.isLoading || isDeleted}
            onClick={() => {
              void mutDeleteTraces.mutateAsync({
                traceIds: [traceId],
                projectId,
              });
              posthog.capture("trace:delete", {
                source: isTableAction ? "table-single-row" : "trace",
              });
            }}
          >
            Delete trace
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
