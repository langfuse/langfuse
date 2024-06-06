import { useState } from "react";
import { useRouter } from "next/router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { TrashIcon } from "lucide-react";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type Scope } from "@/src/features/rbac/constants/roleAccessRights";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface DeleteButtonProps {
  itemId: string;
  projectId: string;
  isTableAction?: boolean;
  scope: Scope;
  invalidateFunc: () => void;
  type: "trace" | "dataset";
  redirectUrl?: string;
}

export function DeleteButton({
  itemId,
  projectId,
  isTableAction = false,
  scope,
  invalidateFunc,
  type,
  redirectUrl,
}: DeleteButtonProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const hasAccess = useHasAccess({ projectId, scope: scope });
  const traceMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      setIsDeleted(true);
      !isTableAction && redirectUrl
        ? void router.push(redirectUrl)
        : invalidateFunc();
    },
  });
  const datasetMutation = api.datasets.deleteDataset.useMutation({
    onSuccess: () => {
      setIsDeleted(true);
      !isTableAction && redirectUrl
        ? void router.push(redirectUrl)
        : invalidateFunc();
    },
  });

  return (
    <Popover key={itemId}>
      <PopoverTrigger asChild>
        <Button
          variant={isTableAction ? "ghost" : "outline"}
          size={isTableAction ? "xs" : "icon"}
          disabled={!hasAccess}
          onClick={() =>
            type === "trace"
              ? capture("trace:delete_form_open", {
                  source: isTableAction ? "table-single-row" : "trace detail",
                })
              : capture("datasets:delete_form_open", {
                  source: "dataset",
                })
          }
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action cannot be undone and removes all the data associated with
          this {type}.
        </p>
        <div className="flex justify-end space-x-4">
          {type === "trace" ? (
            <Button
              type="button"
              variant="destructive"
              loading={traceMutation.isLoading || isDeleted}
              onClick={() => {
                void traceMutation.mutateAsync({
                  traceIds: [itemId],
                  projectId,
                });
                capture("trace:delete", {
                  source: isTableAction ? "table-single-row" : "trace",
                });
              }}
            >
              Delete trace
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              loading={datasetMutation.isLoading || isDeleted}
              onClick={() => {
                void datasetMutation.mutateAsync({
                  projectId,
                  datasetId: itemId,
                });
                capture("datasets:delete_dataset_button_click", {
                  source: isTableAction ? "table-single-row" : "dataset",
                });
              }}
            >
              Delete dataset
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
