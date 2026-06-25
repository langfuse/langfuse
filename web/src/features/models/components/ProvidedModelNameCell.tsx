import { PlusCircle } from "lucide-react";
import TableIdOrName from "@/src/components/table/table-id";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog";

/**
 * Renders the "Provided Model Name" cell shared by the generations and events
 * tables. When the model resolves to a definition it is a plain name; when it
 * does not, the name carries a trailing "add model definition" affordance.
 *
 * Both states render the name through {@link TableIdOrName} so typography and
 * vertical alignment stay identical row-to-row — the trailing icon is a
 * `shrink-0` adornment that never shifts the text baseline. The trigger is a
 * `role="button"` and stops click propagation so opening the dialog does not
 * also open the table's peek view.
 */
export function ProvidedModelNameCell({
  modelName,
  modelId,
  projectId,
  usageDetails,
}: {
  modelName: string | undefined;
  modelId: string | undefined;
  projectId: string;
  usageDetails: Record<string, number>;
}) {
  if (!modelName) return null;

  // Both states wrap the name in the same inline-flex so the text sits at an
  // identical baseline whether or not the trailing affordance is present.
  if (modelId) {
    return (
      <span className="inline-flex max-w-full items-center">
        <TableIdOrName value={modelName} className="min-w-0" />
      </span>
    );
  }

  const prices =
    Object.keys(usageDetails).length > 0
      ? Object.keys(usageDetails)
          .filter((key) => key !== "total")
          .reduce(
            (acc, key) => {
              acc[key] = 0.000001;
              return acc;
            },
            {} as Record<string, number>,
          )
      : undefined;

  return (
    <UpsertModelFormDialog
      action="create"
      projectId={projectId}
      prefilledModelData={{ modelName, prices }}
      className="cursor-pointer"
    >
      {/*
        Native <button> (not a styled span): DialogTrigger's Slot only forwards
        onClick, so Enter/Space activation must come from the element itself.
        A real button also matches the table row's interactive-skip selector, so
        activating it never opens the row's peek view.
      */}
      <button
        type="button"
        title={`Add a model definition for "${modelName}"`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 text-left"
      >
        <TableIdOrName value={modelName} className="min-w-0" />
        <PlusCircle className="h-3.5 w-3.5 shrink-0" />
      </button>
    </UpsertModelFormDialog>
  );
}
