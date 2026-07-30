import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Braces } from "lucide-react";

/**
 * Controls how I/O cells render their value:
 * - "json": multi-line, syntax-highlighted JSON tree (IOTableCell singleLine=false)
 * - "text": compact single-line string preview (IOTableCell singleLine=true)
 */
export type IoRenderMode = "json" | "text";

const renderModeOptions = [
  { id: "json", label: "JSON" },
  { id: "text", label: "Plain text" },
] as const;

export function useIoRenderModeLocalStorage(
  tableName: string,
  defaultValue: IoRenderMode,
) {
  const [ioRenderMode, setIoRenderMode, clearIoRenderMode] =
    useLocalStorage<IoRenderMode>(`${tableName}IoRenderMode`, defaultValue);

  return [ioRenderMode, setIoRenderMode, clearIoRenderMode] as const;
}

export const DataTableIoRenderModeSwitch = ({
  ioRenderMode,
  setIoRenderMode,
}: {
  ioRenderMode: IoRenderMode;
  setIoRenderMode: (e: IoRenderMode) => void;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Render I/O as">
          <Braces className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent>
          <DropdownMenuLabel>Render I/O as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {renderModeOptions.map(({ id, label }) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={ioRenderMode === id}
              onClick={(e) => {
                // Keep the menu open so the user can compare options.
                e.preventDefault();
                setIoRenderMode(id);
              }}
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
