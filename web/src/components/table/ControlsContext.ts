import { createContext, type Dispatch, type SetStateAction } from "react";

interface ControlsContextType {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  tableName?: string;
  /** On mobile the panel is a bottom sheet, so its header shows a close button. */
  isMobile: boolean;
}

export const ControlsContext = createContext<ControlsContextType | null>(null);
