import { NoData } from "../NoData";
import { type ReactNode } from "react";

type TableHeaders = ReactNode[];
type TableRows = ReactNode[][];
type DashboardTableProps = {
  headers: TableHeaders;
  rows: TableRows;
  children?: ReactNode;
};

export const DashboardTable = ({
  headers,
  rows,
  children,
}: DashboardTableProps) => {
  return (
    <>
      {children}
      {rows.length > 0 ? (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-300 animate-in animate-out">
                <thead>
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="whitespace-nowrap py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-gray-900 sm:pl-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap py-2 pl-3 pr-2 text-xs text-gray-500 sm:pl-0"
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
    </>
  );
};
