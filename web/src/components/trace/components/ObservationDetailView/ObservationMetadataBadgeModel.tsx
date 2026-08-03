/**
 * Model overview-grid row for ObservationDetailView.
 * Handles linked models (link to model settings) and unlinked models
 * (opens the create-model form dialog).
 */

import { ArrowUpRight, PlusCircle } from "lucide-react";
import Link from "next/link";
import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog";

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

  // Linked model - show link to model settings
  if (internalModelId) {
    return (
      <OverviewRow label="Model" title={model}>
        <Link
          href={`/project/${projectId}/settings/models/${internalModelId}`}
          className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
          title="View model details"
        >
          <span className="truncate" title={model}>
            {model}
          </span>
          <ArrowUpRight className="h-3 w-3 shrink-0" />
        </Link>
      </OverviewRow>
    );
  }

  // Unlinked model - show create form dialog
  return (
    <OverviewRow label="Model" title={model}>
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
        <span className="hover:text-primary inline-flex max-w-full cursor-pointer items-center gap-0.5">
          <span className="truncate" title={model}>
            {model}
          </span>
          <PlusCircle className="h-3 w-3 shrink-0" />
        </span>
      </UpsertModelFormDialog>
    </OverviewRow>
  );
}
