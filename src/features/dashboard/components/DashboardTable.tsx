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
import { PersonIcon } from "@radix-ui/react-icons";
import { Flex, Text } from "@tremor/react";
import { twMerge } from "tailwind-merge";

type TableHeaders = ReactNode[];
type TableRows = ReactNode[][];
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
  console.log(headers, rows);
  return (
    <DashboardCard
      title={title}
      description={description}
      isLoading={isLoading}
    >
      {children}
      {rows.length > 0 ? (
        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300 animate-in animate-out">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="whitespace-nowrap py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.map((row) => (
                    <tr key={"1"}>
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap py-2 pl-4 pr-3 text-sm text-gray-500 sm:pl-0"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <NoData noDataText="No data" />
      )}
    </DashboardCard>
  );
};

interface NoDataProps {
  noDataText?: string;
}
const NoData = ({ noDataText = "No data" }: NoDataProps) => {
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      className="h-5/6 w-full rounded-tremor-default border border-dashed border-tremor-border"
    >
      <Text className="text-tremor-content">{noDataText}</Text>
    </Flex>
  );
};
