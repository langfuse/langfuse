import { createContext, useContext } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/src/components/ui/accordion";
import { Checkbox } from "@/src/components/ui/checkbox";

interface ControlsContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ControlsContext = createContext<ControlsContextType | null>(null);

export function DataTableControlsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useLocalStorage("data-table-controls", true);

  return (
    <ControlsContext.Provider value={{ open, setOpen }}>
      <div
        // REMINDER: access the data-expanded state with tailwind via `group-data-[expanded=true]/controls:block`
        className="group/controls contents"
        data-expanded={open}
      >
        {children}
      </div>
    </ControlsContext.Provider>
  );
}

export function useDataTableControls() {
  const context = useContext(ControlsContext);

  if (!context) {
    throw new Error(
      "useDataTableControls must be used within a DataTableControlsProvider",
    );
  }

  return context as ControlsContextType;
}

interface DataTableControlsProps {
  children: React.ReactNode;
}

export function DataTableControls({ children }: DataTableControlsProps) {
  return (
    <div
      className={cn(
        "hidden h-full w-full border-r bg-background sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b px-4 pb-3 pt-4">
          <h2 className="text-sm font-medium">Filters</h2>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-4 pb-4 pt-3">
          <Accordion
            type="multiple"
            className="w-full"
            defaultValue={["environment"]}
          >
            {children}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

interface FilterAttributeProps {
  label: string;
  facet?: number;
  children: React.ReactNode;
  value: string;
}

export function FilterAttribute({
  label,
  facet,
  children,
  value,
}: FilterAttributeProps) {
  return (
    <AccordionItem value={value} className="border-none">
      <AccordionTrigger className="py-1.5 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
        <span>{label}</span>
      </AccordionTrigger>
      <AccordionContent className="py-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function FilterValueCheckbox({
  id,
  label,
  count,
  checked = false,
  onCheckedChange,
}: FilterValueCheckboxProps) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="text-xs">
        {label}
      </label>
    </div>
  );
}

export function DataTableControlsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
