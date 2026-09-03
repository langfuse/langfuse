/* eslint-disable @repo/no-null-render */
/**
 * Model badge for ObservationDetailView
 * Handles linked models (with external link) and unlinked models (with create form)
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { ExternalLinkIcon, PlusCircle } from "lucide-react";
import Link from "next/link";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialog";

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
      <Link
        href={`/project/${projectId}/settings/models/${internalModelId}`}
        className="inline-flex"
        title="View model details"
      >
        <Badge text={model} trailingIcon={ExternalLinkIcon} />
      </Link>
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
    >
      <button type="button" className="inline-flex cursor-pointer">
        <Badge text={model} trailingIcon={PlusCircle} />
      </button>
    </UpsertModelFormDialog>
  );
}
