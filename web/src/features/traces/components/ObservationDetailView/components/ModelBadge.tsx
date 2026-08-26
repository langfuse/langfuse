/**
 * Model pill for ObservationDetailView.
 * Handles linked models (with external link) and unlinked models (with create form).
 */

import { ArrowUpRight, PlusCircle } from "lucide-react";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialog";
import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";

export function ModelBadge({
  model,
  internalModelId,
  projectId,
  usageDetails,
}: {
  model: string | null;
  internalModelId: string | null;
  projectId: string;
  usageDetails: Record<string, number> | undefined;
}) {
  if (!model) return null;

  if (internalModelId) {
    return (
      <HeaderPill
        variant="link"
        href={`/project/${projectId}/settings/models/${internalModelId}`}
      >
        model{" "}
        <span
          className="text-foreground group-hover:text-link truncate"
          title={model}
        >
          {model}
        </span>
        <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
      </HeaderPill>
    );
  }

  return (
    <UpsertModelFormDialog
      action="create"
      projectId={projectId}
      prefilledModelData={{
        modelName: model,
        prices:
          usageDetails && Object.keys(usageDetails).length > 0
            ? Object.keys(usageDetails)
                .filter((key) => key !== "total")
                .reduce(
                  (acc, key) => {
                    acc[key] = 0.000001;
                    return acc;
                  },
                  {} as Record<string, number>,
                )
            : undefined,
      }}
      className="cursor-pointer"
    >
      <HeaderPill variant="display" title={`Create model ${model}`}>
        model <HeaderPillValue>{model}</HeaderPillValue>
        <PlusCircle className="h-3 w-3" />
      </HeaderPill>
    </UpsertModelFormDialog>
  );
}
