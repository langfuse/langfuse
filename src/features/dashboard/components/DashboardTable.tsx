import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { type ReactNode } from "react";
import { DashboardCard } from "./DashboardCard";

type TableHeaders = string[];
type TableRows = string[][];
type DashboardTableProps = {
  title: string;
  description?: string;
  isLoading: boolean;
  headers: TableHeaders;
  rows: TableRows;
  children?: ReactNode;
};

export const DashboardTable = ({
  title,
  description,
  isLoading,
  headers,
  rows,
  children,
}: DashboardTableProps) => {
  return (
    <DashboardCard
      title={title}
      description={description}
      isLoading={isLoading}
    >
      {children}
      <Table className="mt-4 h-72">
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} className="w-[100px]">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.reduce((acc, curr) => acc + curr, "")}>
              {row.map((cell) => (
                <TableCell key={cell} className="font-medium">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashboardCard>
  );
};
