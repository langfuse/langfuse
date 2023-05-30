import { type Column } from "@tanstack/react-table";
import { FilterIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "./ui/input";
import { useState } from "react";

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  onFilter: (value: string) => void;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  onFilter,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const [filterValue, setFilterValue] = useState("");

  if (!column.getCanFilter()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const filterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFilterValue(value);
    onFilter(value);
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
          >
            <span>{title}</span>
            <FilterIcon className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Email equals</DropdownMenuItem>
          <DropdownMenuItem>
            <div className="flex items-center py-4">
              <Input
                placeholder="Filter name"
                value={filterValue}
                className="max-w-sm"
                onChange={filterChange}
              />
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
