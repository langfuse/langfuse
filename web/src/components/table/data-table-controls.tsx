import { createContext, useContext } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";

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
        className="group/controls"
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
        "hidden h-full w-full border-r bg-background p-4 sm:block sm:min-w-52 sm:max-w-52 md:min-w-64 md:max-w-64",
        "group-data-[expanded=false]/controls:hidden",
      )}
    >
      <div className="space-y-6">{children}</div>
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
