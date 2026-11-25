import { useState, type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { ControlledFilterBuilderEditor } from "../ControlledFilterBuilderEditor/ControlledFilterBuilderEditor";

type ControlledEditorProps = ComponentProps<
  typeof ControlledFilterBuilderEditor
>;

export function FilterBuilderEditor({
  initialFilters,
  onFiltersChange,
  ...props
}: Pick<
  ControlledEditorProps,
  | "columns"
  | "columnsHiddenUnlessSelected"
  | "operators"
  | "disabled"
  | "onAnalyticsEvent"
  | "getColumnNotice"
> & {
  onFiltersChange: (filters: FilterState) => void;
  /** Seed for this editing session. Remount to reset an in-progress draft. */
  initialFilters: FilterState;
}) {
  const [draft, setDraft] = useState<ControlledEditorProps["draft"]>(
    initialFilters.length > 0 ? initialFilters : [{}],
  );
  const [optionLayer, setOptionLayer] = useState<HTMLDivElement | null>(null);

  return (
    <div className="ph-no-capture contents">
      <PopoverLayerProvider container={optionLayer}>
        <ControlledFilterBuilderEditor
          {...props}
          draft={draft}
          onDraftChange={(next, { validFilters }) => {
            setDraft(next);
            onFiltersChange(validFilters);
          }}
        />
      </PopoverLayerProvider>
      <div ref={setOptionLayer} className="contents" />
    </div>
  );
}
