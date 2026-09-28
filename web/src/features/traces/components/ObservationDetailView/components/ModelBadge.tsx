/**
 * Model badge for ObservationDetailView
 * Handles linked models (with external link) and unlinked models (with create form)
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { UpsertModelFormDialogController } from "@/src/features/models";

export function ModelBadge({
  model,
  internalModelId,
  projectId,
  usageDetails,
}: {
  model: string;
  internalModelId: string | null;
  projectId: string;
  usageDetails: Record<string, number> | undefined;
}) {
  // Linked model - show link to model settings
  if (internalModelId) {
    return (
      <Link
        href={`/project/${projectId}/settings/models/${internalModelId}`}
        className="inline-flex"
        title="View model details"
      >
        <Badge color="ghost" text={model} trailingIcon={ExternalLinkIcon} />
      </Link>
    );
  }

  // Unlinked model - show create form dialog
  return (
    <UpsertModelFormDialogController
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
      {({ openDialog }) => (
        <button
          type="button"
          title="Create model definition"
          className="inline-flex cursor-pointer"
          onClick={openDialog}
        >
          <Badge color="ghost" interactive text={model} />
        </button>
      )}
    </UpsertModelFormDialogController>
  );
}
