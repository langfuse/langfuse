import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { getAllModels } from "@/src/features/dashboard/components/hooks";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";

export const ModelSelectorPopover = ({
  allModels,
  selectedModels,
  setSelectedModels,
  buttonText,
  isAllSelected,
  handleSelectAll,
}: {
  allModels: { model: string }[];
  selectedModels: string[];
  setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>;
  buttonText: string;
  isAllSelected: boolean;
  handleSelectAll: () => void;
}) => {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-56 justify-between"
        >
          {buttonText}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <InputCommand>
          <InputCommandInput placeholder={t("dashboard.searchModels")} />
          <InputCommandEmpty>{t("dashboard.noModelFound")}</InputCommandEmpty>
          <InputCommandGroup>
            <InputCommandItem onSelect={handleSelectAll}>
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  isAllSelected ? "opacity-100" : "opacity-0",
                )}
              />
              <span>
                <p className="font-semibold">{t("dashboard.selectAll")}</p>
              </span>
            </InputCommandItem>
            <InputCommandSeparator className="my-1" />
            <InputCommandList>
              {allModels.map((model) => (
                <InputCommandItem
                  key={model.model}
                  onSelect={() => {
                    setSelectedModels((prev) =>
                      prev.includes(model.model)
                        ? prev.filter((m) => m !== model.model)
                        : [...prev, model.model],
                    );
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedModels.includes(model.model)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {!model.model || model.model === "" ? (
                    <i>{t("dashboard.none")}</i>
                  ) : (
                    model.model
                  )}
                </InputCommandItem>
              ))}
            </InputCommandList>
          </InputCommandGroup>
        </InputCommand>
      </PopoverContent>
    </Popover>
  );
};

export const useModelSelection = (
  projectId: string,
  globalFilterState: FilterState,
  fromTimestamp: Date,
  toTimestamp: Date,
) => {
  const { t } = useTranslation("common");
  const allModels = getAllModels(
    projectId,
    globalFilterState,
    fromTimestamp,
    toTimestamp,
  );

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [firstAllModelUpdate, setFirstAllModelUpdate] = useState(true);

  const isAllSelected = selectedModels.length === allModels.length;

  const buttonText = isAllSelected
    ? t("dashboard.allModels")
    : t("dashboard.selected", { count: selectedModels.length });

  const handleSelectAll = () => {
    setSelectedModels(isAllSelected ? [] : [...allModels.map((m) => m.model)]);
  };

  useEffect(() => {
    if (firstAllModelUpdate && allModels.length > 0) {
      setSelectedModels(allModels.slice(0, 10).map((model) => model.model));
      setFirstAllModelUpdate(false);
    }
  }, [allModels, firstAllModelUpdate]);

  return {
    allModels,
    selectedModels,
    setSelectedModels,
    isAllSelected,
    buttonText,
    handleSelectAll,
  };
};
