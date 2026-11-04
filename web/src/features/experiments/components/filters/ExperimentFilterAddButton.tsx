import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { Plus } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { PopoverController } from "@/src/components/ui/popover";
import { ExperimentFilterCreationPopup } from "./ExperimentFilterCreationPopup";
import { type ExperimentFilterOptions } from "./experimentFilterTypes";

export function ExperimentFilterAddButton({
  options,
  optionsError,
  onAdd,
  portalContainer,
}: ExperimentFilterAddButtonProps) {
  function renderContent({
    closePopover,
  }: Parameters<ComponentProps<typeof PopoverController>["renderContent"]>[0]) {
    return (
      <ExperimentFilterCreationPopup
        options={options}
        optionsError={optionsError}
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

function renderTrigger({
  Trigger,
}: Parameters<ComponentProps<typeof PopoverController>["children"]>[0]) {
  return (
    <Trigger asChild>
      <Button text="Add filter" icon={Plus} variant="secondary" size="sm" />
    </Trigger>
  );
}

type ExperimentFilterAddButtonProps = {
  options: ExperimentFilterOptions | undefined;
  optionsError: string | null;
  onAdd: (filter: FilterState[number]) => void;
  portalContainer: HTMLElement | null;
};
