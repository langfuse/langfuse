import { useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { useStore } from "zustand";
import { Check } from "lucide-react";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import type { AnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import type { AnnotateFormSchemaType } from "@/src/features/scores/types";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import { hasChangedAnnotationValue } from "@/src/features/scores/state/annotationSaveStore";
import { cn } from "@/src/utils/tailwind";

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
    <div className="grid items-center justify-items-end">
      {(["saving", "saved", "error"] as const).map((itemStatus) => {
        const active = status === itemStatus;
        return (
          <div
            key={itemStatus}
            role={active ? "status" : undefined}
            aria-label={active ? "Score save status" : undefined}
            aria-hidden={!active}
            className={cn(
              "col-start-1 row-start-1 flex items-center justify-end gap-1 text-xs transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
              active
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-0.5 opacity-0",
            )}
          >
            <span className="flex size-3 items-center justify-center">
              {itemStatus === "saving" && active ? (
                <Spinner size="xxs" />
              ) : null}
              {itemStatus === "saved" ? <Check className="size-3" /> : null}
            </span>
            <span className="text-muted-foreground">
              {
                {
                  saving: "Saving…",
                  saved: "Saved",
                  error: "Could not save",
                }[itemStatus]
              }
            </span>
          </div>
        );
      })}
    </div>
  );
}
