/* eslint-disable @repo/no-null-render */
/**
 * Model text for ObservationDetailView. Always a quiet external link: linked
 * models go to their model definition, unlinked models to the model-settings
 * list (which owns "create a definition" — the inline create dialog that used
 * to open from here was a surprising click target in the header).
 */

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

export function ModelBadge({
  model,
  internalModelId,
  projectId,
}: {
  model: string | null;
  internalModelId: string | null;
  projectId: string;
}) {
  if (!model) return null;

  const href = internalModelId
    ? `/project/${projectId}/settings/models/${internalModelId}`
    : `/project/${projectId}/settings/models`;

  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex max-w-48 items-center gap-1 text-xs hover:underline"
      title={
        internalModelId
          ? "View model details"
          : "Model has no pricing definition — view model settings"
      }
    >
      <span className="truncate" title={model}>
        {model}
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}
