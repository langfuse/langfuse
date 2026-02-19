/**
 * Model badge for ObservationDetailView
 * Handles linked models (with external link) and unlinked models (with create form)
 */

import { Badge } from "@/src/components/ui/badge";
import { ExternalLinkIcon, PlusCircle } from "lucide-react";
import Link from "next/link";
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
      <Badge>
        <Link
          href={`/project/${projectId}/settings/models/${internalModelId}`}
          className="flex items-center"
          title="View model details"
        >
          <span className="truncate">{model}</span>
          <ExternalLinkIcon className="ml-1 h-3 w-3" />
        </Link>
      </Badge>
    );
  }

  // Unlinked model - show create form dialog
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
      <Badge variant="tertiary" className="flex items-center gap-1">
        <span>{model}</span>
        <PlusCircle className="h-3 w-3" />
      </Badge>
    </UpsertModelFormDialog>
  );
}
