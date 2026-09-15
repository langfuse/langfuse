/**
 * Model reference link for the observation detail header.
 *
 * Styled like the session/user references in the trace summary strip
 * (`REFERENCE_LINK_CLASS`: quiet muted text, no pill, trailing icon). A model
 * the project has a definition for links to that definition; a model it does
 * not know opens the add-model dialog, prefilled with the model name and a
 * price row per usage key on the observation.
 */

import { ArrowUpRight, PlusCircle } from "lucide-react";
import Link from "next/link";

import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialog";
import { REFERENCE_LINK_CLASS } from "@/src/features/traces/components/TraceMetadataBadges";

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
  // Known model: reference link to its definition, like Session and User.
  if (internalModelId) {
    return (
      <Link
        href={`/project/${projectId}/settings/models/${internalModelId}`}
        className={REFERENCE_LINK_CLASS}
        title="View model details"
      >
        <span className="truncate" title={model}>
          {model}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
      </Link>
    );
  }

  // Unknown model: same quiet affordance, but it opens the add-model dialog.
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
      <button
        type="button"
        className={`${REFERENCE_LINK_CLASS} cursor-pointer`}
        title="Add model definition"
      >
        <span className="truncate" title={model}>
          {model}
        </span>
        <PlusCircle className="h-3 w-3 shrink-0" aria-hidden />
      </button>
    </UpsertModelFormDialog>
  );
}
