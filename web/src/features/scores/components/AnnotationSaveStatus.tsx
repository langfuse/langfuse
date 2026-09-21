import { useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { useStore } from "zustand";
import { Check } from "lucide-react";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import type { AnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import type { AnnotateFormSchemaType } from "@/src/features/scores/types";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import { hasChangedAnnotationValue } from "@/src/features/scores/state/annotationSaveStore";

export function AnnotationSaveStatus({
  form,
  actions,
}: {
  form: UseFormReturn<AnnotateFormSchemaType>;
  actions: AnnotationFormActions;
}) {
  const fields = useWatch({ control: form.control, name: "scoreData" });
  const { errors } = useFormState({ control: form.control, name: "scoreData" });
  const state = useStore(actions.saveStore);
  const dirty = fields.some((field) =>
    hasChangedAnnotationValue(
      { ...field, id: field.id ?? null },
      state.confirmedFields.get(annotationFieldKey(field))?.field,
    ),
  );
  let status: "idle" | "saving" | "saved" | "error" = "idle";
  if (state.pending) status = "saving";
  else if (state.failed) status = "error";
  else if (state.saved && !dirty && !errors.scoreData) status = "saved";

  return (
    <>
      {status !== "idle" ? (
        <div
          role="status"
          aria-label="Score save status"
          className="flex items-center justify-end"
        >
          <div className="mr-1 items-center justify-center">
            {status === "saving" ? <Spinner size="xxs" /> : null}
            {status === "saved" ? <Check className="h-3 w-3" /> : null}
          </div>
          <span className="text-muted-foreground text-xs">
            {
              { saving: "Saving…", saved: "Saved", error: "Could not save" }[
                status
              ]
            }
          </span>
        </div>
      ) : null}
    </>
  );
}
