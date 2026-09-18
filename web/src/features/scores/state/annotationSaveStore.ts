import { createStore } from "zustand/vanilla";
import type { AnnotationScoreFormData } from "@/src/features/scores/types";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";

export function createAnnotationSaveStore(
  initialFields: AnnotationScoreFormData[],
) {
  return createStore(() => ({
    pending: 0,
    failed: false,
    saved: false,
    confirmedFields: new Map(
      initialFields.map((field) => [
        annotationFieldKey(field),
        { field, sequence: 0 },
      ]),
    ),
  }));
}

export function hasChangedAnnotationValue(
  field: AnnotationScoreFormData,
  confirmed: AnnotationScoreFormData | undefined,
) {
  return (
    (field.value ?? null) !== (confirmed?.value ?? null) ||
    (field.stringValue ?? "") !== (confirmed?.stringValue ?? "") ||
    (field.comment ?? "") !== (confirmed?.comment ?? "")
  );
}
