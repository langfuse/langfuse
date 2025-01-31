import { createContext, useContext, useState, type ReactNode } from "react";

interface CommandMenuContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandMenuContext = createContext<CommandMenuContextType | undefined>(
  undefined,
);

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}
    </CommandMenuContext.Provider>
  );
}

export function useCommandMenu() {
  const context = useContext(CommandMenuContext);
  if (context === undefined) {
    throw new Error("useCommandMenu must be used within a CommandMenuProvider");
  }
  return context;
}
