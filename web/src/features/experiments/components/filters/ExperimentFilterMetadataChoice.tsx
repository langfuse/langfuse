import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { PopoverController } from "@/src/components/ui/popover";
import { ExperimentFilterChoiceLabel } from "./ExperimentFilterChoiceLabel";
import { ExperimentFilterMetadataPopup } from "./ExperimentFilterMetadataPopup";
import { type ExperimentFilterCreationChoice } from "./experimentFilterCreationChoices";
import { type MetadataFilterColumn } from "./experimentFilterTypes";

export function ExperimentFilterMetadataChoice({
  column,
  choice,
  onAdd,
  portalContainer,
}: ExperimentFilterMetadataChoiceProps) {
  function renderTrigger({
    Trigger,
  }: Parameters<ComponentProps<typeof PopoverController>["children"]>[0]) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-md border p-2">
        <Trigger asChild>
          <Button text={choice.label} variant="ghost" size="sm" />
        </Trigger>
        <ExperimentFilterChoiceLabel choice={choice} />
      </div>
    );
  }
  function renderContent({
    closePopover,
  }: Parameters<ComponentProps<typeof PopoverController>["renderContent"]>[0]) {
    return (
      <ExperimentFilterMetadataPopup
        column={column}
        onAdd={onAdd}
        onClose={closePopover}
      />
    );
  }
  return (
    <PopoverController
      align="start"
      contentClassName="ph-no-capture w-72"
      disabled={false}
      modal={false}
      portalContainer={portalContainer}
      renderContent={renderContent}
    >
      {renderTrigger}
    </PopoverController>
  );
}

type ExperimentFilterMetadataChoiceProps = {
  column: MetadataFilterColumn;
  choice: ExperimentFilterCreationChoice;
  onAdd: (filter: FilterState[number]) => void;
  portalContainer: HTMLElement | null;
};
