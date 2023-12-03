import React, {
  useCallback,
  type Dispatch,
  type SetStateAction,
  useRef,
  useState,
  useEffect,
} from "react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import { type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { ChevronDownIcon } from "lucide-react";

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
}

const useOutsideClick = (
  callback: () => void,
  toggleRef: React.RefObject<HTMLElement>,
) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(event.target as Node) &&
        toggleRef.current &&
        !toggleRef.current.contains(event.target as Node)
      ) {
        console.log(event.target);
        callback();
      }
    };

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [callback, toggleRef]);

  return ref;
};
export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
}: DataTableColumnVisibilityFilterProps<TData, TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const handleClickOutside = () => {
    setIsOpen(false);
  };

  const ref = useOutsideClick(handleClickOutside, toggleButtonRef);

  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibility((old) => ({
        ...old,
        [columnId]: !old[columnId],
      }));
    },
    [setColumnVisibility],
  );

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenuTrigger onClick={() => setIsOpen(!isOpen)} asChild>
        <Button variant="outline" className="ml-auto" ref={toggleButtonRef}>
          Select Columns
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" ref={ref}>
        {columns.map(
          (column, index) =>
            "accessorKey" in column &&
            column.enableHiding && (
              <DropdownMenuCheckboxItem
                key={index}
                className="capitalize"
                checked={columnVisibility[column.accessorKey]}
                onCheckedChange={() =>
                  toggleColumn(column.accessorKey.toString())
                }
              >
                {column.accessorKey.toString()}
              </DropdownMenuCheckboxItem>
            ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
