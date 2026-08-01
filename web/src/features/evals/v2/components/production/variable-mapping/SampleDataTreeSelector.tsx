import { type PathSegment } from "@/src/features/evals/v2/lib/jsonPathSegments";
import { SampleDataTreeSelector as SampleDataTreeSelectorView } from "@/src/features/evals/v2/components/VariableMappingTree";

/** Selects one sample-observation field or nested path for a prompt variable. */
export function SampleDataTreeSelector({
  variable,
  currentColumnId,
  currentSegments,
  sourceObject,
  onSelect,
}: {
  variable: string;
  currentColumnId: string | null;
  currentSegments: PathSegment[] | null;
  sourceObject: Record<string, unknown>;
  onSelect: (columnId: string, segments: PathSegment[]) => void;
}) {
  return (
    <SampleDataTreeSelectorView
      variable={variable}
      currentColumnId={currentColumnId}
      currentSegments={currentSegments}
      sourceObject={sourceObject}
      onSelect={onSelect}
    />
  );
}
